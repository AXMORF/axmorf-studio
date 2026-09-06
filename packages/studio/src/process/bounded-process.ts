import { execFileSync, spawn } from "node:child_process";
import { closeSync, openSync, writeSync } from "node:fs";
import { registerOwnedProcess } from "./process-ownership";

export type BoundedProcessOptions = Readonly<{
  cwd?: string;
  timeoutMs?: number;
  logPath?: string;
  trackOwnership?: boolean;
}>;

export class BoundedProcessError extends Error {
  readonly code = "bounded-process-failed";
  constructor(
    cause: unknown,
    readonly status: number,
    readonly stdout: string,
    readonly stderr: string,
    readonly cleanupError?: unknown,
  ) {
    const primary = cause instanceof Error ? cause.message : String(cause);
    const cleanup =
      cleanupError === undefined || cleanupError === cause
        ? ""
        : ` Cleanup failed: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`;
    super(
      `${primary}${cleanup} Exit status: ${status}. ${stderr.slice(-2048)} ${stdout.slice(-2048)}`.trim(),
      { cause },
    );
  }
}

export const exitedProcessGroupHasNoWriters = (
  groupId: number,
  readSnapshot: () => string = () =>
    execFileSync("/bin/ps", ["-axo", "pgid=,stat="], {
      encoding: "utf8",
      timeout: 1000,
      maxBuffer: 4 * 1024 * 1024,
    }),
): boolean => {
  try {
    const lines = readSnapshot().trim().split("\n");
    if (lines.length === 0 || lines[0] === "") return false;
    for (const line of lines) {
      const match = /^\s*([0-9]+)\s+([A-Za-z?][A-Za-z0-9+<>=-]*)\s*$/u.exec(
        line,
      );
      if (match === null) return false;
      const observedGroup = Number(match[1]);
      if (!Number.isSafeInteger(observedGroup)) return false;
      if (observedGroup === groupId && !match[2]!.startsWith("Z")) return false;
    }
    return true;
  } catch {
    return false;
  }
};

type SignalProcess = (pid: number, signal: NodeJS.Signals | 0) => boolean;

export const runBoundedProcess = async (
  command: string,
  args: readonly string[],
  options: BoundedProcessOptions = {},
  dependencies: Readonly<{
    registerOwnedProcess?: typeof registerOwnedProcess;
    signalProcess?: SignalProcess;
    exitedGroupHasNoWriters?: typeof exitedProcessGroupHasNoWriters;
  }> = {},
): Promise<Readonly<{ status: number; stdout: string; stderr: string }>> => {
  const timeoutMs = options.timeoutMs ?? 15 * 60_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error("Process deadline must be a positive integer.");
  }
  const signalProcess: SignalProcess =
    dependencies.signalProcess ?? process.kill;
  const log =
    options.logPath === undefined
      ? undefined
      : openSync(options.logPath, "a", 0o600);
  try {
    const tracking =
      options.trackOwnership === true
        ? await (dependencies.registerOwnedProcess ?? registerOwnedProcess)({
            rootDir: options.cwd ?? process.cwd(),
          })
        : undefined;
    return await new Promise((resolve, reject) => {
      const child = spawn(command, [...args], {
        cwd: options.cwd,
        shell: false,
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      let interrupted: string | undefined;
      let lifecycleError: unknown;
      let cleanupError: unknown;
      let settled = false;
      let closeStatus: number | null | undefined;
      let killTimer: ReturnType<typeof setTimeout> | undefined;
      const terminate = (signal: NodeJS.Signals): boolean => {
        if (child.pid === undefined) return true;
        const target = process.platform === "win32" ? child.pid : -child.pid;
        try {
          signalProcess(target, signal);
          return true;
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          if (code === "ESRCH") return true;
          // Darwin may report EPERM while an exiting group contains zombies.
          // Recheck without a signal; genuine permission errors still fail.
          if (code === "EPERM") {
            let canInspectExitedGroup = true;
            try {
              signalProcess(target, 0);
            } catch (probeError) {
              const probeCode = (probeError as NodeJS.ErrnoException).code;
              if (probeCode === "ESRCH") return true;
              canInspectExitedGroup = probeCode === "EPERM";
            }
            // A successful signal-zero probe is only an instantaneous view.
            // At close, one later snapshot can prove the group has no writers.
            if (
              canInspectExitedGroup &&
              process.platform === "darwin" &&
              closeStatus !== undefined
            ) {
              try {
                if (
                  (
                    dependencies.exitedGroupHasNoWriters ??
                    exitedProcessGroupHasNoWriters
                  )(child.pid)
                )
                  return true;
              } catch {
                /* Unknown inspection authority keeps the original failure. */
              }
            }
          }
          cleanupError ??= new Error(
            `Could not send ${signal} to owned ${process.platform === "win32" ? "process" : "process group"} ${child.pid} (target ${target}): ${error instanceof Error ? error.message : String(error)}`,
            { cause: error },
          );
          return false;
        }
      };
      const cleanup = () => {
        clearTimeout(timer);
        clearTimeout(killTimer);
        process.removeListener("exit", onExit);
        process.removeListener("SIGTERM", onTerm);
        process.removeListener("SIGINT", onInterrupt);
      };
      const finish = (status: number | null, detach = false) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (detach) {
          // Permission failure cannot leave the controlling promise waiting for
          // an unkillable writer. Its ownership record remains for diagnosis.
          child.stdout.destroy();
          child.stderr.destroy();
          child.unref();
        }
        const cause =
          lifecycleError ??
          (interrupted === undefined
            ? undefined
            : new Error(`Media process interrupted by ${interrupted}.`)) ??
          (timedOut
            ? new Error(`Media process timed out after ${timeoutMs} ms.`)
            : undefined) ??
          cleanupError;
        if (cause !== undefined) {
          const error = new BoundedProcessError(
            cause,
            status ?? -1,
            stdout,
            stderr,
            cleanupError,
          );
          try {
            if (log !== undefined) writeSync(log, `\n${error.message}\n`);
          } catch (logError) {
            reject(new AggregateError([error, logError], error.message));
            return;
          }
          reject(error);
        } else resolve({ status: status ?? -1, stdout, stderr });
      };
      const onExit = () => {
        terminate("SIGKILL");
      };
      const onTerm = () => {
        interrupted = "SIGTERM";
        if (!terminate("SIGKILL")) finish(child.exitCode, true);
      };
      const onInterrupt = () => {
        interrupted = "SIGINT";
        if (!terminate("SIGKILL")) finish(child.exitCode, true);
      };
      process.once("exit", onExit);
      process.once("SIGTERM", onTerm);
      process.once("SIGINT", onInterrupt);
      const registered = Promise.resolve().then(() =>
        child.pid === undefined
          ? tracking?.spawnFailed()
          : tracking?.started({
              pid: child.pid,
              processGroup: process.platform !== "win32",
            }),
      );
      void registered.catch((error: unknown) => {
        if (settled) return;
        lifecycleError ??= error;
        if (!terminate("SIGKILL")) finish(child.exitCode, true);
      });
      const timer = setTimeout(() => {
        timedOut = true;
        if (closeStatus !== undefined) {
          finish(closeStatus);
          return;
        }
        if (!terminate("SIGTERM")) {
          finish(child.exitCode, true);
          return;
        }
        killTimer = setTimeout(() => {
          terminate("SIGKILL");
          finish(child.exitCode, true);
        }, 2_000);
      }, timeoutMs);
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      const appendLog = (chunk: string) => {
        if (settled) return;
        try {
          if (log !== undefined) writeSync(log, chunk);
        } catch (error) {
          lifecycleError ??= error;
          if (!terminate("SIGKILL")) finish(child.exitCode, true);
        }
      };
      child.stdout.on("data", (chunk: string) => {
        stdout = (stdout + chunk).slice(-1_048_576);
        appendLog(chunk);
      });
      child.stderr.on("data", (chunk: string) => {
        stderr = (stderr + chunk).slice(-1_048_576);
        appendLog(chunk);
      });
      child.on("error", (error) => {
        lifecycleError ??= error;
      });
      child.on("close", (status) => {
        closeStatus = status;
        if (settled) return;
        terminate("SIGKILL");
        if (
          timedOut ||
          interrupted !== undefined ||
          cleanupError !== undefined
        ) {
          finish(status);
          return;
        }
        void registered.then(
          () => finish(status),
          (error: unknown) => {
            lifecycleError ??= error;
            finish(status);
          },
        );
      });
    });
  } finally {
    if (log !== undefined) closeSync(log);
  }
};

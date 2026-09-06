import { spawn } from "node:child_process";
import { closeSync, openSync, writeSync } from "node:fs";
import { registerOwnedProcess } from "./process-ownership";

export type BoundedProcessOptions = Readonly<{
  cwd?: string;
  timeoutMs?: number;
  logPath?: string;
  trackOwnership?: boolean;
}>;

export const runBoundedProcess = async (
  command: string,
  args: readonly string[],
  options: BoundedProcessOptions = {},
  dependencies: Readonly<{
    registerOwnedProcess: typeof registerOwnedProcess;
  }> = { registerOwnedProcess },
): Promise<Readonly<{ status: number; stdout: string; stderr: string }>> => {
  const timeoutMs = options.timeoutMs ?? 15 * 60_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error("Process deadline must be a positive integer.");
  }
  const log =
    options.logPath === undefined
      ? undefined
      : openSync(options.logPath, "a", 0o600);
  try {
    const tracking =
      options.trackOwnership === true
        ? await dependencies.registerOwnedProcess({
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
      let killTimer: ReturnType<typeof setTimeout> | undefined;
      const terminate = (signal: NodeJS.Signals) => {
        if (child.pid === undefined) return;
        try {
          if (process.platform === "win32") child.kill(signal);
          else process.kill(-child.pid, signal);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
        }
      };
      const onExit = () => terminate("SIGKILL");
      const onTerm = () => {
        interrupted = "SIGTERM";
        onExit();
      };
      const onInterrupt = () => {
        interrupted = "SIGINT";
        onExit();
      };
      process.once("exit", onExit);
      process.once("SIGTERM", onTerm);
      process.once("SIGINT", onInterrupt);
      const registered =
        child.pid === undefined
          ? tracking?.spawnFailed()
          : tracking?.started({
              pid: child.pid,
              processGroup: process.platform !== "win32",
            });
      void registered?.catch((error: unknown) => {
        lifecycleError = error;
        terminate("SIGKILL");
      });
      const timer = setTimeout(() => {
        timedOut = true;
        terminate("SIGTERM");
        killTimer = setTimeout(() => terminate("SIGKILL"), 2_000);
      }, timeoutMs);
      const cleanup = () => {
        clearTimeout(timer);
        clearTimeout(killTimer);
        process.removeListener("exit", onExit);
        process.removeListener("SIGTERM", onTerm);
        process.removeListener("SIGINT", onInterrupt);
      };
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout = (stdout + chunk).slice(-1_048_576);
        if (log !== undefined) writeSync(log, chunk);
      });
      child.stderr.on("data", (chunk: string) => {
        stderr = (stderr + chunk).slice(-1_048_576);
        if (log !== undefined) writeSync(log, chunk);
      });
      child.on("error", (error) => {
        lifecycleError = error;
      });
      child.on("close", async (status) => {
        // The CLI can exit before a browser descendant. Reap the owned group.
        terminate("SIGKILL");
        try {
          await registered;
        } catch (error) {
          cleanup();
          reject(error);
          return;
        }
        cleanup();
        if (lifecycleError !== undefined) {
          reject(lifecycleError);
        } else if (interrupted !== undefined) {
          reject(new Error(`Media process interrupted by ${interrupted}.`));
        } else if (timedOut) {
          const message = `Media process timed out after ${timeoutMs} ms. ${stderr.slice(-2048)}`;
          if (log !== undefined) writeSync(log, `\n${message}\n`);
          reject(new Error(message));
        } else resolve({ status: status ?? -1, stdout, stderr });
      });
    });
  } finally {
    if (log !== undefined) closeSync(log);
  }
};

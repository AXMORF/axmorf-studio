import { spawn } from "node:child_process";
import { mkdir, open } from "node:fs/promises";
import { dirname } from "node:path";

type WatcherChild = Readonly<{
  once: (
    event: "spawn" | "error",
    listener: ((error: Error) => void) | (() => void),
  ) => unknown;
  removeListener: (
    event: "spawn" | "error",
    listener: ((error: Error) => void) | (() => void),
  ) => unknown;
  unref: () => void;
}>;

type OpenLogResult = Readonly<{ fd: number; close: () => Promise<void> }>;

export const launchDetachedProductionWatcher = async ({
  rootDir,
  command,
  args,
  logPath,
  openLog = async (path: string): Promise<OpenLogResult> => {
    await mkdir(dirname(path), { recursive: true });
    return open(path, "ax", 0o600);
  },
  spawnChild = ((executable: string, childArgs: readonly string[], options) =>
    spawn(executable, [...childArgs], {
      ...options,
      stdio: [...options.stdio],
    })) as (
    executable: string,
    childArgs: readonly string[],
    options: Readonly<{
      cwd: string;
      detached: true;
      shell: false;
      stdio: readonly ["ignore", number, number];
    }>,
  ) => WatcherChild,
}: {
  readonly rootDir: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly logPath: string;
  readonly openLog?: (path: string) => Promise<OpenLogResult>;
  readonly spawnChild?: (
    executable: string,
    childArgs: readonly string[],
    options: Readonly<{
      cwd: string;
      detached: true;
      shell: false;
      stdio: readonly ["ignore", number, number];
    }>,
  ) => WatcherChild;
}) => {
  const log = await openLog(logPath);
  let child: WatcherChild;
  try {
    child = spawnChild(command, args, {
      cwd: rootDir,
      detached: true,
      shell: false,
      stdio: ["ignore", log.fd, log.fd],
    });
  } catch (error) {
    await log.close();
    throw error;
  }
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      child.removeListener("spawn", onSpawn);
      reject(error);
    };
    const onSpawn = () => {
      child.removeListener("error", onError);
      child.unref();
      resolve();
    };
    child.once("error", onError);
    child.once("spawn", onSpawn);
  }).finally(() => log.close());
};

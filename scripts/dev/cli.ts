import { spawn, type ChildProcess } from "node:child_process";
import { pathToFileURL } from "node:url";

import { resolvePackageBinCommand } from "../../packages/studio/src/process/resolve-package-bin";

const children = new Set<ChildProcess>();

const launch = (
  command: string,
  args: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
) => {
  const child = spawn(command, [...args], {
    cwd,
    env,
    stdio: "inherit",
    shell: false,
  });
  children.add(child);
  child.once("exit", (code, signal) => {
    children.delete(child);
    if (signal === null && code !== 0) process.exitCode = code ?? 1;
    for (const running of children) running.kill("SIGTERM");
  });
  child.once("error", (error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    for (const running of children) running.kill("SIGTERM");
  });
};

export const parseDevLanFlag = (args: readonly string[]) => {
  if (args.length === 0) return false;
  if (args.length === 1 && args[0] === "--lan") return true;
  throw new Error("Expected no arguments or exactly --lan.");
};

export const runDev = async ({
  rootDir,
  lan = false,
}: {
  readonly rootDir: string;
  readonly lan?: boolean;
}) => {
  const [vite, remotion] = await Promise.all([
    resolvePackageBinCommand({
      workspaceRoot: rootDir,
      packageName: "vite",
      binName: "vite",
    }),
    resolvePackageBinCommand({
      workspaceRoot: rootDir,
      packageName: "@remotion/cli",
      binName: "remotion",
    }),
  ]);
  launch(
    vite.command,
    [...vite.argsPrefix, "--config", "settings/vite.config.ts"],
    rootDir,
    { ...process.env, RSP_DEV_LAN: lan ? "1" : "0" },
  );
  launch(
    remotion.command,
    [
      ...remotion.argsPrefix,
      "studio",
      "--port=3101",
      "--no-open",
      ...(lan ? ["--ipv4"] : []),
    ],
    rootDir,
  );
};

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const shutdown = () => {
    for (const child of children) child.kill("SIGTERM");
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  runDev({
    rootDir: process.cwd(),
    lan: parseDevLanFlag(process.argv.slice(2)),
  }).catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Development services failed."}\n`,
    );
    process.exitCode = 1;
    shutdown();
  });
}

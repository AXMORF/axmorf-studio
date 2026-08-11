import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const children = new Set<ChildProcess>();

const launch = (
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
) => {
  const child = spawn(command, [...args], {
    cwd: process.cwd(),
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

export const runDev = ({ lan = false }: { readonly lan?: boolean } = {}) => {
  launch(
    join(process.cwd(), "node_modules/.bin/vite"),
    ["--config", "settings/vite.config.ts"],
    { ...process.env, RSP_DEV_LAN: lan ? "1" : "0" },
  );
  launch(join(process.cwd(), "node_modules/.bin/remotion"), [
    "studio",
    "--port=3101",
    "--no-open",
    ...(lan ? ["--ipv4"] : []),
  ]);
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
  runDev({ lan: parseDevLanFlag(process.argv.slice(2)) });
}

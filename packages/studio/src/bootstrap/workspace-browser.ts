import { mkdtemp, open, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runBoundedProcess } from "../process/bounded-process";
import { resolvePackageBinCommand } from "../process/resolve-package-bin";
import {
  resolveRuntimeResources,
  type RuntimeResources,
} from "../runtime/runtime-resources";

// Isolate ensureBrowser because the pinned renderer retains a rejected operation
// promise. The public download hook runs before any download or cache mutation.
export const inspectInstalledBrowser = async (
  rootDir: string,
): Promise<string> => {
  const result = await runBoundedProcess(
    process.execPath,
    [
      "--input-type=commonjs",
      "--eval",
      `
const {createRequire}=require('node:module');
const {join}=require('node:path');
const {ensureBrowser}=createRequire(join(process.cwd(),'package.json'))('@remotion/renderer');
ensureBrowser({logLevel:'error',onBrowserDownload:()=>{throw new Error('Browser is missing or incomplete. Run npm run browser:prepare.');}})
.then(status=>{if(!status.path)throw new Error('Browser unavailable. Run npm run browser:prepare.');process.stdout.write(JSON.stringify(status.path));})
.catch(error=>{process.stderr.write(error.message);process.exitCode=1;});
`,
    ],
    { cwd: rootDir, timeoutMs: 30_000 },
  );
  if (result.status !== 0)
    throw new Error(
      result.stderr || "Browser unavailable. Run npm run browser:prepare.",
    );
  const path: unknown = JSON.parse(result.stdout);
  if (typeof path !== "string" || !path)
    throw new Error("Browser discovery returned no executable.");
  return path;
};

const activeProbes = new Map<string, Promise<void>>();
export const verifyWorkspaceBrowser = (
  rootDir: string,
  runtimeResources: RuntimeResources,
): Promise<void> => {
  const existing = activeProbes.get(rootDir);
  if (existing !== undefined) return existing;
  const pending = (async () => {
    const executable = await inspectInstalledBrowser(rootDir);
    const invocation = await resolvePackageBinCommand({
      workspaceRoot: rootDir,
      packageName: "@remotion/cli",
      binName: "remotion",
    });
    const temporary = await mkdtemp(join(tmpdir(), "axmorf-browser-probe-"));
    try {
      const output = join(temporary, "probe.png");
      const result = await runBoundedProcess(
        invocation.command,
        [
          ...invocation.argsPrefix,
          "still",
          runtimeResources.remotionPreflightEntry,
          "RemotionBrowserPreflight",
          output,
          "--frame=0",
          "--log=error",
          `--browser-executable=${executable}`,
        ],
        { cwd: rootDir, timeoutMs: 90_000 },
      );
      if (result.status !== 0)
        throw new Error(
          `Remotion browser render failed: ${(result.stderr + result.stdout).slice(-4096)}`,
        );
      const bytes = await readFile(output);
      if (
        bytes.toString("hex", 0, 8) !== "89504e470d0a1a0a" ||
        bytes.readUInt32BE(16) !== 16 ||
        bytes.readUInt32BE(20) !== 16
      )
        throw new Error("Browser probe did not render the expected 16x16 PNG.");
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  })();
  activeProbes.set(rootDir, pending);
  void pending
    .finally(() => activeProbes.delete(rootDir))
    .catch(() => undefined);
  return pending;
};

export const browserPreparationNodeArgs = (
  env: Readonly<Record<string, string | undefined>> = process.env,
  supportsEnvironmentProxy = process.allowedNodeEnvironmentFlags.has(
    "--use-env-proxy",
  ),
): readonly string[] => {
  if (
    env.NODE_USE_ENV_PROXY === "0" ||
    /(?:^|\s)(?:--no-use-env-proxy|"--no-use-env-proxy"|'--no-use-env-proxy')(?=\s|$)/u.test(
      env.NODE_OPTIONS ?? "",
    )
  )
    return [];
  const proxyRequested = [
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "http_proxy",
    "https_proxy",
  ].some((name) => (env[name]?.trim().length ?? 0) > 0);
  if (!proxyRequested) return [];
  if (!supportsEnvironmentProxy) {
    throw new Error(
      "Browser preparation detected HTTP(S)_PROXY, but this Node.js cannot honor it natively. Upgrade to a supported Node.js release with --use-env-proxy (22.21+ or 24.5+).",
    );
  }
  return ["--use-env-proxy"];
};

export const prepareWorkspaceBrowser = async (rootDir: string) => {
  const nodeArgs = browserPreparationNodeArgs();
  const lockPath = join(rootDir, ".axmorf-browser-prepare.lock");
  let lock;
  try {
    lock = await open(lockPath, "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
      throw new Error(
        "Browser preparation is already running or was interrupted; exclusive browser preparation lock exists.",
      );
    throw error;
  }
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid }));
    const invocation = await resolvePackageBinCommand({
      workspaceRoot: rootDir,
      packageName: "@remotion/cli",
      binName: "remotion",
    });
    const result = await runBoundedProcess(
      invocation.command,
      [...nodeArgs, ...invocation.argsPrefix, "browser", "ensure"],
      {
        cwd: rootDir,
        timeoutMs: 300_000,
        trackOwnership: true,
        logPath: join(rootDir, ".axmorf-browser-prepare.log"),
      },
    );
    if (result.status !== 0)
      throw new Error(
        `Browser preparation failed: ${result.stderr.slice(-4096)} See .axmorf-browser-prepare.log.`,
      );
    await verifyWorkspaceBrowser(rootDir, await resolveRuntimeResources());
    return {
      status: "browser-ready" as const,
      checks: {
        installedBrowser: "pass" as const,
        browserRender: "pass" as const,
      },
    };
  } finally {
    await lock.close();
    await rm(lockPath);
  }
};

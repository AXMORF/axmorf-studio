import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";

import type { NodeCliInvocation } from "../process/resolve-package-bin";
import { resolvePackageBinCommand } from "../process/resolve-package-bin";

export type ProcessTerminal = Readonly<{
  code: number | null;
  signal: NodeJS.Signals | null;
}>;

export interface SpawnedProcess extends EventEmitter {
  readonly pid?: number;
  terminate(): void;
}

export type SpawnProcess = (request: {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
}) => SpawnedProcess;

export type RunningService = Readonly<{
  url: string;
  wait: () => Promise<ProcessTerminal>;
  close: () => Promise<void>;
}>;

const parsePort = (raw: string | undefined) => {
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > 65_535) {
    throw new Error("Port must be an integer from 1 through 65535.");
  }
  return value;
};

export const parseSinglePortArgument = (
  args: readonly string[],
  option: "--port",
  defaultPort: number,
) => {
  if (args.length === 0) return { port: defaultPort };
  if (args.length === 2 && args[0] === option) {
    return { port: parsePort(args[1]) };
  }
  throw new Error(`Expected no arguments or ${option} <port>.`);
};

export const parseDevArguments = (args: readonly string[]) => {
  if (args.length === 0) return { webPort: 3100, studioPort: 3101 };
  if (
    args.length === 4 &&
    args[0] === "--web-port" &&
    args[2] === "--studio-port"
  ) {
    return { webPort: parsePort(args[1]), studioPort: parsePort(args[3]) };
  }
  throw new Error(
    "Expected no arguments or --web-port <port> --studio-port <port>.",
  );
};

const defaultSpawnProcess: SpawnProcess = ({ command, args, cwd, env }) => {
  const child = spawn(command, [...args], {
    cwd,
    env,
    stdio: "inherit",
    shell: false,
  });
  return Object.assign(child, {
    terminate: () => {
      child.kill("SIGTERM");
    },
  });
};

const waitForProcess = (child: SpawnedProcess) =>
  new Promise<ProcessTerminal>((resolvePromise, reject) => {
    child.once("error", reject);
    child.once("exit", (code: number | null, signal: NodeJS.Signals | null) =>
      resolvePromise({ code, signal }),
    );
  });

export const startPreviewService = async ({
  rootDir,
  port,
  env = process.env,
  resolveRemotion = (workspaceRoot) =>
    resolvePackageBinCommand({
      workspaceRoot,
      packageName: "@remotion/cli",
      binName: "remotion",
    }),
  spawnProcess = defaultSpawnProcess,
}: {
  readonly rootDir: string;
  readonly port: number;
  readonly env?: NodeJS.ProcessEnv;
  readonly resolveRemotion?: (rootDir: string) => Promise<NodeCliInvocation>;
  readonly spawnProcess?: SpawnProcess;
}): Promise<RunningService> => {
  const invocation = await resolveRemotion(rootDir);
  const child = spawnProcess({
    command: invocation.command,
    args: [
      ...invocation.argsPrefix,
      "studio",
      "src/index.ts",
      `--port=${port}`,
      "--no-open",
    ],
    cwd: rootDir,
    env,
  });
  let closed = false;
  return {
    url: `http://127.0.0.1:${port}/`,
    wait: () => waitForProcess(child),
    close: async () => {
      if (closed) return;
      closed = true;
      child.terminate();
    },
  };
};

export const startDevServices = async ({
  rootDir,
  webPort,
  studioPort,
  startWeb,
  startPreview = ({ rootDir: workspaceRoot, port }) =>
    startPreviewService({ rootDir: workspaceRoot, port }),
}: {
  readonly rootDir: string;
  readonly webPort: number;
  readonly studioPort: number;
  readonly startWeb: (input: {
    readonly rootDir: string;
    readonly port: number;
    readonly studioUrl: string;
  }) => Promise<Readonly<{ url: string; close: () => Promise<void> }>>;
  readonly startPreview?: (input: {
    readonly rootDir: string;
    readonly port: number;
  }) => Promise<RunningService>;
}): Promise<RunningService> => {
  const studioUrl = `http://127.0.0.1:${studioPort}/`;
  const web = await startWeb({ rootDir, port: webPort, studioUrl });
  let preview: RunningService;
  try {
    preview = await startPreview({ rootDir, port: studioPort });
  } catch (error) {
    await web.close();
    throw error;
  }
  let closed = false;
  let webClosed = false;
  const closeWeb = async () => {
    if (webClosed) return;
    webClosed = true;
    await web.close();
  };
  const close = async () => {
    if (closed) return;
    closed = true;
    await Promise.all([closeWeb(), preview.close()]);
  };
  const terminal = preview.wait().then(async (result) => {
    await closeWeb();
    return result;
  });
  return {
    url: web.url,
    wait: () => terminal,
    close,
  };
};

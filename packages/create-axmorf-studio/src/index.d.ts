export type CreatorCommandRunner = (
  command: string,
  args: string[],
  options: Readonly<{ cwd: string; onLogDirectory?: (path: string) => void }>,
) => Promise<void>;

export type NpmFileSystem = Readonly<{
  lstat: (path: string) => Promise<
    Readonly<{
      isFile: () => boolean;
      isSymbolicLink: () => boolean;
    }>
  >;
  readFile?: (path: string, encoding: "utf8") => Promise<string>;
  mkdtemp?: (prefix: string) => Promise<string>;
}>;

export type NpmSpawnRequest = Readonly<{
  executable: string;
  args: string[];
  options: Readonly<{
    cwd: string;
    stdio: "inherit";
    shell: false;
  }>;
}>;

export const resolveNpmCliPath: (
  input: Readonly<{
    npmExecPath?: string;
    execPath: string;
    platform: NodeJS.Platform;
    filesystem?: NpmFileSystem;
  }>,
) => Promise<string>;

export const buildNpmSpawnRequest: (
  input: Readonly<{
    execPath: string;
    npmCliPath: string;
    command: string;
    args: string[];
    cwd: string;
  }>,
) => NpmSpawnRequest;

export const createNpmCommandRunner: (
  input: Readonly<{
    npmExecPath?: string;
    execPath: string;
    platform: NodeJS.Platform;
    filesystem?: NpmFileSystem;
    spawnProcess?: (
      executable: string,
      args: string[],
      options: NpmSpawnRequest["options"],
    ) => unknown;
  }>,
) => CreatorCommandRunner;

export type CreatorArguments = Readonly<{
  target: string | null;
  yes: boolean;
  install: boolean;
  runtimePackage: string;
  help: boolean;
}>;

export type WorkspaceCreationResult = Readonly<{
  status: "workspace-ready" | "workspace-generated";
  ready: boolean;
  workspace: string;
  packageName: string;
  workspaceVersion: 1;
  installed: boolean;
  next?: readonly string[];
}>;

export const parseArguments: (argv: readonly string[]) => CreatorArguments;

export type CreatorProgressTimer = Readonly<{ unref?: () => unknown }>;

export const createWorkspace: (
  input: Readonly<{
    cwd: string;
    target: string;
    install: boolean;
    runtimePackage: string;
  }>,
  dependencies: Readonly<{
    filesystem?: typeof import("node:fs/promises");
    runCommand: CreatorCommandRunner;
    templateRoot?: string;
    progress?: (value: string) => void;
    now?: () => number;
    scheduleInterval?: (
      callback: () => void,
      delay: number,
    ) => CreatorProgressTimer;
    cancelInterval?: (interval: CreatorProgressTimer) => void;
  }>,
) => Promise<WorkspaceCreationResult>;

export const runCli: (
  argv: readonly string[],
  options?: Readonly<{
    cwd?: string;
    platform?: NodeJS.Platform;
    stdout?: (value: string) => void;
    stderr?: (value: string) => void;
    runCommand?: CreatorCommandRunner;
    filesystem?: typeof import("node:fs/promises");
    templateRoot?: string;
  }>,
) => Promise<WorkspaceCreationResult | Readonly<{ status: "help" }>>;

export const RUNTIME_PACKAGE_NAME: "@axmorf/studio";
export const normalizeRuntimePackage: (value: string, cwd: string) => string;
export const createPackageJson: (input: {
  readonly name: string;
  readonly runtimePackage: string;
}) => Readonly<Record<string, unknown>>;
export const createSafeProducerConfig: () => Readonly<Record<string, unknown>>;
export const createEmptyResourceCatalog: () => Readonly<
  Record<string, unknown>
>;

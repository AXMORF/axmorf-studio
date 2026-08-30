import { lstat, readFile, realpath } from "node:fs/promises";
import { dirname, join, parse, resolve } from "node:path";

export const WORKSPACE_VERSION = 1 as const;

export type ResolvedWorkspace = Readonly<{
  rootDir: string;
  packageJsonPath: string;
  workspaceVersion: typeof WORKSPACE_VERSION;
}>;

export class WorkspaceResolutionError extends Error {
  readonly code = "workspace-resolution-failed" as const;
}

const hasOwn = (value: object, key: string) =>
  Object.prototype.hasOwnProperty.call(value, key);

const canonicalDirectory = async (path: string, label: string) => {
  let metadata;
  try {
    metadata = await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new WorkspaceResolutionError(`${label} does not exist.`);
    }
    throw error;
  }
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new WorkspaceResolutionError(
      `${label} must be a directory and cannot use symbolic links.`,
    );
  }
  const canonical = await realpath(path);
  if (canonical !== resolve(path)) {
    throw new WorkspaceResolutionError(
      `${label} cannot contain symbolic links.`,
    );
  }
  return canonical;
};

const readMarker = async (directory: string) => {
  const packageJsonPath = join(directory, "package.json");
  let metadata;
  try {
    metadata = await lstat(packageJsonPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new WorkspaceResolutionError(
      `Workspace package.json marker must be a regular file and cannot be a symbolic link: ${packageJsonPath}.`,
    );
  }
  let manifest: unknown;
  try {
    manifest = JSON.parse(await readFile(packageJsonPath, "utf8")) as unknown;
  } catch (error) {
    throw new WorkspaceResolutionError(
      `Workspace package.json is not valid JSON: ${packageJsonPath}.`,
      { cause: error },
    );
  }
  if (
    manifest === null ||
    typeof manifest !== "object" ||
    Array.isArray(manifest) ||
    !hasOwn(manifest, "axmorf")
  ) {
    return null;
  }
  const marker = (manifest as { axmorf?: unknown })
    .axmorf;
  if (
    marker === null ||
    typeof marker !== "object" ||
    Array.isArray(marker) ||
    (marker as { workspaceVersion?: unknown }).workspaceVersion !==
      WORKSPACE_VERSION
  ) {
    throw new WorkspaceResolutionError(
      `Unsupported AXMORF Studio workspace marker in ${packageJsonPath}; expected workspaceVersion ${WORKSPACE_VERSION}.`,
    );
  }
  return {
    rootDir: directory,
    packageJsonPath,
    workspaceVersion: WORKSPACE_VERSION,
  } satisfies ResolvedWorkspace;
};

const ancestorDirectories = (start: string) => {
  const directories = [];
  let current = start;
  const filesystemRoot = parse(current).root;
  while (true) {
    directories.push(current);
    if (current === filesystemRoot) return directories;
    current = dirname(current);
  }
};

export const resolveWorkspaceRoot = async ({
  cwd,
  explicitWorkspace,
}: {
  readonly cwd: string;
  readonly explicitWorkspace?: string;
}): Promise<ResolvedWorkspace> => {
  const requested =
    explicitWorkspace === undefined
      ? resolve(cwd)
      : resolve(cwd, explicitWorkspace);
  const start = await canonicalDirectory(
    requested,
    explicitWorkspace === undefined
      ? "Current directory"
      : "Explicit workspace",
  );

  if (explicitWorkspace !== undefined) {
    const marker = await readMarker(start);
    if (marker === null) {
      throw new WorkspaceResolutionError(
        `Explicit workspace does not contain a AXMORF Studio workspace marker: ${start}.`,
      );
    }
    return marker;
  }

  const markers: ResolvedWorkspace[] = [];
  for (const directory of ancestorDirectories(start)) {
    const marker = await readMarker(directory);
    if (marker !== null) markers.push(marker);
  }
  if (markers.length === 0) {
    throw new WorkspaceResolutionError(
      `No AXMORF Studio workspace marker was found from ${start}.`,
    );
  }
  if (markers.length > 1) {
    throw new WorkspaceResolutionError(
      `Multiple AXMORF Studio workspace markers were found: ${markers
        .map(({ rootDir }) => rootDir)
        .join(", ")}.`,
    );
  }
  return markers[0] as ResolvedWorkspace;
};

export const parseWorkspaceArguments = (args: readonly string[]) => {
  const workspaceIndexes = args.flatMap((argument, index) =>
    argument === "--workspace" || argument.startsWith("--workspace=")
      ? [index]
      : [],
  );
  if (workspaceIndexes.length === 0) {
    return { commandArgs: [...args] } as const;
  }
  if (
    workspaceIndexes.length !== 1 ||
    workspaceIndexes[0] !== 0 ||
    args[0] !== "--workspace" ||
    args[1] === undefined ||
    args[1].length === 0 ||
    args[1].startsWith("--")
  ) {
    throw new WorkspaceResolutionError(
      "Expected at most one leading --workspace <path> before the command.",
    );
  }
  return {
    explicitWorkspace: args[1],
    commandArgs: args.slice(2),
  } as const;
};

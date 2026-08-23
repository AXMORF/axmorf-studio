import { createHash, randomUUID } from "node:crypto";
import {
  chmod,
  link,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  statfs,
  unlink,
} from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";

import {
  DESKTOP_MANAGED_FILE_PATHS,
  DESKTOP_WORKSPACE_DIRECTORIES,
  type ManagedFileRecord,
} from "../contracts/workspace";

export const WORKSPACE_MANIFEST_PATH = ".rsp/workspace.json" as const;
export const MANAGED_FILES_LEDGER_PATH = ".rsp/managed-files.json" as const;

const MANAGED_RESOURCE_PATHS: Readonly<
  Record<(typeof DESKTOP_MANAGED_FILE_PATHS)[number], string | null>
> = Object.freeze({
  "AGENTS.md": "AGENTS.md",
  "CLAUDE.md": "CLAUDE.md",
  "GEMINI.md": "GEMINI.md",
  ".agents/skills/remotion-story-producer-video/SKILL.md":
    "skills/remotion-story-producer-video/SKILL.md",
  ".rsp/hermes/INSTALL_PROMPT.md": "hermes/INSTALL_PROMPT.md",
  ".rsp/bin/rsp": null,
});

const MANAGED_FILE_MODES: Readonly<
  Record<(typeof DESKTOP_MANAGED_FILE_PATHS)[number], ManagedFileRecord["mode"]>
> = Object.freeze({
  "AGENTS.md": 0o644,
  "CLAUDE.md": 0o644,
  "GEMINI.md": 0o644,
  ".agents/skills/remotion-story-producer-video/SKILL.md": 0o644,
  ".rsp/hermes/INSTALL_PROMPT.md": 0o600,
  ".rsp/bin/rsp": 0o755,
});

const PRIVATE_WORKSPACE_DIRECTORIES = new Set<string>([
  ".rsp",
  ".rsp/bin",
  ".rsp/lib",
  ".rsp/hermes",
  ".rsp/work",
  ".rsp/artifacts",
  ".rsp/attempts",
  ".rsp/current",
  ".rsp/current/source",
  ".rsp/locks",
  ".rsp/migrations",
  ".rsp/session",
]);

const workspaceDirectoryMode = (relativePath: string) =>
  PRIVATE_WORKSPACE_DIRECTORIES.has(relativePath) ? 0o700 : 0o755;

type PathMetadata = Awaited<ReturnType<typeof lstat>> | null;

export type ManagedIntegrationFile = Readonly<{
  relativePath: (typeof DESKTOP_MANAGED_FILE_PATHS)[number];
  bytes: Buffer;
  mode: ManagedFileRecord["mode"];
  sha256: string;
}>;

export type ManagedRspExecutable = Readonly<{
  path: string;
  sha256: string;
}>;

export type WorkspaceRootValidation = Readonly<{
  workspaceRoot: string;
  parentRoot: string;
  exists: boolean;
}>;

export type WorkspaceTreeEntry = Readonly<{
  relativePath: string;
  kind: "directory" | "file";
  mode: number;
  sizeBytes: number;
  sha256: string | null;
}>;

const pathMetadata = async (path: string): Promise<PathMetadata> => {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

const isSameOrContained = (parent: string, candidate: string) => {
  const result = relative(parent, candidate);
  return result === "" || (!result.startsWith(`..${sep}`) && result !== "..");
};

const assertNormalizedRelativePath = (relativePath: string) => {
  const segments = relativePath.split("/");
  if (
    segments.length === 0 ||
    segments.some(
      (segment) =>
        segment === "" ||
        segment === "." ||
        segment === ".." ||
        segment.includes("\\"),
    )
  ) {
    throw new Error(`Workspace path is not normalized: ${relativePath}.`);
  }
  return segments;
};

const modeBits = (mode: number | bigint) => Number(mode) & 0o777;

const syncDirectory = async (directory: string): Promise<void> => {
  let handle;
  try {
    handle = await open(directory, "r");
    await handle.sync();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EINVAL" && code !== "ENOTSUP" && code !== "EBADF") {
      throw error;
    }
  } finally {
    await handle?.close();
  }
};

export const syncWorkspaceDirectory = syncDirectory;

export const checksumWorkspaceBytes = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

export const serializeWorkspaceJson = (value: unknown) =>
  `${JSON.stringify(value, null, 2)}\n`;

const inspectWorkspaceTreeDirectory = async ({
  root,
  relativeDirectory,
  entries,
  excludedTopLevelPaths,
}: {
  readonly root: string;
  readonly relativeDirectory: string;
  readonly entries: WorkspaceTreeEntry[];
  readonly excludedTopLevelPaths: ReadonlySet<string>;
}): Promise<void> => {
  const directory =
    relativeDirectory === ""
      ? root
      : await assertWorkspaceManagedPath({
          workspaceRoot: root,
          relativePath: relativeDirectory,
          kind: "directory",
          allowMissing: false,
        });
  const children = await readdir(directory, { withFileTypes: true });
  children.sort((left, right) => left.name.localeCompare(right.name));
  for (const child of children) {
    if (relativeDirectory === "" && excludedTopLevelPaths.has(child.name)) {
      continue;
    }
    const relativePath =
      relativeDirectory === ""
        ? child.name
        : `${relativeDirectory}/${child.name}`;
    assertNormalizedRelativePath(relativePath);
    const sourcePath = join(root, ...relativePath.split("/"));
    const metadata = await lstat(sourcePath);
    if (metadata.isSymbolicLink()) {
      throw new Error(`Workspace migration rejects symlink: ${relativePath}.`);
    }
    if (metadata.isDirectory()) {
      entries.push({
        relativePath,
        kind: "directory",
        mode: modeBits(metadata.mode),
        sizeBytes: 0,
        sha256: null,
      });
      await inspectWorkspaceTreeDirectory({
        root,
        relativeDirectory: relativePath,
        entries,
        excludedTopLevelPaths,
      });
      continue;
    }
    if (!metadata.isFile()) {
      throw new Error(
        `Workspace migration rejects special file: ${relativePath}.`,
      );
    }
    const bytes = await readFile(sourcePath);
    const afterRead = await lstat(sourcePath);
    if (
      afterRead.isSymbolicLink() ||
      !afterRead.isFile() ||
      afterRead.size !== metadata.size ||
      afterRead.mtimeMs !== metadata.mtimeMs
    ) {
      throw new Error(`Workspace changed during migration: ${relativePath}.`);
    }
    entries.push({
      relativePath,
      kind: "file",
      mode: modeBits(metadata.mode),
      sizeBytes: bytes.byteLength,
      sha256: checksumWorkspaceBytes(bytes),
    });
  }
};

export const inspectWorkspaceTree = async (
  workspaceRoot: string,
  {
    excludedTopLevelPaths = [],
  }: { readonly excludedTopLevelPaths?: readonly string[] } = {},
): Promise<readonly WorkspaceTreeEntry[]> => {
  const rootMetadata = await lstat(workspaceRoot);
  if (rootMetadata.isSymbolicLink() || !rootMetadata.isDirectory()) {
    throw new Error("Workspace migration source must be a real directory.");
  }
  const canonicalRoot = await realpath(workspaceRoot);
  if (canonicalRoot !== resolve(workspaceRoot)) {
    throw new Error("Workspace migration source must be canonical.");
  }
  const entries: WorkspaceTreeEntry[] = [];
  await inspectWorkspaceTreeDirectory({
    root: canonicalRoot,
    relativeDirectory: "",
    entries,
    excludedTopLevelPaths: new Set(excludedTopLevelPaths),
  });
  return entries;
};

export const workspaceTreeSizeBytes = (
  entries: readonly WorkspaceTreeEntry[],
) => entries.reduce((total, entry) => total + entry.sizeBytes, 0);

export const availableWorkspaceBytes = async (parentRoot: string) => {
  const information = await statfs(parentRoot, { bigint: true });
  const available = information.bavail * information.bsize;
  return available > BigInt(Number.MAX_SAFE_INTEGER)
    ? Number.MAX_SAFE_INTEGER
    : Number(available);
};

export type WorkspaceTreeFileCopier = (request: {
  readonly source: string;
  readonly destination: string;
  readonly entry: WorkspaceTreeEntry;
}) => Promise<void>;

const copyWorkspaceTreeFile: WorkspaceTreeFileCopier = async ({
  source,
  destination,
  entry,
}) => {
  const bytes = await readFile(source);
  if (
    bytes.byteLength !== entry.sizeBytes ||
    checksumWorkspaceBytes(bytes) !== entry.sha256
  ) {
    throw new Error(
      `Workspace changed during migration: ${entry.relativePath}.`,
    );
  }
  const handle = await open(destination, "wx", entry.mode);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await chmod(destination, entry.mode);
};

export const copyWorkspaceTree = async ({
  sourceRoot,
  destinationRoot,
  sourceEntries,
  copyFile = copyWorkspaceTreeFile,
}: {
  readonly sourceRoot: string;
  readonly destinationRoot: string;
  readonly sourceEntries: readonly WorkspaceTreeEntry[];
  readonly copyFile?: WorkspaceTreeFileCopier;
}) => {
  const destinationMetadata = await pathMetadata(destinationRoot);
  if (destinationMetadata !== null) {
    throw new Error("Workspace migration staging already exists.");
  }
  await mkdir(destinationRoot, { mode: 0o700 });
  await chmod(destinationRoot, 0o700);
  for (const entry of sourceEntries) {
    const segments = assertNormalizedRelativePath(entry.relativePath);
    const source = join(sourceRoot, ...segments);
    const destination = join(destinationRoot, ...segments);
    if (entry.kind === "directory") {
      await mkdir(destination, { mode: entry.mode });
      await chmod(destination, entry.mode);
      continue;
    }
    await copyFile({ source, destination, entry });
  }
  const copiedEntries = await inspectWorkspaceTree(destinationRoot);
  if (JSON.stringify(copiedEntries) !== JSON.stringify(sourceEntries)) {
    throw new Error("Workspace migration copy checksum verification failed.");
  }
};

export const removeLegacyManagedFile = async ({
  workspaceRoot,
  relativePath,
}: {
  readonly workspaceRoot: string;
  readonly relativePath: ".rsp/lib/rsp-client.cjs";
}) => {
  const destination = await assertWorkspaceManagedPath({
    workspaceRoot,
    relativePath,
    kind: "file",
    allowMissing: false,
  });
  await unlink(destination);
};

export const renameWorkspaceRoot = async ({
  sourceRoot,
  destinationRoot,
}: {
  readonly sourceRoot: string;
  readonly destinationRoot: string;
}) => {
  if (dirname(sourceRoot) !== dirname(destinationRoot)) {
    throw new Error("Atomic Workspace switch requires same-parent paths.");
  }
  if ((await pathMetadata(destinationRoot)) !== null) {
    throw new Error("Atomic Workspace switch destination already exists.");
  }
  await rename(sourceRoot, destinationRoot);
  await syncDirectory(dirname(sourceRoot));
};

export const removeWorkspaceMigrationPath = async ({
  parentRoot,
  migrationPath,
  migrationId,
}: {
  readonly parentRoot: string;
  readonly migrationPath: string;
  readonly migrationId: string;
}) => {
  const canonicalParent = resolve(parentRoot);
  const candidate = resolve(migrationPath);
  if (
    dirname(candidate) !== canonicalParent ||
    basename(candidate) !== `.axmorf-workspace-staging-${migrationId}`
  ) {
    throw new Error("Refusing to clean an unowned Workspace migration path.");
  }
  await rm(candidate, { recursive: true, force: true });
  await syncDirectory(canonicalParent);
};

export const validateWorkspaceRoot = async ({
  workspaceRoot: rawWorkspaceRoot,
  homeDirectory: rawHomeDirectory,
  forbiddenRoots = [],
}: {
  readonly workspaceRoot: string;
  readonly homeDirectory: string;
  readonly forbiddenRoots?: readonly string[];
}): Promise<WorkspaceRootValidation> => {
  if (!isAbsolute(rawWorkspaceRoot) || !isAbsolute(rawHomeDirectory)) {
    throw new Error("Workspace and home paths must be absolute.");
  }
  const requestedRoot = resolve(rawWorkspaceRoot);
  const requestedParent = dirname(requestedRoot);
  const parentMetadata = await stat(requestedParent).catch((error) => {
    throw new Error("Workspace parent must already exist.", { cause: error });
  });
  if (!parentMetadata.isDirectory()) {
    throw new Error("Workspace parent must be a directory.");
  }
  const parentRoot = await realpath(requestedParent);
  const workspaceRoot = join(parentRoot, basename(requestedRoot));
  const homeDirectory = await realpath(resolve(rawHomeDirectory));

  if (workspaceRoot === resolve(workspaceRoot, sep)) {
    throw new Error("Filesystem root cannot be used as the Workspace.");
  }
  if (workspaceRoot === homeDirectory) {
    throw new Error(
      "The home directory itself cannot be used as the Workspace.",
    );
  }
  if (
    workspaceRoot
      .split(sep)
      .some((segment) => segment.toLowerCase().endsWith(".app"))
  ) {
    throw new Error("An App bundle cannot contain the Workspace.");
  }

  const canonicalForbiddenRoots: string[] = [];
  for (const rawForbiddenRoot of forbiddenRoots) {
    if (!isAbsolute(rawForbiddenRoot)) {
      throw new Error("Forbidden Workspace roots must be absolute.");
    }
    const resolvedForbidden = resolve(rawForbiddenRoot);
    const metadata = await pathMetadata(resolvedForbidden);
    canonicalForbiddenRoots.push(
      metadata === null ? resolvedForbidden : await realpath(resolvedForbidden),
    );
  }
  for (const forbiddenRoot of canonicalForbiddenRoots) {
    if (
      isSameOrContained(forbiddenRoot, workspaceRoot) ||
      isSameOrContained(workspaceRoot, forbiddenRoot)
    ) {
      throw new Error("Workspace overlaps a forbidden ownership root.");
    }
  }

  const targetMetadata = await pathMetadata(workspaceRoot);
  if (targetMetadata === null) {
    return { workspaceRoot, parentRoot, exists: false };
  }
  if (targetMetadata.isSymbolicLink() || !targetMetadata.isDirectory()) {
    throw new Error("Workspace target must be a real directory.");
  }
  const canonicalTarget = await realpath(workspaceRoot);
  if (canonicalTarget !== workspaceRoot) {
    throw new Error("Workspace target resolves outside its canonical parent.");
  }
  return { workspaceRoot, parentRoot, exists: true };
};

export const assertWorkspaceManagedPath = async ({
  workspaceRoot: rawWorkspaceRoot,
  relativePath,
  kind,
  allowMissing = true,
}: {
  readonly workspaceRoot: string;
  readonly relativePath: string;
  readonly kind: "directory" | "file";
  readonly allowMissing?: boolean;
}) => {
  const workspaceRoot = resolve(rawWorkspaceRoot);
  const segments = assertNormalizedRelativePath(relativePath);
  const destination = join(workspaceRoot, ...segments);
  if (
    !isSameOrContained(workspaceRoot, destination) ||
    destination === workspaceRoot
  ) {
    throw new Error(`Managed path escapes the Workspace: ${relativePath}.`);
  }
  let current = workspaceRoot;
  let missing = false;
  for (const [index, segment] of segments.entries()) {
    current = join(current, segment);
    const metadata = await pathMetadata(current);
    if (metadata === null) {
      missing = true;
      if (!allowMissing) {
        throw new Error(`Managed Workspace path is missing: ${relativePath}.`);
      }
      continue;
    }
    if (missing || metadata.isSymbolicLink()) {
      throw new Error(`Managed Workspace path is unsafe: ${relativePath}.`);
    }
    const isLeaf = index === segments.length - 1;
    if (!isLeaf && !metadata.isDirectory()) {
      throw new Error(
        `Managed Workspace parent is not a directory: ${relativePath}.`,
      );
    }
    if (
      isLeaf &&
      ((kind === "directory" && !metadata.isDirectory()) ||
        (kind === "file" && !metadata.isFile()))
    ) {
      throw new Error(
        `Managed Workspace path has the wrong type: ${relativePath}.`,
      );
    }
  }
  return destination;
};

export const createWorkspaceDirectories = async (workspaceRoot: string) => {
  for (const relativePath of DESKTOP_WORKSPACE_DIRECTORIES) {
    const destination = await assertWorkspaceManagedPath({
      workspaceRoot,
      relativePath,
      kind: "directory",
    });
    const expectedMode = workspaceDirectoryMode(relativePath);
    let created = false;
    await mkdir(destination, {
      mode: expectedMode,
    })
      .then(() => {
        created = true;
      })
      .catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "EEXIST") throw error;
      });
    if (created) await chmod(destination, expectedMode);
    const metadata = await lstat(destination);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      throw new Error(
        `Managed Workspace directory is unsafe: ${relativePath}.`,
      );
    }
    if (modeBits(metadata.mode) !== expectedMode) {
      throw new Error(
        `Managed Workspace directory mode drifted: ${relativePath}.`,
      );
    }
  }
};

export const inspectWorkspaceDirectories = async (workspaceRoot: string) => {
  let allCurrent = true;
  for (const relativePath of DESKTOP_WORKSPACE_DIRECTORIES) {
    const destination = await assertWorkspaceManagedPath({
      workspaceRoot,
      relativePath,
      kind: "directory",
    });
    const metadata = await pathMetadata(destination);
    if (metadata === null) {
      allCurrent = false;
      continue;
    }
    if (
      metadata.isSymbolicLink() ||
      !metadata.isDirectory() ||
      modeBits(metadata.mode) !== workspaceDirectoryMode(relativePath)
    ) {
      throw new Error(
        `Managed Workspace directory mode drifted: ${relativePath}.`,
      );
    }
  }
  return allCurrent;
};

export const loadManagedIntegration = async ({
  integrationResourcesRoot: rawIntegrationResourcesRoot,
  rspExecutable,
}: {
  readonly integrationResourcesRoot: string;
  readonly rspExecutable: ManagedRspExecutable;
}): Promise<readonly ManagedIntegrationFile[]> => {
  const integrationResourcesRoot = resolve(rawIntegrationResourcesRoot);
  const rootMetadata = await lstat(integrationResourcesRoot);
  if (rootMetadata.isSymbolicLink() || !rootMetadata.isDirectory()) {
    throw new Error(
      "Workspace integration resources must be a real directory.",
    );
  }
  const files: ManagedIntegrationFile[] = [];
  for (const relativePath of DESKTOP_MANAGED_FILE_PATHS) {
    const sourceRelativePath = MANAGED_RESOURCE_PATHS[relativePath];
    if (sourceRelativePath === null) {
      const source = resolve(rspExecutable.path);
      const metadata = await lstat(source);
      if (
        metadata.isSymbolicLink() ||
        !metadata.isFile() ||
        (metadata.mode & 0o111) === 0 ||
        (await realpath(source)) !== source
      ) {
        throw new Error(
          "Managed rsp must be a canonical Runtime Pack executable.",
        );
      }
      const bytes = await readFile(source);
      const afterRead = await lstat(source);
      if (
        afterRead.isSymbolicLink() ||
        !afterRead.isFile() ||
        afterRead.dev !== metadata.dev ||
        afterRead.ino !== metadata.ino ||
        afterRead.size !== metadata.size
      ) {
        throw new Error("Managed rsp changed while it was being installed.");
      }
      const checksum = checksumWorkspaceBytes(bytes);
      if (checksum !== rspExecutable.sha256) {
        throw new Error(
          "Managed rsp does not match the verified Runtime Pack.",
        );
      }
      files.push({
        relativePath,
        bytes,
        mode: MANAGED_FILE_MODES[relativePath],
        sha256: checksum,
      });
      continue;
    }
    const source = await assertWorkspaceManagedPath({
      workspaceRoot: integrationResourcesRoot,
      relativePath: sourceRelativePath,
      kind: "file",
      allowMissing: false,
    });
    const metadata = await lstat(source);
    if (metadata.isSymbolicLink() || !metadata.isFile()) {
      throw new Error(
        `Managed integration resource is unsafe: ${sourceRelativePath}.`,
      );
    }
    const bytes = await readFile(source);
    files.push({
      relativePath,
      bytes,
      mode: MANAGED_FILE_MODES[relativePath],
      sha256: checksumWorkspaceBytes(bytes),
    });
  }
  return files;
};

export const inspectManagedFile = async ({
  workspaceRoot,
  file,
}: {
  readonly workspaceRoot: string;
  readonly file: ManagedIntegrationFile;
}) => {
  const destination = await assertWorkspaceManagedPath({
    workspaceRoot,
    relativePath: file.relativePath,
    kind: "file",
  });
  const metadata = await pathMetadata(destination);
  if (metadata === null) return { state: "missing" as const, destination };
  if (
    metadata.isSymbolicLink() ||
    !metadata.isFile() ||
    modeBits(metadata.mode) !== file.mode
  ) {
    throw new Error(`Managed Workspace file drifted: ${file.relativePath}.`);
  }
  const checksum = checksumWorkspaceBytes(await readFile(destination));
  if (checksum !== file.sha256) {
    throw new Error(`Managed Workspace file drifted: ${file.relativePath}.`);
  }
  return { state: "current" as const, destination };
};

export type AtomicWorkspaceFileWriter = (request: {
  readonly destination: string;
  readonly bytes: Uint8Array;
  readonly mode: number;
  readonly replace: boolean;
}) => Promise<void>;

export const writeWorkspaceFileAtomic: AtomicWorkspaceFileWriter = async ({
  destination,
  bytes,
  mode,
  replace,
}) => {
  const parent = dirname(destination);
  const temporaryPath = join(
    parent,
    `.${basename(destination)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let promoted = false;
  try {
    const handle = await open(temporaryPath, "wx", mode);
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await chmod(temporaryPath, mode);
    if (replace) {
      await rename(temporaryPath, destination);
    } else {
      try {
        await link(temporaryPath, destination);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") {
          throw new Error(
            `Managed destination already exists: ${basename(destination)}.`,
            { cause: error },
          );
        }
        throw error;
      }
      await unlink(temporaryPath);
    }
    promoted = true;
    await syncDirectory(parent);
  } finally {
    if (!promoted) {
      await unlink(temporaryPath).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
  }
};

export const installManagedFile = async ({
  workspaceRoot,
  file,
  writeAtomic = writeWorkspaceFileAtomic,
}: {
  readonly workspaceRoot: string;
  readonly file: ManagedIntegrationFile;
  readonly writeAtomic?: AtomicWorkspaceFileWriter;
}) => {
  const inspection = await inspectManagedFile({ workspaceRoot, file });
  if (inspection.state === "current") return false;
  await writeAtomic({
    destination: inspection.destination,
    bytes: file.bytes,
    mode: file.mode,
    replace: false,
  });
  const installed = await inspectManagedFile({ workspaceRoot, file });
  if (installed.state !== "current") {
    throw new Error(
      `Managed Workspace file verification failed: ${file.relativePath}.`,
    );
  }
  return true;
};

export const replaceManagedFile = async ({
  workspaceRoot,
  file,
  writeAtomic = writeWorkspaceFileAtomic,
}: {
  readonly workspaceRoot: string;
  readonly file: ManagedIntegrationFile;
  readonly writeAtomic?: AtomicWorkspaceFileWriter;
}) => {
  const destination = await assertWorkspaceManagedPath({
    workspaceRoot,
    relativePath: file.relativePath,
    kind: "file",
  });
  await writeAtomic({
    destination,
    bytes: file.bytes,
    mode: file.mode,
    replace: true,
  });
  const installed = await inspectManagedFile({ workspaceRoot, file });
  if (installed.state !== "current") {
    throw new Error(
      `Managed Workspace file verification failed: ${file.relativePath}.`,
    );
  }
};

export const createWorkspaceStaging = async (parentRoot: string) => {
  const stagingRoot = join(
    parentRoot,
    `.axmorf-workspace-staging-${randomUUID()}`,
  );
  await mkdir(stagingRoot, { mode: 0o700 });
  return {
    stagingRoot,
    cleanup: () => rm(stagingRoot, { recursive: true, force: true }),
  } as const;
};

export const promoteWorkspaceStaging = async ({
  stagingRoot,
  workspaceRoot,
}: {
  readonly stagingRoot: string;
  readonly workspaceRoot: string;
}) => {
  const parentRoot = dirname(workspaceRoot);
  if (dirname(stagingRoot) !== parentRoot) {
    throw new Error("Workspace staging must share the target parent.");
  }
  if ((await pathMetadata(workspaceRoot)) !== null) {
    throw new Error("Workspace target appeared during initialization.");
  }
  await rename(stagingRoot, workspaceRoot);
  await syncDirectory(parentRoot);
};

export const verifyWorkspaceFileMode = async ({
  path,
  mode,
}: {
  readonly path: string;
  readonly mode: number;
}) => {
  const metadata = await lstat(path);
  if (
    metadata.isSymbolicLink() ||
    !metadata.isFile() ||
    modeBits(metadata.mode) !== mode
  ) {
    throw new Error(
      `Workspace file permissions are invalid: ${basename(path)}.`,
    );
  }
};

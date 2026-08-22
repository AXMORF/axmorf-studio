import { createHash, randomUUID } from "node:crypto";
import {
  chmod,
  link,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  rm,
  stat,
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
  Record<(typeof DESKTOP_MANAGED_FILE_PATHS)[number], string>
> = Object.freeze({
  "AGENTS.md": "AGENTS.md",
  "CLAUDE.md": "CLAUDE.md",
  "GEMINI.md": "GEMINI.md",
  ".agents/skills/remotion-story-producer-video/SKILL.md":
    "skills/remotion-story-producer-video/SKILL.md",
  ".rsp/hermes/INSTALL_PROMPT.md": "hermes/INSTALL_PROMPT.md",
  ".rsp/bin/rsp": "rsp",
  ".rsp/lib/rsp-client.cjs": "rsp-client.cjs",
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
  ".rsp/lib/rsp-client.cjs": 0o600,
});

const PRIVATE_WORKSPACE_DIRECTORIES = new Set<string>([
  ".rsp",
  ".rsp/bin",
  ".rsp/lib",
  ".rsp/hermes",
  ".rsp/work",
  ".rsp/artifacts",
  ".rsp/attempts",
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

export type WorkspaceRootValidation = Readonly<{
  workspaceRoot: string;
  parentRoot: string;
  exists: boolean;
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

export const checksumWorkspaceBytes = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

export const serializeWorkspaceJson = (value: unknown) =>
  `${JSON.stringify(value, null, 2)}\n`;

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
}: {
  readonly integrationResourcesRoot: string;
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

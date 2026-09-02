import { randomUUID } from "node:crypto";
import {
  link,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  unlink,
} from "node:fs/promises";
import { dirname, join, posix } from "node:path";

import { WORKSPACE_VERSION } from "../workspace/resolve-workspace";

const WORKSPACE_DIRECTORIES = [
  "private",
  "src/projects",
  "src/remotion/catalog",
  "public/projects",
  "public/assets/axmorf-shared",
  ".narration-work",
  ".producer-work",
  ".producer-artifacts",
  ".producer-attempts",
  "out",
  "deliveries",
] as const;

const ensureDirectory = async (rootDir: string, relativePath: string) => {
  const assertManagedDirectory = (
    metadata: Awaited<ReturnType<typeof lstat>>,
  ) => {
    if (metadata.isSymbolicLink()) {
      throw new Error(
        `Workspace managed directory cannot be a symbolic link: ${relativePath}.`,
      );
    }
    if (!metadata.isDirectory()) {
      throw new Error(
        `Workspace managed path must be a directory: ${relativePath}.`,
      );
    }
  };
  let current = rootDir;
  for (const part of relativePath.split("/")) {
    current = join(current, part);
    try {
      assertManagedDirectory(await lstat(current));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      try {
        await mkdir(current);
      } catch (mkdirError) {
        if ((mkdirError as NodeJS.ErrnoException).code !== "EEXIST") {
          throw mkdirError;
        }
      }
      assertManagedDirectory(await lstat(current));
    }
  }
};

const collectSeedFiles = async (
  seedRoot: string,
  relativeRoot = "",
): Promise<readonly Readonly<{ relativePath: string; bytes: Buffer }>[]> => {
  const source = relativeRoot === "" ? seedRoot : join(seedRoot, relativeRoot);
  const metadata = await lstat(source);
  if (metadata.isSymbolicLink()) {
    throw new Error("Runtime Workspace seed cannot contain symbolic links.");
  }
  if (metadata.isFile()) {
    return [{ relativePath: relativeRoot, bytes: await readFile(source) }];
  }
  if (!metadata.isDirectory()) {
    throw new Error("Runtime Workspace seed contains a special file.");
  }
  const entries = (await readdir(source, { withFileTypes: true })).sort(
    (left, right) => left.name.localeCompare(right.name),
  );
  const files = await Promise.all(
    entries.map((entry) =>
      collectSeedFiles(
        seedRoot,
        relativeRoot === "" ? entry.name : posix.join(relativeRoot, entry.name),
      ),
    ),
  );
  return files.flat();
};

const inspectTarget = async ({
  rootDir,
  relativePath,
  expected,
}: {
  readonly rootDir: string;
  readonly relativePath: string;
  readonly expected: Buffer;
}) => {
  const parent = dirname(relativePath).split(/[\\/]/u);
  let current = rootDir;
  for (const part of parent) {
    if (part === "." || part === "") continue;
    current = join(current, part);
    try {
      const metadata = await lstat(current);
      if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
        throw new Error(
          `Shared Workspace resource parent is unsafe: ${relativePath}.`,
        );
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }
  const target = join(rootDir, relativePath);
  try {
    const metadata = await lstat(target);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error(
        `Shared Workspace resource target is unsafe: ${relativePath}.`,
      );
    }
    const currentBytes = await readFile(target);
    if (!currentBytes.equals(expected)) {
      throw new Error(
        `Shared Workspace resource conflicts with package bytes: ${relativePath}.`,
      );
    }
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
};

const writeMissingResource = async ({
  rootDir,
  relativePath,
  bytes,
}: {
  readonly rootDir: string;
  readonly relativePath: string;
  readonly bytes: Buffer;
}) => {
  const parent = dirname(relativePath).split(/[\\/]/u).join("/");
  if (parent !== ".") await ensureDirectory(rootDir, parent);
  const destination = join(rootDir, relativePath);
  const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "wx");
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await link(temporary, destination);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const metadata = await lstat(destination);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error(
        `Shared Workspace resource raced with an unsafe target: ${relativePath}.`,
      );
    }
    const raced = await readFile(destination);
    if (!raced.equals(bytes)) {
      throw new Error(
        `Shared Workspace resource raced with different bytes: ${relativePath}.`,
      );
    }
  } finally {
    await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
};

export const bootstrapWorkspace = async ({
  rootDir,
  workspaceSeedRoot,
}: {
  readonly rootDir: string;
  readonly workspaceSeedRoot: string;
}) => {
  const seedFiles = await collectSeedFiles(workspaceSeedRoot);
  if (seedFiles.length === 0) {
    throw new Error("Runtime Workspace seed must contain shared resources.");
  }
  for (const relativePath of WORKSPACE_DIRECTORIES) {
    await ensureDirectory(rootDir, relativePath);
  }
  const current = await Promise.all(
    seedFiles.map((file) =>
      inspectTarget({
        rootDir,
        relativePath: file.relativePath,
        expected: file.bytes,
      }),
    ),
  );
  for (const [index, file] of seedFiles.entries()) {
    if (current[index]) continue;
    await writeMissingResource({ rootDir, ...file });
  }
  return {
    status: "workspace-bootstrapped" as const,
    workspaceVersion: WORKSPACE_VERSION,
    directories: WORKSPACE_DIRECTORIES,
    sharedResourceFiles: seedFiles.map(({ relativePath }) => relativePath),
  };
};

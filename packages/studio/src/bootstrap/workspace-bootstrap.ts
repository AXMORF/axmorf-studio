import { createHash, randomUUID } from "node:crypto";
import {
  link,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  unlink,
} from "node:fs/promises";
import { dirname, join, posix } from "node:path";

import { WORKSPACE_VERSION } from "../workspace/resolve-workspace";

const WORKSPACE_DIRECTORIES = [
  "private",
  "src/films",
  "src/remotion/catalog",
  "public/assets/axmorf-shared",
  "out",
  "deliveries",
] as const;

const SHARED_RESOURCE_MANIFEST = ".axmorf/shared-resources.json";
const sha256 = (bytes: Buffer) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

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
  previousHash,
}: {
  readonly rootDir: string;
  readonly relativePath: string;
  readonly expected: Buffer;
  readonly previousHash?: string;
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
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
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
    if (
      !currentBytes.equals(expected) &&
      sha256(currentBytes) !== previousHash
    ) {
      throw new Error(
        `Shared Workspace resource conflicts with package bytes: ${relativePath}.`,
      );
    }
    return currentBytes;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

const writeResource = async ({
  rootDir,
  relativePath,
  bytes,
  previous,
}: {
  readonly rootDir: string;
  readonly relativePath: string;
  readonly bytes: Buffer;
  readonly previous: Buffer | null;
}) => {
  const parent = dirname(relativePath).split(/[\\/]/u).join("/");
  if (parent !== ".") await ensureDirectory(rootDir, parent);
  const destination = join(rootDir, relativePath);
  const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  try {
    const handle = await open(temporary, "wx");
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    if (previous !== null) {
      // Recheck parents and the exact inspected bytes before atomic replacement.
      const current = await inspectTarget({
        rootDir,
        relativePath,
        expected: previous,
      });
      if (current === null) {
        throw new Error(
          `Shared Workspace resource disappeared: ${relativePath}.`,
        );
      }
      await rename(temporary, destination);
      return;
    }
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

const readSharedResourceManifest = async (rootDir: string) => {
  const path = join(rootDir, SHARED_RESOURCE_MANIFEST);
  await ensureDirectory(rootDir, ".axmorf");
  let bytes: Buffer;
  try {
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error(
        `${SHARED_RESOURCE_MANIFEST} must be a regular non-symbolic file.`,
      );
    }
    bytes = await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { bytes: null, files: {} as Record<string, string> };
    }
    throw error;
  }
  const manifest = JSON.parse(bytes.toString("utf8"));
  if (
    manifest?.schemaVersion !== 1 ||
    manifest.files === null ||
    typeof manifest.files !== "object" ||
    Array.isArray(manifest.files) ||
    Object.values(manifest.files).some(
      (hash) =>
        typeof hash !== "string" || !/^sha256:[a-f0-9]{64}$/u.test(hash),
    )
  ) {
    throw new Error(`${SHARED_RESOURCE_MANIFEST} is not a supported manifest.`);
  }
  return { bytes, files: manifest.files as Record<string, string> };
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
  const previous = await readSharedResourceManifest(rootDir);
  const current = await Promise.all(
    seedFiles.map((file) =>
      inspectTarget({
        rootDir,
        relativePath: file.relativePath,
        expected: file.bytes,
        previousHash: previous.files[file.relativePath],
      }),
    ),
  );
  for (const [index, file] of seedFiles.entries()) {
    if (current[index]?.equals(file.bytes)) continue;
    await writeResource({ rootDir, ...file, previous: current[index] });
  }
  const manifestBytes = Buffer.from(
    `${JSON.stringify(
      {
        schemaVersion: 1,
        files: Object.fromEntries(
          seedFiles.map(({ relativePath, bytes }) => [
            relativePath,
            sha256(bytes),
          ]),
        ),
      },
      null,
      2,
    )}\n`,
  );
  if (!previous.bytes?.equals(manifestBytes)) {
    await writeResource({
      rootDir,
      relativePath: SHARED_RESOURCE_MANIFEST,
      bytes: manifestBytes,
      previous: previous.bytes,
    });
  }
  return {
    status: "workspace-bootstrapped" as const,
    workspaceVersion: WORKSPACE_VERSION,
    directories: WORKSPACE_DIRECTORIES,
    sharedResourceFiles: seedFiles.map(({ relativePath }) => relativePath),
  };
};

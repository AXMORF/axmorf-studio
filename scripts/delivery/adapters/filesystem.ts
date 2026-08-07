import { createHash, randomUUID } from "node:crypto";
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, sep } from "node:path";

import {
  DeliveryReleaseIdSchema,
  Sha256DigestSchema,
  StoryIdSchema,
} from "../../../src/contracts";

const toPosix = (value: string) => value.split(sep).join("/");

const assertSafeRelativePath = (value: string) => {
  if (
    value.length === 0 ||
    isAbsolute(value) ||
    value.includes("\\") ||
    value.split("/").includes("..") ||
    value.includes("://")
  ) {
    throw new Error("Delivery path is unsafe.");
  }
  return value;
};

const assertInsideRoot = (rootDir: string, path: string) => {
  const relativePath = relative(rootDir, path);
  if (
    relativePath === "" ||
    relativePath.startsWith(`..${sep}`) ||
    relativePath === ".." ||
    isAbsolute(relativePath)
  ) {
    throw new Error("Delivery path escapes the repository root.");
  }
};

const pathExists = async (path: string) => {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

export const readDeliveryRegularFile = async ({
  rootDir,
  relativePath,
}: {
  readonly rootDir: string;
  readonly relativePath: string;
}) => {
  const safePath = assertSafeRelativePath(relativePath);
  const absolutePath = join(rootDir, safePath);
  assertInsideRoot(rootDir, absolutePath);
  const metadata = await lstat(absolutePath);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(
      `Delivery input must be a regular file: ${basename(safePath)}.`,
    );
  }
  const resolvedRoot = await realpath(rootDir);
  const resolvedFile = await realpath(absolutePath);
  const resolvedRelative = relative(resolvedRoot, resolvedFile);
  if (
    resolvedRelative.startsWith(`..${sep}`) ||
    resolvedRelative === ".." ||
    isAbsolute(resolvedRelative)
  ) {
    throw new Error("Delivery input resolves outside the repository root.");
  }
  const bytes = Uint8Array.from(await readFile(absolutePath));
  return { absolutePath, bytes, sizeBytes: metadata.size } as const;
};

export const readDeliveryJson = async (request: {
  readonly rootDir: string;
  readonly relativePath: string;
}) => {
  const { bytes } = await readDeliveryRegularFile(request);
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch (error) {
    throw new Error(
      `Delivery JSON is malformed: ${basename(request.relativePath)}.`,
      {
        cause: error,
      },
    );
  }
};

export const checksumDeliveryBytes = (bytes: Uint8Array) =>
  Sha256DigestSchema.parse(
    `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
  );

export const inspectDeliveryFile = async (path: string) => {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size <= 0) {
    throw new Error(
      `Delivery file must be a non-empty regular file: ${basename(path)}.`,
    );
  }
  const bytes = Uint8Array.from(await readFile(path));
  return {
    checksum: checksumDeliveryBytes(bytes),
    sizeBytes: metadata.size,
    bytes,
  } as const;
};

const ensureDirectory = async (path: string) => {
  const existing = await pathExists(path);
  if (existing === null) {
    await mkdir(path);
    return;
  }
  if (!existing.isDirectory() || existing.isSymbolicLink()) {
    throw new Error(`Delivery directory path is unsafe: ${basename(path)}.`);
  }
};

export const resolveDeliveryPaths = ({
  rootDir,
  projectId: rawProjectId,
  releaseId: rawReleaseId,
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly releaseId: string;
}) => {
  const projectId = StoryIdSchema.parse(rawProjectId);
  const releaseId = DeliveryReleaseIdSchema.parse(rawReleaseId);
  const deliveries = join(rootDir, "deliveries");
  const staging = join(deliveries, ".staging");
  const project = join(deliveries, projectId);
  const release = join(project, releaseId);
  for (const path of [deliveries, staging, project, release]) {
    assertInsideRoot(rootDir, path);
  }
  return { deliveries, staging, project, release } as const;
};

export const deliveryReleaseExists = async (path: string) => {
  const metadata = await pathExists(path);
  if (metadata === null) return false;
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error("Delivery release path must be a regular directory.");
  }
  return true;
};

export const assertDeliveryDirectoryChain = async (
  paths: readonly string[],
) => {
  for (const path of paths) {
    const metadata = await pathExists(path);
    if (metadata === null) continue;
    if (metadata.isSymbolicLink()) {
      throw new Error(
        `Delivery directory path must not be a symbolic-link: ${basename(path)}.`,
      );
    }
    if (!metadata.isDirectory()) {
      throw new Error(`Delivery directory path is unsafe: ${basename(path)}.`);
    }
  }
};

export const createDeliveryStaging = async ({
  rootDir,
  projectId,
  releaseId,
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly releaseId: string;
}) => {
  const paths = resolveDeliveryPaths({ rootDir, projectId, releaseId });
  await ensureDirectory(paths.deliveries);
  await ensureDirectory(paths.staging);
  await ensureDirectory(paths.project);
  const staleEntries = await readdir(paths.staging);
  if (staleEntries.length > 0) {
    throw new Error("Delivery staging contains an unfinished package.");
  }
  const root = await mkdtemp(
    join(paths.staging, `${releaseId}.${process.pid}.${randomUUID()}.`),
  );
  return { ...paths, root } as const;
};

export const cleanupDeliveryStaging = async (path: string) => {
  if (
    !basename(path).startsWith("release-") ||
    basename(dirname(path)) !== ".staging"
  ) {
    throw new Error("Refusing to clean an unsafe delivery staging path.");
  }
  await rm(path, { recursive: true, force: true });
};

export const promoteDeliveryStaging = async ({
  staging,
  destination,
}: {
  readonly staging: string;
  readonly destination: string;
}) => {
  if (await deliveryReleaseExists(destination)) {
    throw new Error(
      "Delivery release already exists and cannot be overwritten.",
    );
  }
  await rename(staging, destination);
};

export const copyDeliveryFileExclusive = async ({
  source,
  destination,
}: {
  readonly source: string;
  readonly destination: string;
}) => {
  const destinationMetadata = await pathExists(destination);
  if (destinationMetadata !== null) {
    throw new Error(
      `Delivery staging file already exists: ${basename(destination)}.`,
    );
  }
  await copyFile(source, destination, 1);
};

export const writeDeliveryFileExclusive = async ({
  destination,
  bytes,
}: {
  readonly destination: string;
  readonly bytes: string | Uint8Array;
}) => {
  const handle = await open(destination, "wx");
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
};

export const assertDeliveryReleaseEntries = async ({
  releaseDir,
  expected,
}: {
  readonly releaseDir: string;
  readonly expected: readonly string[];
}) => {
  const rootMetadata = await lstat(releaseDir);
  if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink()) {
    throw new Error("Delivery release must be a regular directory.");
  }
  const entries = await readdir(releaseDir, { withFileTypes: true });
  const actual = entries.map(({ name }) => name).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((name, index) => name !== wanted[index])
  ) {
    throw new Error("Delivery release contains missing or unknown files.");
  }
  for (const entry of entries) {
    if (!entry.isFile() || entry.isSymbolicLink()) {
      throw new Error(
        `Delivery release rejects non-files and symbolic links: ${entry.name}.`,
      );
    }
  }
};

export const deliveryRelativePath = (rootDir: string, path: string) =>
  toPosix(relative(rootDir, path));

export const deliveryFileSize = async (path: string) => (await stat(path)).size;

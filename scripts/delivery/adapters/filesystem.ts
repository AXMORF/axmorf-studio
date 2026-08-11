import { randomUUID } from "node:crypto";
import {
  copyFile,
  link,
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
  unlink,
} from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, sep } from "node:path";

import { DeliveryIdSchema, StoryIdSchema } from "../../../src/contracts";
import { checksumDeliveryBytes } from "../domain/checksum";

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

export const deliveryPathExists = async (path: string) =>
  (await pathExists(path)) !== null;

export const assertDeliveryOutputAbsent = async (path: string) => {
  if ((await pathExists(path)) !== null) {
    throw new Error("Delivery render output already exists before launch.");
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
}: {
  readonly rootDir: string;
  readonly projectId: string;
}) => {
  const projectId = StoryIdSchema.parse(rawProjectId);
  const deliveries = join(rootDir, "deliveries");
  const staging = join(deliveries, ".staging");
  const delivery = join(deliveries, projectId);
  for (const path of [deliveries, staging, delivery]) {
    assertInsideRoot(rootDir, path);
  }
  return { deliveries, staging, delivery } as const;
};

export const deliveryExists = async (path: string) => {
  const metadata = await pathExists(path);
  if (metadata === null) return false;
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error("Delivery path must be a regular directory.");
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
  deliveryId,
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly deliveryId: string;
}) => {
  const safeDeliveryId = DeliveryIdSchema.parse(deliveryId);
  const paths = resolveDeliveryPaths({ rootDir, projectId });
  await ensureDirectory(paths.deliveries);
  await ensureDirectory(paths.staging);
  const staleEntries = await readdir(paths.staging);
  if (staleEntries.length > 0) {
    throw new Error("Delivery staging contains an unfinished package.");
  }
  const root = await mkdtemp(
    join(paths.staging, `${safeDeliveryId}.${process.pid}.${randomUUID()}.`),
  );
  return { ...paths, root } as const;
};

export const cleanupDeliveryStaging = async (path: string) => {
  if (
    !basename(path).startsWith("delivery-") ||
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
  if (!(await deliveryExists(destination))) {
    await rename(staging, destination);
    return;
  }
  const replaced = join(
    dirname(staging),
    `.replaced-${basename(destination)}-${randomUUID()}`,
  );
  await rename(destination, replaced);
  try {
    await rename(staging, destination);
  } catch (error) {
    try {
      await rename(replaced, destination);
    } catch (restoreError) {
      throw new AggregateError(
        [error, restoreError],
        "Delivery replacement failed and the previous delivery could not be restored.",
      );
    }
    throw error;
  }
  await rm(replaced, { recursive: true });
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

export const writeDeliveryFileAtomicExclusive = async ({
  destination,
  bytes,
}: {
  readonly destination: string;
  readonly bytes: string | Uint8Array;
}) => {
  const temporary = join(
    dirname(destination),
    `.${basename(destination)}.${randomUUID()}.tmp`,
  );
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await link(temporary, destination);
  } finally {
    await unlink(temporary).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    });
  }
};

export const assertDeliveryEntries = async ({
  deliveryDir,
  expected,
  ignoredOutputFileName,
}: {
  readonly deliveryDir: string;
  readonly expected: readonly string[];
  readonly ignoredOutputFileName?: string;
}) => {
  const rootMetadata = await lstat(deliveryDir);
  if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink()) {
    throw new Error("Delivery must be a regular directory.");
  }
  const entries = await readdir(deliveryDir, { withFileTypes: true });
  const packageEntries = entries.filter(
    ({ name }) => name !== ignoredOutputFileName,
  );
  const actual = packageEntries.map(({ name }) => name).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((name, index) => name !== wanted[index])
  ) {
    throw new Error("Delivery contains missing or unknown files.");
  }
  for (const entry of packageEntries) {
    if (!entry.isFile() || entry.isSymbolicLink()) {
      throw new Error(
        `Delivery rejects non-files and symbolic links: ${entry.name}.`,
      );
    }
  }
};

export const deliveryRelativePath = (rootDir: string, path: string) =>
  toPosix(relative(rootDir, path));

export const deliveryFileSize = async (path: string) => (await stat(path)).size;

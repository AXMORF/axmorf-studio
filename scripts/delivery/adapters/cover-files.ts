import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  sep,
} from "node:path";

import type { DeliveryCoverAssignment } from "../../../src/contracts";

const pathState = async (path: string) => {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

const assertInsideRoot = (rootDir: string, path: string) => {
  const relativePath = relative(rootDir, path);
  if (
    relativePath === "" ||
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new Error("Cover path escapes the repository root.");
  }
};

const resolveCoverPath = ({
  rootDir,
  relativePath,
}: {
  readonly rootDir: string;
  readonly relativePath: string;
}) => {
  if (
    relativePath.length === 0 ||
    isAbsolute(relativePath) ||
    relativePath.includes("\\") ||
    relativePath.includes("://") ||
    relativePath.split("/").some((part) => part === "" || part === "..")
  ) {
    throw new Error("Cover path is unsafe.");
  }
  const absolutePath = join(rootDir, relativePath);
  assertInsideRoot(rootDir, absolutePath);
  return { absolutePath, relativePath } as const;
};

const assertCoverRoot = async (rootDir: string) => {
  const metadata = await lstat(rootDir);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error("Cover repository root must be a regular directory.");
  }
  return realpath(rootDir);
};

const assertCoverPathComponents = async ({
  rootDir,
  relativePath,
  allowMissing = false,
}: {
  readonly rootDir: string;
  readonly relativePath: string;
  readonly allowMissing?: boolean;
}) => {
  const resolvedRoot = await assertCoverRoot(rootDir);
  const resolved = resolveCoverPath({ rootDir, relativePath });
  const parts = relativePath.split("/");
  let current = rootDir;
  for (const [index, part] of parts.entries()) {
    current = join(current, part);
    const metadata = await pathState(current);
    if (metadata === null) {
      if (allowMissing) return resolved;
      throw new Error(`Cover path is missing: ${part}.`);
    }
    if (metadata.isSymbolicLink()) {
      throw new Error(`Cover path must not contain symbolic links: ${part}.`);
    }
    if (index < parts.length - 1 && !metadata.isDirectory()) {
      throw new Error(`Cover path parent is not a directory: ${part}.`);
    }
  }
  const resolvedPath = await realpath(resolved.absolutePath);
  const resolvedRelative = relative(resolvedRoot, resolvedPath);
  if (
    resolvedRelative === ".." ||
    resolvedRelative.startsWith(`..${sep}`) ||
    isAbsolute(resolvedRelative)
  ) {
    throw new Error("Cover path resolves outside the repository root.");
  }
  return resolved;
};

const ensureCoverDirectory = async ({
  rootDir,
  relativePath,
}: {
  readonly rootDir: string;
  readonly relativePath: string;
}) => {
  await assertCoverRoot(rootDir);
  resolveCoverPath({ rootDir, relativePath });
  let current = rootDir;
  for (const part of relativePath.split("/")) {
    current = join(current, part);
    const metadata = await pathState(current);
    if (metadata === null) await mkdir(current);
    else if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new Error(`Cover directory path is unsafe: ${part}.`);
    }
  }
  return current;
};

export const serializeCoverJson = (value: unknown) =>
  `${JSON.stringify(value, null, 2)}\n`;

const writeExclusive = async (path: string, bytes: string | Uint8Array) => {
  const handle = await open(path, "wx");
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
};

export const writeOrCheckCoverJson = async ({
  rootDir,
  relativePath,
  value,
}: {
  readonly rootDir: string;
  readonly relativePath: string;
  readonly value: unknown;
}) => {
  const bytes = serializeCoverJson(value);
  const { absolutePath: path } = resolveCoverPath({ rootDir, relativePath });
  await ensureCoverDirectory({
    rootDir,
    relativePath: relativePath.split("/").slice(0, -1).join("/"),
  });
  const existing = await pathState(path);
  if (existing !== null) {
    if (!existing.isFile() || existing.isSymbolicLink()) {
      throw new Error(`Cover artifact path is unsafe: ${basename(path)}.`);
    }
    if ((await readFile(path, "utf8")) !== bytes) {
      throw new Error(`Cover artifact is immutable and drifted: ${basename(path)}.`);
    }
    return { noOp: true } as const;
  }
  await writeExclusive(path, bytes);
  return { noOp: false } as const;
};

export const readCoverRegularFile = async ({
  rootDir,
  relativePath,
}: {
  readonly rootDir: string;
  readonly relativePath: string;
}) => {
  const { absolutePath } = await assertCoverPathComponents({
    rootDir,
    relativePath,
  });
  const metadata = await lstat(absolutePath);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size <= 0) {
    throw new Error(
      `Cover artifact must be a non-empty regular file: ${basename(relativePath)}.`,
    );
  }
  const bytes = Uint8Array.from(await readFile(absolutePath));
  return { absolutePath, bytes, sizeBytes: metadata.size } as const;
};

export const readCoverJson = async (request: {
  readonly rootDir: string;
  readonly relativePath: string;
}) => {
  const { bytes } = await readCoverRegularFile(request);
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch (error) {
    throw new Error(
      `Cover JSON is malformed: ${basename(request.relativePath)}.`,
      { cause: error },
    );
  }
};

export const coverResultRelativeRoot = (
  assignment: DeliveryCoverAssignment,
) =>
  `${assignment.exclusivePaths.resultsDirectory}/${assignment.assignmentFingerprint.slice(7)}`;

export const createCoverCheckWorkspace = () =>
  mkdtemp(join(tmpdir(), "rsp-cover-check-"));

export const cleanupCoverCheckWorkspace = async (path: string) => {
  if (!basename(path).startsWith("rsp-cover-check-")) {
    throw new Error("Refusing to clean an unsafe Cover check workspace.");
  }
  await rm(path, { recursive: true, force: true });
};

export const coverResultExists = async ({
  rootDir,
  relativePath,
}: {
  readonly rootDir: string;
  readonly relativePath: string;
}) => {
  const { absolutePath } = await assertCoverPathComponents({
    rootDir,
    relativePath,
    allowMissing: true,
  });
  const metadata = await pathState(absolutePath);
  if (metadata === null) return false;
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error("Cover result path must be a regular directory.");
  }
  return true;
};

export const createCoverResultStaging = async ({
  rootDir,
  assignment,
}: {
  readonly rootDir: string;
  readonly assignment: DeliveryCoverAssignment;
}) => {
  const coverRootRelative = assignment.exclusivePaths.sourceDirectory;
  const stagingRootRelative = `${coverRootRelative}/.staging`;
  const resultsRootRelative = assignment.exclusivePaths.resultsDirectory;
  const coverRoot = await ensureCoverDirectory({
    rootDir,
    relativePath: coverRootRelative,
  });
  const stagingRoot = await ensureCoverDirectory({
    rootDir,
    relativePath: stagingRootRelative,
  });
  await ensureCoverDirectory({
    rootDir,
    relativePath: resultsRootRelative,
  });
  if ((await readdir(stagingRoot)).length > 0) {
    throw new Error("Cover staging contains an unfinished result.");
  }
  const staging = await mkdtemp(
    join(stagingRoot, `${assignment.assignmentFingerprint.slice(7)}.`),
  );
  const destinationRelative = coverResultRelativeRoot(assignment);
  resolveCoverPath({ rootDir, relativePath: destinationRelative });
  return { coverRoot, staging, destinationRelative } as const;
};

export const writeCoverResultFile = writeExclusive;

export const promoteCoverResult = async ({
  rootDir,
  staging,
  destinationRelative,
}: {
  readonly rootDir: string;
  readonly staging: string;
  readonly destinationRelative: string;
}) => {
  if (await coverResultExists({ rootDir, relativePath: destinationRelative })) {
    throw new Error("Cover result already exists and cannot be overwritten.");
  }
  const { absolutePath: destination } = resolveCoverPath({
    rootDir,
    relativePath: destinationRelative,
  });
  await rename(staging, destination);
};

export const cleanupCoverResultStaging = async (path: string) => {
  if (basename(dirname(path)) !== ".staging") {
    throw new Error("Refusing to clean an unsafe Cover result staging path.");
  }
  await rm(path, { recursive: true, force: true });
};

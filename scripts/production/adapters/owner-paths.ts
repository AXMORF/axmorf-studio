import { lstat, realpath } from "node:fs/promises";
import { basename, isAbsolute, join, relative, sep } from "node:path";

export const safeOwnerRelativePath = (value: string) => {
  if (
    value.length === 0 ||
    isAbsolute(value) ||
    value.includes("\\") ||
    value.includes("://") ||
    value.split("/").some((part) => part === "" || part === "..")
  ) {
    throw new Error("Owner output path is unsafe.");
  }
  return value;
};

const assertInsideRoot = (rootDir: string, absolutePath: string) => {
  const resolved = relative(rootDir, absolutePath);
  if (
    resolved === "" ||
    resolved === ".." ||
    resolved.startsWith(`..${sep}`) ||
    isAbsolute(resolved)
  ) {
    throw new Error("Owner output path escapes the repository root.");
  }
};

export const ownerPathState = async (path: string) => {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

export const assertRegularOwnerPathChain = async ({
  rootDir,
  relativePath,
  allowMissing,
}: {
  readonly rootDir: string;
  readonly relativePath: string;
  readonly allowMissing: boolean;
}) => {
  safeOwnerRelativePath(relativePath);
  const rootMetadata = await lstat(rootDir);
  if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink()) {
    throw new Error("Owner repository root must be a regular directory.");
  }
  const rootRealpath = await realpath(rootDir);
  let current = rootDir;
  for (const part of relativePath.split("/")) {
    current = join(current, part);
    assertInsideRoot(rootDir, current);
    const metadata = await ownerPathState(current);
    if (metadata === null) {
      if (allowMissing) return null;
      throw new Error(`Owner output is missing: ${basename(relativePath)}.`);
    }
    if (metadata.isSymbolicLink()) {
      throw new Error("Owner output path must not contain symbolic links.");
    }
  }
  const resolved = await realpath(current);
  const fromRoot = relative(rootRealpath, resolved);
  if (
    fromRoot === ".." ||
    fromRoot.startsWith(`..${sep}`) ||
    isAbsolute(fromRoot)
  ) {
    throw new Error("Owner output resolves outside the repository root.");
  }
  return current;
};

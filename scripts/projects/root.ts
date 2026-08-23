import type { Dirent } from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";

export const readLocalProjectRoot = async (
  rootDir: string,
): Promise<readonly Dirent[]> => {
  return readProjectSourceRoot(join(rootDir, "src/projects"));
};

export const readProjectSourceRoot = async (
  projectsRoot: string,
): Promise<readonly Dirent[]> => {
  let metadata;
  try {
    metadata = await lstat(projectsRoot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new Error("Local Projects root must be a real directory.");
  }
  return (await readdir(projectsRoot, { withFileTypes: true })).sort(
    (left, right) => left.name.localeCompare(right.name),
  );
};

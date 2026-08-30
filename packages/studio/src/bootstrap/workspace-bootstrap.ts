import { lstat, mkdir } from "node:fs/promises";
import { join } from "node:path";

import { WORKSPACE_VERSION } from "../workspace/resolve-workspace";

const WORKSPACE_DIRECTORIES = [
  "private",
  "src/projects",
  "public/projects",
  ".narration-work",
  ".producer-work",
  ".producer-artifacts",
  ".producer-attempts",
  "out",
  "deliveries",
] as const;

const ensureDirectory = async (rootDir: string, relativePath: string) => {
  let current = rootDir;
  for (const part of relativePath.split("/")) {
    current = join(current, part);
    try {
      const metadata = await lstat(current);
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
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await mkdir(current);
    }
  }
};

export const bootstrapWorkspace = async (rootDir: string) => {
  for (const relativePath of WORKSPACE_DIRECTORIES) {
    await ensureDirectory(rootDir, relativePath);
  }
  return {
    status: "workspace-bootstrapped" as const,
    workspaceVersion: WORKSPACE_VERSION,
    directories: WORKSPACE_DIRECTORIES,
  };
};

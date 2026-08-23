import { randomUUID } from "node:crypto";
import {
  lstat,
  open,
  readFile,
  realpath,
  unlink,
  type FileHandle,
} from "node:fs/promises";
import { join, resolve } from "node:path";

const lockPath = (rootDir: string) => join(rootDir, ".project-operation.lock");

export type RepositoryOperationLock = Readonly<{
  release: () => Promise<void>;
}>;

export const acquireRepositoryOperationLock = async ({
  rootDir,
  ownerId,
  initialize = async ({ handle, bytes }) => {
    await handle.writeFile(bytes, "utf8");
    await handle.sync();
  },
  close = (handle) => handle.close(),
}: {
  readonly rootDir: string;
  readonly ownerId: string;
  readonly initialize?: (input: {
    readonly handle: FileHandle;
    readonly bytes: string;
  }) => Promise<void>;
  readonly close?: (handle: FileHandle) => Promise<void>;
}): Promise<RepositoryOperationLock> => {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(ownerId)) {
    throw new Error("Repository operation lock owner is invalid.");
  }
  const canonicalRoot = resolve(rootDir);
  const rootMetadata = await lstat(canonicalRoot);
  if (
    rootMetadata.isSymbolicLink() ||
    !rootMetadata.isDirectory() ||
    (await realpath(canonicalRoot)) !== canonicalRoot
  ) {
    throw new Error("Repository operation lock root must be canonical.");
  }
  const path = lockPath(canonicalRoot);
  const token = randomUUID();
  const bytes = `${JSON.stringify({ schemaVersion: 1, ownerId, token })}\n`;
  let handle;
  let initialized = false;
  let installed = false;
  try {
    handle = await open(path, "wx", 0o600);
    await initialize({ handle, bytes });
    initialized = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error("Another Project operation is already active.", {
        cause: error,
      });
    }
    throw error;
  } finally {
    try {
      if (handle !== undefined) {
        await close(handle);
        installed = initialized;
      }
    } finally {
      if (handle !== undefined && !installed) {
        await unlink(path).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT") throw error;
        });
      }
    }
  }
  let released = false;
  return {
    release: async () => {
      if (released) return;
      if ((await readFile(path, "utf8")) !== bytes) {
        throw new Error("Repository operation lock ownership changed.");
      }
      await unlink(path);
      released = true;
    },
  };
};

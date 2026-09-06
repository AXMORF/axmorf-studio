import { randomUUID } from "node:crypto";
import {
  lstat,
  open,
  readFile,
  unlink,
  type FileHandle,
} from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";
import {
  getProcessOwnership,
  inspectProcessOwnership,
  ProcessOwnershipSchema,
} from "../../packages/studio/src/process/process-ownership";

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
  recoveryGuard = false,
}: {
  readonly rootDir: string;
  readonly ownerId: string;
  readonly initialize?: (input: {
    readonly handle: FileHandle;
    readonly bytes: string;
  }) => Promise<void>;
  readonly close?: (handle: FileHandle) => Promise<void>;
  readonly recoveryGuard?: boolean;
}): Promise<RepositoryOperationLock> => {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(ownerId)) {
    throw new Error("Repository operation lock owner is invalid.");
  }
  const path = lockPath(rootDir);
  if (!recoveryGuard) await assertNoRecoveryGuard(rootDir);
  const token = randomUUID();
  const bytes = `${JSON.stringify({ schemaVersion: 2, ownerId, token, process: getProcessOwnership() })}\n`;
  let handle;
  let initialized = false;
  let installed = false;
  try {
    handle = await open(path, "wx", 0o600);
    await initialize({ handle, bytes });
    if (!recoveryGuard) await assertNoRecoveryGuard(rootDir);
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

const recoveryGuardPath = (rootDir: string) =>
  join(rootDir, ".project-operation.recovery.lock");
const assertNoRecoveryGuard = async (rootDir: string) => {
  try {
    await lstat(recoveryGuardPath(rootDir));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  throw new Error("Repository interruption recovery is already active.");
};
const LockSchema = z
  .object({
    schemaVersion: z.literal(2),
    ownerId: z.string(),
    token: z.string().uuid(),
    process: ProcessOwnershipSchema,
  })
  .strict();

export const inspectRepositoryOperationLock = async ({
  rootDir,
}: {
  readonly rootDir: string;
}) => {
  await assertNoRecoveryGuard(rootDir);
  const path = lockPath(rootDir);
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink())
      throw new Error("Repository operation lock is unsafe.");
    const bytes = await readFile(path, "utf8");
    const parsed = LockSchema.safeParse(JSON.parse(bytes));
    if (!parsed.success)
      throw new Error(
        "Repository operation lock has no verifiable process owner; legacy or invalid lock requires operator investigation.",
      );
    return {
      ...parsed.data,
      bytes,
      state: inspectProcessOwnership(parsed.data.process),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

/** Explicit interruption recovery only. Normal operations never steal locks. */
export const acquireInterruptedRepositoryOperationLock = async ({
  rootDir,
  expectedToken,
  expectedProcessInstanceId,
  archivePath,
}: {
  readonly rootDir: string;
  readonly expectedToken: string;
  readonly expectedProcessInstanceId: string;
  readonly archivePath: string;
}) => {
  const guard = await open(recoveryGuardPath(rootDir), "wx", 0o600);
  try {
    await guard.writeFile(JSON.stringify(getProcessOwnership()));
    await guard.sync();
    const path = lockPath(rootDir);
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink())
      throw new Error("Repository operation lock is unsafe.");
    const bytes = await readFile(path, "utf8");
    const lock = LockSchema.parse(JSON.parse(bytes));
    if (
      lock.token !== expectedToken ||
      lock.process.instanceId !== expectedProcessInstanceId ||
      inspectProcessOwnership(lock.process) !== "exited"
    ) {
      throw new Error("Repository operation lock interruption proof changed.");
    }
    // Preserve the exact former lock as an audit record before replacing it.
    let archive;
    try {
      archive = await open(archivePath, "wx", 0o600);
      await archive.writeFile(bytes);
      await archive.sync();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const archived = await lstat(archivePath);
      if (
        !archived.isFile() ||
        archived.isSymbolicLink() ||
        (await readFile(archivePath, "utf8")) !== bytes
      ) {
        throw new Error("Interrupted operation lock archive changed.", {
          cause: error,
        });
      }
    } finally {
      await archive?.close();
    }
    await unlink(path);
    return await acquireRepositoryOperationLock({
      rootDir,
      ownerId: "project-attempt-interrupt",
      recoveryGuard: true,
    });
  } finally {
    await guard.close();
    await unlink(recoveryGuardPath(rootDir));
  }
};

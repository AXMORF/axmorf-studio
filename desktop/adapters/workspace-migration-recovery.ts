import { randomUUID } from "node:crypto";
import {
  chmod,
  link,
  lstat,
  open,
  readFile,
  realpath,
  unlink,
} from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { z } from "zod";

import { syncWorkspaceDirectory } from "./workspace-filesystem";

export const WORKSPACE_MIGRATION_RECOVERY_FILE_NAME =
  "workspace-migration-recovery.json" as const;

const NormalizedAbsolutePathSchema = z
  .string()
  .min(1)
  .refine((value) => isAbsolute(value) && resolve(value) === value, {
    message:
      "Workspace migration recovery paths must be normalized and absolute.",
  });

export const WorkspaceMigrationRecoveryPointerSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    contractVersion: z.literal("desktop-workspace-migration-recovery-v1"),
    migrationId: z.string().uuid(),
    parentRoot: NormalizedAbsolutePathSchema,
    migrationRoot: NormalizedAbsolutePathSchema,
    sourceWorkspaceRoot: NormalizedAbsolutePathSchema,
    targetWorkspaceRoot: NormalizedAbsolutePathSchema,
  })
  .superRefine((pointer, context) => {
    if (
      dirname(pointer.migrationRoot) !== pointer.parentRoot ||
      basename(pointer.migrationRoot) !==
        `.axmorf-workspace-migration-${pointer.migrationId}` ||
      dirname(pointer.targetWorkspaceRoot) !== pointer.parentRoot
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Workspace migration recovery pointer identity is inconsistent.",
      });
    }
  })
  .readonly();

export type WorkspaceMigrationRecoveryPointer = z.infer<
  typeof WorkspaceMigrationRecoveryPointerSchema
>;

const recoveryPath = (applicationSupportRoot: string) => {
  if (!isAbsolute(applicationSupportRoot)) {
    throw new Error("Application Support root must be absolute.");
  }
  return join(
    resolve(applicationSupportRoot),
    WORKSPACE_MIGRATION_RECOVERY_FILE_NAME,
  );
};

const assertOwnerOnlyApplicationSupport = async (root: string) => {
  const metadata = await lstat(root);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new Error("Application Support root must be a real directory.");
  }
  if ((await realpath(root)) !== resolve(root)) {
    throw new Error("Application Support root must be canonical.");
  }
  await chmod(root, 0o700);
};

const optionalMetadata = async (path: string) => {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

export const loadWorkspaceMigrationRecoveryPointer = async ({
  applicationSupportRoot: rawApplicationSupportRoot,
}: {
  readonly applicationSupportRoot: string;
}): Promise<WorkspaceMigrationRecoveryPointer | null> => {
  const applicationSupportRoot = resolve(rawApplicationSupportRoot);
  const path = recoveryPath(applicationSupportRoot);
  const metadata = await optionalMetadata(path);
  if (metadata === null) return null;
  await assertOwnerOnlyApplicationSupport(applicationSupportRoot);
  if (
    metadata.isSymbolicLink() ||
    !metadata.isFile() ||
    (metadata.mode & 0o777) !== 0o600
  ) {
    throw new Error(
      "Workspace migration recovery pointer must be an owner-only regular file.",
    );
  }
  return WorkspaceMigrationRecoveryPointerSchema.parse(
    JSON.parse(await readFile(path, "utf8")),
  );
};

export const writeWorkspaceMigrationRecoveryPointer = async ({
  applicationSupportRoot: rawApplicationSupportRoot,
  pointer: rawPointer,
}: {
  readonly applicationSupportRoot: string;
  readonly pointer: WorkspaceMigrationRecoveryPointer;
}) => {
  const applicationSupportRoot = resolve(rawApplicationSupportRoot);
  const path = recoveryPath(applicationSupportRoot);
  const pointer = WorkspaceMigrationRecoveryPointerSchema.parse(rawPointer);
  await assertOwnerOnlyApplicationSupport(applicationSupportRoot);
  const existing = await optionalMetadata(path);
  if (existing !== null) {
    throw new Error("A Workspace migration recovery pointer already exists.");
  }
  const temporaryPath = join(
    applicationSupportRoot,
    `.${WORKSPACE_MIGRATION_RECOVERY_FILE_NAME}.${randomUUID()}.tmp`,
  );
  let promoted = false;
  try {
    const handle = await open(temporaryPath, "wx", 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(pointer, null, 2)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await chmod(temporaryPath, 0o600);
    await link(temporaryPath, path);
    await unlink(temporaryPath);
    promoted = true;
    await syncWorkspaceDirectory(applicationSupportRoot);
  } finally {
    if (!promoted) {
      await unlink(temporaryPath).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
  }
  const verified = await loadWorkspaceMigrationRecoveryPointer({
    applicationSupportRoot,
  });
  if (verified === null || verified.migrationId !== pointer.migrationId) {
    throw new Error(
      "Workspace migration recovery pointer verification failed.",
    );
  }
};

export const removeWorkspaceMigrationRecoveryPointer = async ({
  applicationSupportRoot: rawApplicationSupportRoot,
  migrationId,
}: {
  readonly applicationSupportRoot: string;
  readonly migrationId: string;
}) => {
  const applicationSupportRoot = resolve(rawApplicationSupportRoot);
  const current = await loadWorkspaceMigrationRecoveryPointer({
    applicationSupportRoot,
  });
  if (current === null) return;
  if (current.migrationId !== migrationId) {
    throw new Error("Workspace migration recovery pointer ownership changed.");
  }
  await unlink(recoveryPath(applicationSupportRoot));
  await syncWorkspaceDirectory(applicationSupportRoot);
};

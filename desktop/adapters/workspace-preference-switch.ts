import { randomUUID } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  rmdir,
  unlink,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

import {
  DESKTOP_PREFERENCES_CONTRACT_VERSION,
  DesktopPreferencesSchema,
} from "../contracts/workspace";
import type { WorkspacePreferenceSwitcher } from "../application/migrate-workspace";

const syncDirectory = async (directory: string) => {
  const handle = await open(directory, "r");
  try {
    await handle.sync();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EINVAL" && code !== "ENOTSUP" && code !== "EBADF") {
      throw error;
    }
  } finally {
    await handle.close();
  }
};

const readCurrentPreference = async (preferencesPath: string) => {
  const metadata = await lstat(preferencesPath);
  if (
    metadata.isSymbolicLink() ||
    !metadata.isFile() ||
    (metadata.mode & 0o777) !== 0o600
  ) {
    throw new Error("Desktop preferences must be an owner-only regular file.");
  }
  return DesktopPreferencesSchema.parse(
    JSON.parse(await readFile(preferencesPath, "utf8")),
  );
};

export const createWorkspacePreferenceSwitcher = ({
  preferencesPath: rawPreferencesPath,
}: {
  readonly preferencesPath: string;
}): WorkspacePreferenceSwitcher => {
  const preferencesPath = resolve(rawPreferencesPath);
  const parent = dirname(preferencesPath);
  const lockPath = join(parent, ".workspace-migration.lock");
  return async ({ expectedWorkspaceRoot, nextWorkspaceRoot }) => {
    let locked = false;
    try {
      await mkdir(lockPath, { mode: 0o700 });
      await chmod(lockPath, 0o700);
      locked = true;
      const current = await readCurrentPreference(preferencesPath);
      if (resolve(current.workspaceRoot) !== resolve(expectedWorkspaceRoot)) {
        throw new Error("Workspace preference authority changed during migration.");
      }
      const next = DesktopPreferencesSchema.parse({
        schemaVersion: 1,
        contractVersion: DESKTOP_PREFERENCES_CONTRACT_VERSION,
        workspaceRoot: resolve(nextWorkspaceRoot),
      });
      const temporaryPath = join(
        parent,
        `.${basename(preferencesPath)}.${process.pid}.${randomUUID()}.tmp`,
      );
      let promoted = false;
      try {
        const handle = await open(temporaryPath, "wx", 0o600);
        try {
          await handle.writeFile(`${JSON.stringify(next, null, 2)}\n`, "utf8");
          await handle.sync();
        } finally {
          await handle.close();
        }
        await chmod(temporaryPath, 0o600);
        await rename(temporaryPath, preferencesPath);
        promoted = true;
        await syncDirectory(parent);
      } finally {
        if (!promoted) {
          await unlink(temporaryPath).catch((error: NodeJS.ErrnoException) => {
            if (error.code !== "ENOENT") throw error;
          });
        }
      }
      const verified = await readCurrentPreference(preferencesPath);
      if (resolve(verified.workspaceRoot) !== resolve(nextWorkspaceRoot)) {
        throw new Error("Workspace preference switch verification failed.");
      }
    } finally {
      if (locked) {
        await rmdir(lockPath);
        await syncDirectory(parent);
      }
    }
  };
};

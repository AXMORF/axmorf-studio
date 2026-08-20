import { randomUUID } from "node:crypto";
import { lstat, mkdir, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";

const state = async (path: string) => {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};
export const promoteDirectoryAtomically = async ({
  staging,
  target,
}: {
  readonly staging: string;
  readonly target: string;
}) => {
  const parent = dirname(target);
  await mkdir(parent, { recursive: true });
  const backup = `${target}.backup-${randomUUID()}`;
  const existing = await state(target);
  if (existing !== null && (!existing.isDirectory() || existing.isSymbolicLink())) {
    throw new Error("Atomic promotion target is unsafe.");
  }
  let backedUp = false;
  try {
    if (existing !== null) {
      await rename(target, backup);
      backedUp = true;
    }
    await rename(staging, target);
    if (backedUp) await rm(backup, { recursive: true, force: true });
  } catch (error) {
    if ((await state(target)) !== null) await rm(target, { recursive: true, force: true });
    if (backedUp && (await state(backup)) !== null) await rename(backup, target);
    throw error;
  }
};

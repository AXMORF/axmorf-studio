import { createHash } from "node:crypto";
import { lstat, mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

import {
  ExternalRepositoryPathSchema,
  Sha256DigestSchema,
  type Sha256Digest,
} from "../../src/contracts";

export const checksumExternalBytes = (bytes: Iterable<number>): Sha256Digest =>
  Sha256DigestSchema.parse(
    `sha256:${createHash("sha256").update(Uint8Array.from(bytes)).digest("hex")}`,
  );

const resolveContainedPath = (rootDir: string, rawPath: unknown): string => {
  const relativePath = ExternalRepositoryPathSchema.parse(rawPath);
  const resolvedRoot = resolve(rootDir);
  const absolutePath = resolve(resolvedRoot, relativePath);
  if (!absolutePath.startsWith(`${resolvedRoot}${sep}`)) {
    throw new Error("External reference path escapes its fixed root.");
  }
  return absolutePath;
};

export const readExternalRegularFile = async (
  rootDir: string,
  relativePath: unknown,
): Promise<Buffer> => {
  const absolutePath = resolveContainedPath(rootDir, relativePath);
  const stat = await lstat(absolutePath);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(
      "External reference files must be regular non-symbolic files.",
    );
  }
  return readFile(absolutePath);
};

export const appendBytesAtomically = async (
  rootDir: string,
  relativePath: unknown,
  bytes: Iterable<number>,
): Promise<string> => {
  const destination = resolveContainedPath(rootDir, relativePath);
  await mkdir(dirname(destination), { recursive: true });
  try {
    const current = await readFile(destination);
    if (checksumExternalBytes(current) !== checksumExternalBytes(bytes)) {
      throw new Error(
        "Content-addressed record already exists with different bytes.",
      );
    }
    return destination;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const temporary = `${destination}.tmp-${process.pid}-${Date.now()}`;
  const handle = await open(temporary, "wx");
  try {
    await handle.writeFile(Uint8Array.from(bytes));
    await handle.sync();
    await handle.close();
    try {
      await rename(temporary, destination);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const current = await readFile(destination);
      if (checksumExternalBytes(current) !== checksumExternalBytes(bytes)) {
        throw error;
      }
    }
  } finally {
    await handle.close().catch(() => undefined);
    await rm(temporary, { force: true });
  }
  return destination;
};

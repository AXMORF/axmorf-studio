import { randomUUID } from "node:crypto";
import { link, mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export type AtomicTextFileWriter = (request: {
  readonly destination: string;
  readonly bytes: string;
  readonly mode: "create" | "replace";
  readonly temporaryDirectory?: string;
}) => Promise<{ readonly written: boolean }>;

export type AtomicBinaryFileWriter = (request: {
  readonly destination: string;
  readonly bytes: Uint8Array;
  readonly mode: "create" | "replace";
}) => Promise<{ readonly written: boolean }>;

const syncDirectory = async (directory: string): Promise<void> => {
  let handle;
  try {
    handle = await open(directory, "r");
    await handle.sync();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EINVAL" && code !== "ENOTSUP" && code !== "EBADF") {
      throw error;
    }
  } finally {
    await handle?.close();
  }
};

export const readOptionalTextFile = async (
  destination: string,
): Promise<string | null> => {
  try {
    return await readFile(destination, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

const readOptionalBinaryFile = async (
  destination: string,
): Promise<Buffer | null> => {
  try {
    return await readFile(destination);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

export const writeBinaryFileAtomic: AtomicBinaryFileWriter = async ({
  destination,
  bytes,
  mode,
}) => {
  const parent = dirname(destination);
  await mkdir(parent, { recursive: true });
  const existing = await readOptionalBinaryFile(destination);
  if (existing !== null && existing.equals(Buffer.from(bytes))) {
    return { written: false };
  }
  if (mode === "create" && existing !== null) {
    throw new Error(
      `Immutable binary file conflicts: ${basename(destination)}.`,
    );
  }
  const temporaryPath = join(
    parent,
    `.${basename(destination)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let installed = false;
  try {
    const handle = await open(temporaryPath, "wx");
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    if (mode === "create") {
      try {
        await link(temporaryPath, destination);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        const racedBytes = await readOptionalBinaryFile(destination);
        if (racedBytes === null || !racedBytes.equals(Buffer.from(bytes))) {
          throw new Error(
            `Immutable binary file conflicts: ${basename(destination)}.`,
          );
        }
        return { written: false };
      }
      await unlink(temporaryPath);
    } else {
      await rename(temporaryPath, destination);
    }
    installed = true;
    await syncDirectory(parent);
    return { written: true };
  } finally {
    if (!installed) {
      await unlink(temporaryPath).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
  }
};

export const writeTextFileAtomic: AtomicTextFileWriter = async ({
  destination,
  bytes,
  mode,
  temporaryDirectory,
}) => {
  const parent = dirname(destination);
  await mkdir(parent, { recursive: true });
  const temporaryParent = temporaryDirectory ?? parent;
  await mkdir(temporaryParent, { recursive: true });
  const existing = await readOptionalTextFile(destination);
  if (existing === bytes) return { written: false };
  if (mode === "create" && existing !== null) {
    throw new Error(`Immutable text file conflicts: ${basename(destination)}.`);
  }

  const temporaryPath = join(
    temporaryParent,
    `.${basename(destination)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let installed = false;
  try {
    const handle = await open(temporaryPath, "wx");
    try {
      await handle.writeFile(bytes, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    if (mode === "create") {
      try {
        await link(temporaryPath, destination);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        const racedBytes = await readOptionalTextFile(destination);
        if (racedBytes !== bytes) {
          throw new Error(
            `Immutable text file conflicts: ${basename(destination)}.`,
          );
        }
        return { written: false };
      }
      await unlink(temporaryPath);
    } else {
      await rename(temporaryPath, destination);
    }
    installed = true;
    await syncDirectory(parent);
    return { written: true };
  } finally {
    if (!installed) {
      await unlink(temporaryPath).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
  }
};

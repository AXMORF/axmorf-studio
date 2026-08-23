import { randomUUID } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  unlink,
} from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";

import type { NarrationSeal } from "../domain/seal";
import { sha256Bytes } from "../domain/pcm-wav";
import type { ProductionLocations } from "../../project-production/domain/production-locations";
import { resolveNarrationMediaLogicalPath } from "../production-paths";

export type NarrationSealFileOperations = {
  readonly commitImmutableDirectory: (input: {
    readonly sourceDir: string;
    readonly destinationDir: string;
  }) => Promise<void>;
  readonly writeJsonAtomic: (input: {
    readonly destination: string;
    readonly value: unknown;
  }) => Promise<void>;
};

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

const sortJsonValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, sortJsonValue(entry)]),
    );
  }
  return value;
};

export const writeJsonAtomic = async ({
  destination,
  value,
}: {
  readonly destination: string;
  readonly value: unknown;
}): Promise<void> => {
  const parent = dirname(destination);
  await mkdir(parent, { recursive: true });
  const temporaryPath = join(
    parent,
    `.${basename(destination)}.${process.pid}.${randomUUID()}.tmp`,
  );
  const handle = await open(temporaryPath, "wx");
  try {
    await handle.writeFile(
      `${JSON.stringify(sortJsonValue(value), null, 2)}\n`,
      "utf8",
    );
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporaryPath, destination);
  await syncDirectory(parent);
};

const listFiles = async (
  root: string,
  directory = root,
): Promise<readonly string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(root, path)));
    } else if (entry.isFile()) {
      files.push(relative(root, path));
    } else {
      throw new Error(
        "Immutable narration directories may contain files only.",
      );
    }
  }
  return files;
};

const assertDirectoriesEqual = async (
  sourceDir: string,
  destinationDir: string,
): Promise<void> => {
  const [sourceFiles, destinationFiles] = await Promise.all([
    listFiles(sourceDir),
    listFiles(destinationDir),
  ]);
  if (JSON.stringify(sourceFiles) !== JSON.stringify(destinationFiles)) {
    throw new Error(
      "Existing immutable narration directory has a different file set.",
    );
  }
  for (const file of sourceFiles) {
    const [sourceBytes, destinationBytes] = await Promise.all([
      readFile(join(sourceDir, file)),
      readFile(join(destinationDir, file)),
    ]);
    if (sha256Bytes(sourceBytes) !== sha256Bytes(destinationBytes)) {
      throw new Error(`Existing immutable narration file differs: ${file}.`);
    }
  }
};

export const commitImmutableDirectory = async ({
  sourceDir,
  destinationDir,
}: {
  readonly sourceDir: string;
  readonly destinationDir: string;
}): Promise<void> => {
  await mkdir(dirname(destinationDir), { recursive: true });
  try {
    await stat(destinationDir);
    await assertDirectoriesEqual(sourceDir, destinationDir);
    await rm(sourceDir, { recursive: true, force: true });
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await rename(sourceDir, destinationDir);
  await syncDirectory(dirname(destinationDir));
};

export const createNarrationSealFileOperations =
  (): NarrationSealFileOperations => ({
    commitImmutableDirectory,
    writeJsonAtomic,
  });

export const withProjectSealLock = async <Result>(
  {
    lockPath,
    operation,
  }: { readonly lockPath: string; readonly operation: string },
  run: () => Promise<Result>,
): Promise<Result> => {
  await mkdir(dirname(lockPath), { recursive: true });
  let handle;
  try {
    handle = await open(lockPath, "wx");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(
        `Narration seal lock exists at ${lockPath}. Verify no narration process is running, inspect it, then remove only this exact stale lock.`,
      );
    }
    throw error;
  }
  try {
    await handle.writeFile(
      `${JSON.stringify({ pid: process.pid, operation })}\n`,
      "utf8",
    );
    await handle.sync();
    return await run();
  } finally {
    await handle.close();
    await unlink(lockPath);
  }
};

export const stageNarrationSealDirectory = async ({
  locations,
  seal,
}: {
  readonly locations: ProductionLocations;
  readonly seal: NarrationSeal;
}): Promise<{
  readonly stagingDirectory: string;
  readonly destinationDir: string;
}> => {
  const destinationDir = dirname(
    resolveNarrationMediaLogicalPath({
      locations,
      storyId: seal.manifest.storyId,
      logicalPath: seal.manifest.completeAudio.localPath,
    }),
  );
  const parent = dirname(destinationDir);
  await mkdir(parent, { recursive: true });
  const stagingDirectory = await mkdtemp(
    join(parent, `.${basename(destinationDir)}.staging-`),
  );
  await mkdir(join(stagingDirectory, "chunks"), { recursive: true });
  const writeBytesSynced = async (path: string, bytes: Buffer) => {
    const handle = await open(path, "wx");
    try {
      await handle.writeFile(Uint8Array.from(bytes));
      await handle.sync();
    } finally {
      await handle.close();
    }
  };
  for (const [chunkId, wav] of seal.chunkWavs) {
    await writeBytesSynced(
      join(stagingDirectory, "chunks", `${chunkId}.wav`),
      wav,
    );
  }
  await writeBytesSynced(
    join(stagingDirectory, "complete.wav"),
    seal.completeWav,
  );
  await syncDirectory(stagingDirectory);
  return { stagingDirectory, destinationDir };
};

export const removeNarrationSealStaging = async (
  stagingDirectory: string,
): Promise<void> => {
  await rm(stagingDirectory, { recursive: true, force: true });
};

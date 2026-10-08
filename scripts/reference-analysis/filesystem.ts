import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, readdir } from "node:fs/promises";
import { join } from "node:path";

import { serializeCanonicalJson } from "@axmorf/studio/contracts";

export const referenceChecksum = (bytes: Uint8Array) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

export const ensureReferenceDirectory = async (path: string) => {
  try {
    await mkdir(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  const metadata = await lstat(path);
  if (!metadata.isDirectory() || metadata.isSymbolicLink())
    throw new Error("Reference analysis output directory is unsafe.");
};

const assertInputPath = async (rootDir: string, inputPath: string) => {
  let path = rootDir;
  const parts = inputPath.split("/");
  for (const [index, part] of parts.entries()) {
    path = join(path, part);
    const metadata = await lstat(path);
    if (
      metadata.isSymbolicLink() ||
      (index === parts.length - 1
        ? !metadata.isFile() || metadata.size <= 0
        : !metadata.isDirectory())
    )
      throw new Error(
        "Reference input or parent must be regular and contain no symbolic link.",
      );
  }
  return path;
};

export const inspectReferenceFile = async (
  path: string,
  checkDeadline: () => void,
) => {
  checkDeadline();
  const pathState = await lstat(path);
  if (pathState.isSymbolicLink() || !pathState.isFile() || pathState.size === 0)
    throw new Error("Reference evidence must be a non-empty regular file.");
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    if (
      !before.isFile() ||
      before.ino !== pathState.ino ||
      before.dev !== pathState.dev
    )
      throw new Error("Reference evidence changed before inspection.");
    const hash = createHash("sha256");
    for await (const chunk of handle.createReadStream({ autoClose: false })) {
      checkDeadline();
      hash.update(chunk);
    }
    const after = await handle.stat();
    const pathAfter = await lstat(path);
    if (
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      after.ctimeMs !== before.ctimeMs ||
      pathAfter.isSymbolicLink() ||
      pathAfter.ino !== before.ino ||
      pathAfter.dev !== before.dev
    )
      throw new Error("Reference evidence changed during checksum inspection.");
    checkDeadline();
    return { checksum: `sha256:${hash.digest("hex")}`, sizeBytes: before.size };
  } finally {
    await handle.close();
  }
};

export const snapshotReferenceInput = async (
  rootDir: string,
  inputPath: string,
  checkDeadline: () => void,
) => ({
  path: inputPath,
  ...(await inspectReferenceFile(
    await assertInputPath(rootDir, inputPath),
    checkDeadline,
  )),
});

export const freezeReferenceInput = async (
  rootDir: string,
  input: Awaited<ReturnType<typeof snapshotReferenceInput>>,
  destination: string,
  checkDeadline: () => void,
) => {
  const path = await assertInputPath(rootDir, input.path);
  const source = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  let output: Awaited<ReturnType<typeof open>> | undefined;
  try {
    const before = await source.stat();
    if (!before.isFile() || before.size !== input.sizeBytes)
      throw new Error("Reference source changed before freezing.");
    output = await open(destination, "wx");
    const hash = createHash("sha256");
    for await (const chunk of source.createReadStream({ autoClose: false })) {
      checkDeadline();
      hash.update(chunk);
      let offset = 0;
      while (offset < chunk.length) {
        const { bytesWritten } = await output.write(
          chunk,
          offset,
          chunk.length - offset,
        );
        if (bytesWritten === 0)
          throw new Error("Reference frozen copy made no progress.");
        offset += bytesWritten;
      }
    }
    await output.sync();
    const after = await source.stat();
    if (
      !before.isFile() ||
      before.size !== input.sizeBytes ||
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      after.ctimeMs !== before.ctimeMs ||
      `sha256:${hash.digest("hex")}` !== input.checksum
    )
      throw new Error("Reference input changed while freezing.");
  } finally {
    await Promise.all([source.close(), output?.close()]);
  }
  const frozen = await inspectReferenceFile(destination, checkDeadline);
  if (
    frozen.checksum !== input.checksum ||
    frozen.sizeBytes !== input.sizeBytes
  )
    throw new Error("Reference frozen input checksum drifted.");
};

export const readReferenceEvidence = async (
  path: string,
  expectedSize?: number,
) => {
  const metadata = await lstat(path);
  if (
    metadata.isSymbolicLink() ||
    !metadata.isFile() ||
    metadata.size === 0 ||
    (expectedSize !== undefined && metadata.size !== expectedSize)
  )
    throw new Error(
      "Reference decoded sample is not one complete regular frame.",
    );
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const bytes = await handle.readFile();
    if (bytes.length !== metadata.size)
      throw new Error("Reference decoded sample changed during reading.");
    return bytes;
  } finally {
    await handle.close();
  }
};

export type ReferenceManifest = readonly Readonly<{
  path: string;
  checksum: string;
  sizeBytes: number;
}>[];

export const inspectReferenceReportManifest = async (
  root: string,
  checkDeadline: () => void,
): Promise<ReferenceManifest> => {
  const manifest: { path: string; checksum: string; sizeBytes: number }[] = [];
  const visit = async (directory: string, prefix: string) => {
    const state = await lstat(directory);
    if (!state.isDirectory() || state.isSymbolicLink())
      throw new Error("Reference analysis report directory is unsafe.");
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      checkDeadline();
      const logicalPath = prefix + entry.name;
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink())
        throw new Error("Reference analysis report contains a symbolic link.");
      if (entry.isDirectory()) await visit(path, `${logicalPath}/`);
      else if (entry.isFile())
        manifest.push({
          path: logicalPath,
          ...(await inspectReferenceFile(path, checkDeadline)),
        });
      else
        throw new Error("Reference analysis report contains unsafe evidence.");
    }
  };
  await visit(root, "");
  return manifest.sort((left, right) => left.path.localeCompare(right.path));
};

export const assertReferenceReportManifest = async (
  root: string,
  expected: ReferenceManifest,
  checkDeadline: () => void,
) => {
  const current = await inspectReferenceReportManifest(root, checkDeadline);
  if (serializeCanonicalJson(current) !== serializeCanonicalJson(expected))
    throw new Error(
      "Immutable reference report/index/PNG evidence conflicts or drifted.",
    );
  // Empty unknown directories also violate the exact accepted tree.
  const rootEntries = (await readdir(root)).sort();
  const expectedEntries = [
    ...new Set(expected.map(({ path }) => path.split("/")[0])),
  ].sort();
  if (
    serializeCanonicalJson(rootEntries) !==
    serializeCanonicalJson(expectedEntries)
  )
    throw new Error("Reference analysis report contains unknown directories.");
  if (expectedEntries.includes("frames")) {
    const frameEntries = await readdir(join(root, "frames"), {
      withFileTypes: true,
    });
    if (frameEntries.some((entry) => !entry.isFile() || entry.isSymbolicLink()))
      throw new Error(
        "Reference analysis preview tree is unsafe or contains unknown directories.",
      );
  }
};

export const referencePathState = async (path: string) => {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

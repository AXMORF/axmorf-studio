import { lstat, readFile } from "node:fs/promises";
import { basename, join } from "node:path";

import { runMediaProcess } from "../../shared/media-process";
import { resolveRemotionCommand } from "../../shared/remotion-command";
import type { ProcessRunner } from "../../shared/process";

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;

export const inspectDeliveryCover = async ({
  absolutePath,
  expected,
  runProcess = runMediaProcess,
}: {
  readonly absolutePath: string;
  readonly expected: Readonly<{ width: number; height: number }>;
  readonly runProcess?: ProcessRunner;
}) => {
  const metadata = await lstat(absolutePath);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size < 24) {
    throw new Error("Delivery cover must be a non-empty regular PNG.");
  }
  const bytes = Uint8Array.from(await readFile(absolutePath));
  if (
    PNG_SIGNATURE.some((value, index) => bytes[index] !== value) ||
    String.fromCharCode(...bytes.subarray(12, 16)) !== "IHDR"
  ) {
    throw new Error("Delivery cover PNG header is malformed.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (width !== expected.width || height !== expected.height) {
    throw new Error("Delivery cover dimensions drifted.");
  }
  const decoded = await runProcess("ffmpeg", [
    "-v",
    "error",
    "-xerror",
    "-i",
    absolutePath,
    "-f",
    "null",
    "-",
  ]);
  if (decoded.status !== 0) {
    throw new Error("Delivery cover did not decode completely to EOF.");
  }
  return {
    imageFormat: "png" as const,
    width,
    height,
    decodedToEof: true as const,
  };
};

export const renderDeliveryCoverV2 = async ({
  rootDir,
  projectId,
  compositionId,
  outputPath,
  runProcess = runMediaProcess,
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly compositionId: string;
  readonly outputPath: string;
  readonly runProcess?: ProcessRunner;
}) => {
  const entry = join(
    rootDir,
    "src/projects",
    projectId,
    "delivery/cover/index.ts",
  );
  const result = await runProcess(resolveRemotionCommand(rootDir), [
    "still",
    entry,
    compositionId,
    outputPath,
    "--image-format=png",
    "--log=error",
  ]);
  if (result.status !== 0) {
    throw new Error(
      `Remotion could not render frozen Cover output: ${basename(outputPath)}.`,
    );
  }
};

export const inspectDeliveryCoverThumbnail = async ({
  absolutePath,
  expected,
  runProcess = runMediaProcess,
}: {
  readonly absolutePath: string;
  readonly expected: Readonly<{ width: number; height: number }>;
  readonly runProcess?: ProcessRunner;
}) => {
  const metadata = await lstat(absolutePath);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size < 24) {
    throw new Error("Cover thumbnail input must be a non-empty regular PNG.");
  }
  const result = await runProcess("ffmpeg", [
    "-v",
    "error",
    "-xerror",
    "-i",
    absolutePath,
    "-vf",
    `scale=${expected.width}:${expected.height}`,
    "-frames:v",
    "1",
    "-f",
    "null",
    "-",
  ]);
  if (result.status !== 0) {
    throw new Error("Cover thumbnail did not decode at the fixed review size.");
  }
  return {
    width: expected.width,
    height: expected.height,
    decodedToEof: true as const,
  };
};

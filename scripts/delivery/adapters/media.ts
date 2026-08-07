import { lstat, readFile } from "node:fs/promises";
import { basename, join } from "node:path";

import type { ProcessRunner } from "../../baseline/evidence";
import { runProductionMediaProcess } from "../../production/adapters/process-runner";
import { resolveProductionRemotionCommand } from "../../production/adapters/remotion-process";

type ProbeStream = Readonly<{
  codec_type?: unknown;
  codec_name?: unknown;
  width?: unknown;
  height?: unknown;
  avg_frame_rate?: unknown;
  nb_read_frames?: unknown;
  duration?: unknown;
  sample_rate?: unknown;
  channel_layout?: unknown;
}>;

const positiveInteger = (value: unknown, label: string) => {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (!Number.isSafeInteger(parsed) || (parsed as number) <= 0) {
    throw new Error(`Delivery media ${label} is invalid.`);
  }
  return parsed as number;
};

const positiveNumber = (value: unknown, label: string) => {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Delivery media ${label} is invalid.`);
  }
  return parsed;
};

const frameRate = (value: unknown) => {
  if (typeof value !== "string") {
    throw new Error("Delivery media frame rate is missing.");
  }
  const [numerator, denominator, ...extra] = value.split("/");
  if (
    extra.length > 0 ||
    numerator === undefined ||
    denominator === undefined
  ) {
    throw new Error("Delivery media frame rate is malformed.");
  }
  return {
    numerator: positiveInteger(numerator, "fps numerator"),
    denominator: positiveInteger(denominator, "fps denominator"),
  } as const;
};

export const inspectDeliveryVideo = async ({
  absolutePath,
  expected,
  runProcess = runProductionMediaProcess,
}: {
  readonly absolutePath: string;
  readonly expected: Readonly<{
    width: number;
    height: number;
    fps: number;
    frameCount: number;
  }>;
  readonly runProcess?: ProcessRunner;
}) => {
  const metadata = await lstat(absolutePath);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size <= 0) {
    throw new Error("Delivery video must be a non-empty regular file.");
  }
  const result = await runProcess("ffprobe", [
    "-v",
    "error",
    "-count_frames",
    "-show_entries",
    "stream=codec_type,codec_name,width,height,avg_frame_rate,nb_read_frames,duration,sample_rate,channel_layout:format=duration",
    "-of",
    "json",
    absolutePath,
  ]);
  if (result.status !== 0) {
    throw new Error("ffprobe could not inspect the delivery video.");
  }
  let probe: { streams?: unknown; format?: { duration?: unknown } };
  try {
    probe = JSON.parse(result.stdout) as typeof probe;
  } catch (error) {
    throw new Error("ffprobe returned malformed delivery video JSON.", {
      cause: error,
    });
  }
  if (!Array.isArray(probe.streams)) {
    throw new Error("Delivery video has no stream list.");
  }
  const streams = probe.streams as ProbeStream[];
  const videos = streams.filter(({ codec_type }) => codec_type === "video");
  const audios = streams.filter(({ codec_type }) => codec_type === "audio");
  if (
    videos.length !== 1 ||
    audios.length !== 1 ||
    videos[0].codec_name !== "h264" ||
    audios[0].codec_name !== "aac"
  ) {
    throw new Error(
      "Delivery video requires one H.264 stream and one AAC stream.",
    );
  }
  const rate = frameRate(videos[0].avg_frame_rate);
  const width = positiveInteger(videos[0].width, "width");
  const height = positiveInteger(videos[0].height, "height");
  const frameCount = positiveInteger(videos[0].nb_read_frames, "frame count");
  const videoDurationSeconds = positiveNumber(
    videos[0].duration,
    "video duration",
  );
  const actualDurationSeconds = positiveNumber(
    probe.format?.duration ?? audios[0].duration,
    "actual duration",
  );
  const sampleRate = positiveInteger(audios[0].sample_rate, "sample rate");
  if (
    typeof audios[0].channel_layout !== "string" ||
    !audios[0].channel_layout
  ) {
    throw new Error("Delivery audio channel layout is invalid.");
  }
  const expectedDurationSeconds = expected.frameCount / expected.fps;
  if (
    width !== expected.width ||
    height !== expected.height ||
    rate.numerator / rate.denominator !== expected.fps ||
    frameCount !== expected.frameCount ||
    Math.abs(videoDurationSeconds - expectedDurationSeconds) >
      1 / expected.fps ||
    Math.abs(actualDurationSeconds - expectedDurationSeconds) >
      1 / expected.fps
  ) {
    throw new Error(
      "Delivery video dimensions frame count or duration drifted.",
    );
  }
  const decoded = await runProcess("ffmpeg", [
    "-v",
    "error",
    "-xerror",
    "-i",
    absolutePath,
    "-map",
    "0",
    "-f",
    "null",
    "-",
  ]);
  if (decoded.status !== 0) {
    throw new Error("Delivery video did not decode completely to EOF.");
  }
  return {
    videoCodec: "h264" as const,
    audioCodec: "aac" as const,
    width,
    height,
    fpsNumerator: rate.numerator,
    fpsDenominator: rate.denominator,
    frameCount,
    videoDurationSeconds,
    actualDurationSeconds,
    sampleRate,
    channelLayout: audios[0].channel_layout,
    videoStreamCount: 1 as const,
    audioStreamCount: 1 as const,
    decodedToEof: true as const,
  };
};

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;

export const inspectDeliveryCover = async ({
  absolutePath,
  expected,
  runProcess = runProductionMediaProcess,
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

export const renderDeliveryCover = async ({
  rootDir,
  projectId,
  compositionId,
  outputPath,
  runProcess = runProductionMediaProcess,
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly compositionId: string;
  readonly outputPath: string;
  readonly runProcess?: ProcessRunner;
}) => {
  const entry = join(rootDir, "src/projects", projectId, "delivery/index.ts");
  const result = await runProcess(resolveProductionRemotionCommand(rootDir), [
    "still",
    entry,
    compositionId,
    outputPath,
    "--image-format=png",
    "--log=error",
  ]);
  if (result.status !== 0) {
    throw new Error(
      `Remotion could not render delivery cover: ${basename(outputPath)}.`,
    );
  }
};

export const renderDeliveryCoverV2 = async ({
  rootDir,
  projectId,
  compositionId,
  outputPath,
  runProcess = runProductionMediaProcess,
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
  const result = await runProcess(resolveProductionRemotionCommand(rootDir), [
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
  runProcess = runProductionMediaProcess,
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

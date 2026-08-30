import { lstat, readFile } from "node:fs/promises";
import { basename, join } from "node:path";

import type { RenderSpec } from "@axmorf/studio/contracts";
import { resolveMediaToolCommand } from "../../shared/media-tool-command";
import { runMediaProcess } from "../../shared/media-process";
import type { ProcessRunner } from "../../shared/process";
import { resolveRemotionCliInvocation } from "../../shared/remotion-command";

const parseProbe = (stdout: string, label: string) => {
  try {
    return JSON.parse(stdout) as unknown;
  } catch (error) {
    throw new Error(`${label} returned malformed JSON.`, { cause: error });
  }
};

const oneStream = (raw: unknown, label: string) => {
  if (
    raw === null ||
    typeof raw !== "object" ||
    !Array.isArray((raw as { streams?: unknown }).streams) ||
    (raw as { streams: unknown[] }).streams.length !== 1
  ) {
    throw new Error(`${label} must contain exactly one selected stream.`);
  }
  const stream = (raw as { streams: unknown[] }).streams[0];
  if (stream === null || typeof stream !== "object" || Array.isArray(stream)) {
    throw new Error(`${label} stream metadata is malformed.`);
  }
  return stream as Record<string, unknown>;
};

const parseFrameRate = (value: unknown) => {
  if (typeof value !== "string" || !/^\d+\/\d+$/u.test(value)) {
    throw new Error("Project video frame rate is malformed.");
  }
  const [numerator, denominator] = value.split("/").map(Number);
  if (
    denominator === undefined ||
    numerator === undefined ||
    denominator <= 0 ||
    numerator <= 0 ||
    numerator % denominator !== 0
  ) {
    throw new Error("Project video frame rate must be an integer fps.");
  }
  return numerator / denominator;
};

export const renderProjectVideo = async ({
  rootDir,
  compositionId,
  outputPath,
  entryPoint = join(rootDir, "src/index.ts"),
  publicDir = join(rootDir, "public"),
  runProcess = runMediaProcess,
}: {
  readonly rootDir: string;
  readonly compositionId: string;
  readonly outputPath: string;
  readonly entryPoint?: string;
  readonly publicDir?: string;
  readonly runProcess?: ProcessRunner;
}) => {
  const invocation = await resolveRemotionCliInvocation(rootDir);
  const result = await runProcess(invocation.command, [
    ...invocation.argsPrefix,
    "render",
    entryPoint,
    compositionId,
    outputPath,
    "--codec=h264",
    "--audio-codec=aac",
    "--pixel-format=yuv420p",
    "--log=error",
    `--public-dir=${publicDir}`,
  ], { cwd: rootDir });
  if (result.status !== 0) {
    throw new Error(
      `Remotion could not render Project video: ${basename(outputPath)}.`,
    );
  }
};

export const renderProjectCover = async ({
  rootDir,
  projectId,
  compositionId,
  outputPath,
  entryPoint = join(
    rootDir,
    "src/projects",
    projectId,
    "delivery/cover/index.ts",
  ),
  publicDir = join(rootDir, "public"),
  runProcess = runMediaProcess,
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly compositionId: string;
  readonly outputPath: string;
  readonly entryPoint?: string;
  readonly publicDir?: string;
  readonly runProcess?: ProcessRunner;
}) => {
  const invocation = await resolveRemotionCliInvocation(rootDir);
  const result = await runProcess(invocation.command, [
    ...invocation.argsPrefix,
    "still",
    entryPoint,
    compositionId,
    outputPath,
    "--image-format=png",
    "--log=error",
    `--public-dir=${publicDir}`,
  ], { cwd: rootDir });
  if (result.status !== 0) {
    throw new Error(
      `Remotion could not render Project Cover: ${basename(outputPath)}.`,
    );
  }
};

export const inspectProjectVideo = async ({
  absolutePath,
  render,
  frameCount,
  runProcess = runMediaProcess,
}: {
  readonly absolutePath: string;
  readonly render: RenderSpec;
  readonly frameCount: number;
  readonly runProcess?: ProcessRunner;
}) => {
  const metadata = await lstat(absolutePath);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size <= 0) {
    throw new Error("Project video must be a non-empty regular MP4.");
  }
  const videoProbeCommand = await resolveMediaToolCommand({
    rootDir: process.cwd(),
    tool: "ffprobe",
    args: [
      "-v",
      "error",
      "-count_frames",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=codec_name,width,height,r_frame_rate,nb_read_frames",
      "-of",
      "json",
      absolutePath,
    ],
  });
  const videoProbe = await runProcess(
    videoProbeCommand.command,
    videoProbeCommand.args,
  );
  if (videoProbe.status !== 0) {
    throw new Error("Project video metadata could not be inspected.");
  }
  const video = oneStream(
    parseProbe(videoProbe.stdout, "Video probe"),
    "Video probe",
  );
  const fps = parseFrameRate(video.r_frame_rate);
  const readFrames =
    typeof video.nb_read_frames === "string"
      ? Number.parseInt(video.nb_read_frames, 10)
      : Number.NaN;
  if (
    video.codec_name !== "h264" ||
    video.width !== render.width ||
    video.height !== render.height ||
    fps !== render.fps ||
    readFrames !== frameCount
  ) {
    throw new Error("Project video stream metadata drifted from RenderSpec.");
  }
  const audioProbeCommand = await resolveMediaToolCommand({
    rootDir: process.cwd(),
    tool: "ffprobe",
    args: [
      "-v",
      "error",
      "-select_streams",
      "a:0",
      "-show_entries",
      "stream=codec_name,channels",
      "-of",
      "json",
      absolutePath,
    ],
  });
  const audioProbe = await runProcess(
    audioProbeCommand.command,
    audioProbeCommand.args,
  );
  if (audioProbe.status !== 0) {
    throw new Error("Project video audio metadata could not be inspected.");
  }
  const audio = oneStream(
    parseProbe(audioProbe.stdout, "Audio probe"),
    "Audio probe",
  );
  if (
    audio.codec_name !== "aac" ||
    audio.channels !== render.output.audioChannels
  ) {
    throw new Error("Project video audio stream drifted from RenderSpec.");
  }
  const decodeCommand = await resolveMediaToolCommand({
    rootDir: process.cwd(),
    tool: "ffmpeg",
    args: [
      "-v",
      "error",
      "-xerror",
      "-i",
      absolutePath,
      "-c:v",
      "rawvideo",
      "-c:a",
      "pcm_s16le",
      "-f",
      "null",
      "-",
    ],
  });
  const decoded = await runProcess(decodeCommand.command, decodeCommand.args);
  if (decoded.status !== 0) {
    throw new Error("Project video did not decode completely to EOF.");
  }
  return {
    codec: "h264" as const,
    audioCodec: "aac" as const,
    audioChannels: render.output.audioChannels,
    width: render.width,
    height: render.height,
    fps: render.fps,
    frameCount,
    decodedToEof: true as const,
  };
};

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;

export const inspectProjectCover = async ({
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
  const decodeCommand = await resolveMediaToolCommand({
    rootDir: process.cwd(),
    tool: "ffmpeg",
    args: [
      "-v",
      "error",
      "-xerror",
      "-i",
      absolutePath,
      "-c:v",
      "rawvideo",
      "-f",
      "null",
      "-",
    ],
  });
  const decoded = await runProcess(decodeCommand.command, decodeCommand.args);
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

import { lstat, readFile } from "node:fs/promises";
import { basename, join } from "node:path";

import type { RenderSpec } from "../../../src/contracts";
import { runMediaProcess } from "../../shared/media-process";
import type { ProcessRunner } from "../../shared/process";
import { resolveRemotionCommand } from "../../shared/remotion-command";

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

const parseReadFrames = (value: unknown, label: string) => {
  if (typeof value !== "string" || !/^\d+$/u.test(value)) {
    throw new Error(`${label} frame count is malformed.`);
  }
  const readFrames = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(readFrames) || readFrames <= 0) {
    throw new Error(`${label} frame count must be positive.`);
  }
  return readFrames;
};

const boundedProcessFailure = ({
  absolutePath,
  status,
  stderr,
}: {
  readonly absolutePath: string;
  readonly status: number;
  readonly stderr: string;
}) => {
  const detail = stderr
    .replaceAll(absolutePath, "<media>")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 512);
  return detail === "" ? `exit ${status}` : `exit ${status}; ${detail}`;
};

export const renderProjectVideo = async ({
  rootDir,
  compositionId,
  outputPath,
  remotionCommand = resolveRemotionCommand(rootDir),
  browserExecutable,
  binariesDirectory,
  runProcess = runMediaProcess,
}: {
  readonly rootDir: string;
  readonly compositionId: string;
  readonly outputPath: string;
  readonly remotionCommand?: string;
  readonly browserExecutable?: string;
  readonly binariesDirectory?: string;
  readonly runProcess?: ProcessRunner;
}) => {
  const result = await runProcess(remotionCommand, [
    "render",
    "src/index.ts",
    compositionId,
    outputPath,
    "--codec=h264",
    "--audio-codec=aac",
    "--pixel-format=yuv420p",
    "--log=error",
    ...(browserExecutable === undefined
      ? []
      : [`--browser-executable=${browserExecutable}`]),
    ...(binariesDirectory === undefined
      ? []
      : [`--binaries-directory=${binariesDirectory}`]),
  ]);
  if (result.status !== 0) {
    throw new Error(`Remotion could not render Project video: ${basename(outputPath)}.`);
  }
};

export const renderProjectCover = async ({
  rootDir,
  projectId,
  compositionId,
  outputPath,
  remotionCommand = resolveRemotionCommand(rootDir),
  browserExecutable,
  binariesDirectory,
  runProcess = runMediaProcess,
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly compositionId: string;
  readonly outputPath: string;
  readonly remotionCommand?: string;
  readonly browserExecutable?: string;
  readonly binariesDirectory?: string;
  readonly runProcess?: ProcessRunner;
}) => {
  const result = await runProcess(remotionCommand, [
    "still",
    join("src/projects", projectId, "delivery/cover/index.ts"),
    compositionId,
    outputPath,
    "--image-format=png",
    "--log=error",
    ...(browserExecutable === undefined
      ? []
      : [`--browser-executable=${browserExecutable}`]),
    ...(binariesDirectory === undefined
      ? []
      : [`--binaries-directory=${binariesDirectory}`]),
  ]);
  if (result.status !== 0) {
    throw new Error(`Remotion could not render Project Cover: ${basename(outputPath)}.`);
  }
};

export const inspectProjectVideo = async ({
  absolutePath,
  render,
  frameCount,
  ffprobeExecutable = "ffprobe",
  runProcess = runMediaProcess,
}: {
  readonly absolutePath: string;
  readonly render: RenderSpec;
  readonly frameCount: number;
  readonly ffprobeExecutable?: string;
  readonly runProcess?: ProcessRunner;
}) => {
  const metadata = await lstat(absolutePath);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size <= 0) {
    throw new Error("Project video must be a non-empty regular MP4.");
  }
  const videoProbe = await runProcess(ffprobeExecutable, [
    "-v",
    "error",
    "-err_detect",
    "explode",
    "-count_frames",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=codec_name,width,height,r_frame_rate,nb_read_frames",
    "-of",
    "json",
    absolutePath,
  ]);
  if (videoProbe.status !== 0) {
    throw new Error(
      `Project video could not be decoded to EOF (${boundedProcessFailure({ absolutePath, ...videoProbe })}).`,
    );
  }
  const video = oneStream(parseProbe(videoProbe.stdout, "Video probe"), "Video probe");
  const fps = parseFrameRate(video.r_frame_rate);
  const readFrames = parseReadFrames(video.nb_read_frames, "Project video");
  if (
    video.codec_name !== "h264" ||
    video.width !== render.width ||
    video.height !== render.height ||
    fps !== render.fps ||
    readFrames !== frameCount
  ) {
    throw new Error("Project video stream metadata drifted from RenderSpec.");
  }
  const audioProbe = await runProcess(ffprobeExecutable, [
    "-v",
    "error",
    "-err_detect",
    "explode",
    "-count_frames",
    "-select_streams",
    "a:0",
    "-show_entries",
    "stream=codec_name,channels,nb_read_frames",
    "-of",
    "json",
    absolutePath,
  ]);
  if (audioProbe.status !== 0) {
    throw new Error(
      `Project video audio could not be decoded to EOF (${boundedProcessFailure({ absolutePath, ...audioProbe })}).`,
    );
  }
  const audio = oneStream(parseProbe(audioProbe.stdout, "Audio probe"), "Audio probe");
  parseReadFrames(audio.nb_read_frames, "Project video audio");
  if (
    audio.codec_name !== "aac" ||
    audio.channels !== render.output.audioChannels
  ) {
    throw new Error("Project video audio stream drifted from RenderSpec.");
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
  ffprobeExecutable = "ffprobe",
  runProcess = runMediaProcess,
}: {
  readonly absolutePath: string;
  readonly expected: Readonly<{ width: number; height: number }>;
  readonly ffprobeExecutable?: string;
  readonly runProcess?: ProcessRunner;
}) => {
  const metadata = await lstat(absolutePath);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size < 24) throw new Error("Delivery cover must be a non-empty regular PNG.");
  const bytes = Uint8Array.from(await readFile(absolutePath));
  if (PNG_SIGNATURE.some((value, index) => bytes[index] !== value) || String.fromCharCode(...bytes.subarray(12, 16)) !== "IHDR") throw new Error("Delivery cover PNG header is malformed.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16); const height = view.getUint32(20);
  if (width !== expected.width || height !== expected.height) throw new Error("Delivery cover dimensions drifted.");
  const decoded = await runProcess(ffprobeExecutable, [
    "-v",
    "error",
    "-err_detect",
    "explode",
    "-count_frames",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=codec_name,width,height,nb_read_frames",
    "-of",
    "json",
    absolutePath,
  ]);
  if (decoded.status !== 0) {
    throw new Error(
      `Delivery cover did not decode completely to EOF (${boundedProcessFailure({ absolutePath, ...decoded })}).`,
    );
  }
  const stream = oneStream(parseProbe(decoded.stdout, "Cover probe"), "Cover probe");
  if (
    stream.codec_name !== "png" ||
    stream.width !== expected.width ||
    stream.height !== expected.height ||
    parseReadFrames(stream.nb_read_frames, "Delivery cover") !== 1
  ) {
    throw new Error("Delivery cover decoded stream metadata drifted.");
  }
  return { imageFormat: "png" as const, width, height, decodedToEof: true as const };
};

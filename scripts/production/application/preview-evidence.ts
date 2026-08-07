import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  ProductionPreviewEvidenceSchema,
  ProductionPreviewMechanicalCheckSchema,
  Sha256DigestSchema,
  StoryIdSchema,
  type ProductionPreviewEvidence,
  type ProductionPreviewMechanicalCheck,
} from "../../../src/contracts";
import type { ProcessRunner } from "../../baseline/evidence";
import { writeOrCheckSceneArtifact } from "../../scene-package/project-files";
import { runProductionMediaProcess } from "../adapters/process-runner";
import { getProductionRunPaths } from "../adapters/run-store";

type ProbeStream = Readonly<{
  codec_type?: unknown;
  codec_name?: unknown;
  width?: unknown;
  height?: unknown;
  avg_frame_rate?: unknown;
  nb_read_frames?: unknown;
  duration?: unknown;
}>;

const checksumFile = async (path: string) =>
  Sha256DigestSchema.parse(
    `sha256:${createHash("sha256")
      .update(Uint8Array.from(await readFile(path)))
      .digest("hex")}`,
  );

const parsePositiveInteger = (value: unknown, label: string) => {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (!Number.isInteger(parsed) || (parsed as number) <= 0) {
    throw new Error(`Production preview ${label} is invalid.`);
  }
  return parsed as number;
};

const parseFrameRate = (value: unknown) => {
  if (typeof value !== "string") {
    throw new Error("Production preview frame rate is missing.");
  }
  const parts = value.split("/");
  if (parts.length !== 2) {
    throw new Error("Production preview frame rate is malformed.");
  }
  return {
    numerator: parsePositiveInteger(parts[0], "fps numerator"),
    denominator: parsePositiveInteger(parts[1], "fps denominator"),
  } as const;
};

export const inspectProductionPreviewMedia = async ({
  rootDir,
  relativePath,
  expected,
  runProcess = runProductionMediaProcess,
}: {
  readonly rootDir: string;
  readonly relativePath: string;
  readonly expected: Readonly<{
    width: number;
    height: number;
    fps: number;
    frameCount: number;
  }>;
  readonly runProcess?: ProcessRunner;
}) => {
  if (
    !relativePath.startsWith("out/") ||
    relativePath.startsWith("/") ||
    relativePath.includes("..") ||
    relativePath.includes("\\") ||
    relativePath.includes("://")
  ) {
    throw new Error("Production preview media path is unsafe.");
  }
  const absolutePath = join(rootDir, relativePath);
  const metadata = await lstat(absolutePath);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error("Production preview media must be a regular file.");
  }
  const probe = await runProcess("ffprobe", [
    "-v",
    "error",
    "-count_frames",
    "-show_entries",
    "stream=codec_type,codec_name,width,height,avg_frame_rate,nb_read_frames,duration",
    "-of",
    "json",
    absolutePath,
  ]);
  if (probe.status !== 0) {
    throw new Error("ffprobe could not inspect the production preview.");
  }
  let parsed: { streams?: unknown };
  try {
    parsed = JSON.parse(probe.stdout) as typeof parsed;
  } catch (error) {
    throw new Error("ffprobe returned malformed production preview JSON.", {
      cause: error,
    });
  }
  if (!Array.isArray(parsed.streams)) {
    throw new Error("Production preview has no stream list.");
  }
  const streams = parsed.streams as ProbeStream[];
  const video = streams.filter(({ codec_type }) => codec_type === "video");
  const audio = streams.filter(({ codec_type }) => codec_type === "audio");
  if (
    video.length !== 1 ||
    audio.length !== 1 ||
    video[0]?.codec_name !== "h264" ||
    audio[0]?.codec_name !== "aac"
  ) {
    throw new Error(
      "Production preview requires one H.264 video stream and one AAC audio stream.",
    );
  }
  const rate = parseFrameRate(video[0].avg_frame_rate);
  const width = parsePositiveInteger(video[0].width, "width");
  const height = parsePositiveInteger(video[0].height, "height");
  const frameCount = parsePositiveInteger(
    video[0].nb_read_frames,
    "frame count",
  );
  const durationSeconds = Number(video[0].duration);
  if (
    width !== expected.width ||
    height !== expected.height ||
    rate.numerator / rate.denominator !== expected.fps ||
    frameCount !== expected.frameCount ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0 ||
    Math.abs(durationSeconds - expected.frameCount / expected.fps) >
      1 / expected.fps
  ) {
    throw new Error(
      "Production preview dimensions timing or frame count drifted.",
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
    throw new Error("Production preview did not decode completely to EOF.");
  }
  return {
    checksum: await checksumFile(absolutePath),
    actual: {
      width,
      height,
      fpsNumerator: rate.numerator,
      fpsDenominator: rate.denominator,
      frameCount,
      durationSeconds,
      videoStreamCount: 1 as const,
      videoCodec: "h264" as const,
      audioStreamCount: 1 as const,
      audioCodec: "aac" as const,
      decodedToEof: true as const,
    },
  } as const;
};

const resolveArtifactDestination = ({
  rootDir,
  runId,
  fileName,
  mode,
  artifactRepositoryPath,
}: {
  readonly rootDir: string;
  readonly runId: string;
  readonly fileName: string;
  readonly mode: "write" | "check";
  readonly artifactRepositoryPath?: string;
}) => {
  const runPaths = getProductionRunPaths({ rootDir, runId });
  if (artifactRepositoryPath !== undefined) {
    if (
      mode !== "check" ||
      artifactRepositoryPath.startsWith("/") ||
      artifactRepositoryPath.includes("\\") ||
      artifactRepositoryPath.split("/").includes("..") ||
      artifactRepositoryPath.includes("://")
    ) {
      throw new Error("Production preview artifact path is unsafe.");
    }
    return join(rootDir, artifactRepositoryPath);
  }
  return join(runPaths.artifacts, fileName);
};

export const writeOrCheckProductionPreviewEvidence = async ({
  rootDir,
  runId,
  evidence: rawEvidence,
  mode,
  artifactRepositoryPath,
}: {
  readonly rootDir: string;
  readonly runId: string;
  readonly evidence: ProductionPreviewEvidence;
  readonly mode: "write" | "check";
  readonly artifactRepositoryPath?: string;
}) => {
  const evidence = ProductionPreviewEvidenceSchema.parse(rawEvidence);
  StoryIdSchema.parse(evidence.storyId);
  const destination = resolveArtifactDestination({
    rootDir,
    runId,
    fileName: "production-preview-evidence.generated.json",
    mode,
    artifactRepositoryPath,
  });
  await writeOrCheckSceneArtifact({ destination, value: evidence, mode });
  return evidence;
};

export const writeOrCheckProductionPreviewMechanicalCheck = async ({
  rootDir,
  runId,
  check: rawCheck,
  mode,
  artifactRepositoryPath,
}: {
  readonly rootDir: string;
  readonly runId: string;
  readonly check: ProductionPreviewMechanicalCheck;
  readonly mode: "write" | "check";
  readonly artifactRepositoryPath?: string;
}) => {
  const check = ProductionPreviewMechanicalCheckSchema.parse(rawCheck);
  StoryIdSchema.parse(check.storyId);
  const destination = resolveArtifactDestination({
    rootDir,
    runId,
    fileName: "production-preview-mechanical-check.generated.json",
    mode,
    artifactRepositoryPath,
  });
  await writeOrCheckSceneArtifact({ destination, value: check, mode });
  return check;
};

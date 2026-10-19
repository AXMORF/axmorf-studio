import { mkdtemp, open, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  NARRATION_MASTERING_POLICY,
  buildNarrationMasteringPolicy,
  NarrationLoudnessMeasurementSchema,
  type NarrationLoudnessMeasurement,
} from "@axmorf/studio/contracts";
import { resolveMediaToolCommand } from "../shared/media-tool-command";
import {
  runHostProcess,
  type ProcessRunner,
} from "./adapters/ffmpeg-normalizer";
import {
  decodeCanonicalPcmWav,
  encodeCanonicalPcmWav,
  measureCanonicalPcmWav,
} from "./domain/pcm-wav";

type LoudnormPass = Readonly<{
  inputI: number;
  inputTp: number;
  inputLra: number;
  inputThreshold: number;
  targetOffset: number;
}>;

const LOUDNORM_PROCESSING_MARGIN_LU = 0.25;

const parseFinite = (value: unknown, label: string) => {
  const parsed = typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed)) {
    throw new Error(`FFmpeg loudness analysis returned invalid ${label}.`);
  }
  return parsed;
};

export const parseLoudnormAnalysis = (rawOutput: string): LoudnormPass => {
  const start = rawOutput.lastIndexOf("{");
  const end = rawOutput.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("FFmpeg loudness analysis JSON is missing.");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(rawOutput.slice(start, end + 1));
  } catch (error) {
    throw new Error("FFmpeg loudness analysis JSON is malformed.", {
      cause: error,
    });
  }
  const record = raw as Record<string, unknown>;
  return {
    inputI: parseFinite(record.input_i, "integrated loudness"),
    inputTp: parseFinite(record.input_tp, "true peak"),
    inputLra: parseFinite(record.input_lra, "loudness range"),
    inputThreshold: parseFinite(record.input_thresh, "threshold"),
    targetOffset: parseFinite(record.target_offset, "target offset"),
  };
};

type NarrationMasteringPolicy = ReturnType<
  typeof buildNarrationMasteringPolicy
>;

const analysisFilter = (policy: NarrationMasteringPolicy) =>
  `loudnorm=I=${policy.targetIntegratedLoudnessLufs}` +
  `:TP=${policy.targetTruePeakDbtp}` +
  `:LRA=${policy.targetLoudnessRangeLu}` +
  ":print_format=json";

export const analyzeNarrationLoudness = async ({
  path,
  masteringPolicy = NARRATION_MASTERING_POLICY,
  runProcess = runHostProcess,
}: {
  readonly path: string;
  readonly masteringPolicy?: NarrationMasteringPolicy;
  readonly runProcess?: ProcessRunner;
}): Promise<LoudnormPass> => {
  const invocation = await resolveMediaToolCommand({
    rootDir: process.cwd(),
    tool: "ffmpeg",
    args: [
      "-nostdin",
      "-hide_banner",
      "-nostats",
      "-i",
      path,
      "-af",
      analysisFilter(masteringPolicy),
      "-f",
      "null",
      "-",
    ],
  });
  const result = await runProcess(invocation.command, invocation.args);
  if (result.exitCode !== 0) {
    throw new Error("FFmpeg loudness analysis failed.");
  }
  return parseLoudnormAnalysis(
    `${result.stdout.toString("utf8")}\n${result.stderr.toString("utf8")}`,
  );
};

const asMeasurement = (analysis: LoudnormPass): NarrationLoudnessMeasurement =>
  NarrationLoudnessMeasurementSchema.parse({
    integratedLoudnessLufs: analysis.inputI,
    truePeakDbtp: analysis.inputTp,
    loudnessRangeLu: analysis.inputLra,
    thresholdLufs: analysis.inputThreshold,
  });

const masterFilter = (
  analysis: LoudnormPass,
  policy: NarrationMasteringPolicy,
) =>
  `loudnorm=I=${policy.targetIntegratedLoudnessLufs}` +
  `:TP=${policy.targetTruePeakDbtp}` +
  `:LRA=${policy.targetLoudnessRangeLu}` +
  `:measured_I=${analysis.inputI}` +
  `:measured_TP=${analysis.inputTp}` +
  `:measured_LRA=${analysis.inputLra}` +
  `:measured_thresh=${analysis.inputThreshold}` +
  `:offset=${analysis.targetOffset}` +
  ":linear=true:print_format=summary";

const writeBytesSynced = async (path: string, bytes: Buffer) => {
  const handle = await open(path, "wx");
  try {
    await handle.writeFile(Uint8Array.from(bytes));
    await handle.sync();
  } finally {
    await handle.close();
  }
};

const analyzeWavBytes = async ({
  wav,
  runProcess,
  masteringPolicy,
}: {
  readonly wav: Buffer;
  readonly runProcess: ProcessRunner;
  readonly masteringPolicy: NarrationMasteringPolicy;
}) => {
  const directory = await mkdtemp(join(tmpdir(), "rsp-narration-master-"));
  const path = join(directory, "complete.wav");
  try {
    await writeBytesSynced(path, wav);
    return asMeasurement(
      await analyzeNarrationLoudness({ path, runProcess, masteringPolicy }),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

export const masterNarrationBytes = async ({
  sourcePath,
  sourceWav,
  targetLoudnessLufs = -16,
  runProcess = runHostProcess,
}: {
  readonly sourcePath: string;
  readonly sourceWav: Buffer;
  readonly targetLoudnessLufs?: number;
  readonly runProcess?: ProcessRunner;
}) => {
  const masteringPolicy = buildNarrationMasteringPolicy(targetLoudnessLufs);
  // Peak-limited speech can finish slightly below loudnorm's requested target.
  // Bias processing toward that target without changing the recorded policy target.
  const processingPolicy = {
    ...masteringPolicy,
    targetIntegratedLoudnessLufs:
      masteringPolicy.targetIntegratedLoudnessLufs +
      LOUDNORM_PROCESSING_MARGIN_LU,
  };
  const sourceMeasurement = measureCanonicalPcmWav(sourceWav);
  const sourceAnalysis = await analyzeNarrationLoudness({
    path: sourcePath,
    runProcess,
    masteringPolicy: processingPolicy,
  });
  const directory = await mkdtemp(join(tmpdir(), "rsp-narration-master-"));
  const outputPath = join(directory, "mastered.wav");
  let outputWav: Buffer;
  try {
    const invocation = await resolveMediaToolCommand({
      rootDir: process.cwd(),
      tool: "ffmpeg",
      args: [
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        sourcePath,
        "-af",
        masterFilter(sourceAnalysis, processingPolicy),
        "-map_metadata",
        "-1",
        "-vn",
        "-ac",
        "1",
        "-ar",
        String(sourceMeasurement.pcm.sampleRate),
        "-acodec",
        "pcm_s16le",
        "-f",
        "wav",
        outputPath,
      ],
    });
    const result = await runProcess(invocation.command, invocation.args);
    if (result.exitCode !== 0) {
      throw new Error("FFmpeg narration mastering failed.");
    }
    const normalizedWav = await readFile(outputPath);
    if (normalizedWav.length === 0) {
      throw new Error("FFmpeg narration mastering returned empty PCM.");
    }
    const { rawPcm } = decodeCanonicalPcmWav(normalizedWav);
    outputWav = encodeCanonicalPcmWav(rawPcm);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  const outputMeasurement = measureCanonicalPcmWav(outputWav);
  if (
    outputMeasurement.sampleFrameCount !== sourceMeasurement.sampleFrameCount
  ) {
    throw new Error("Narration mastering changed the sealed sample count.");
  }
  const measurements = await analyzeWavBytes({
    wav: outputWav,
    runProcess,
    masteringPolicy,
  });
  return { outputWav, measurements, masteringPolicy } as const;
};

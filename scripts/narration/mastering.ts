import { mkdir, mkdtemp, open, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

import {
  MasteredNarrationManifestSchema,
  NARRATION_MASTERING_POLICY,
  NarrationLoudnessMeasurementSchema,
  SealedNarrationManifestSchema,
  buildMasteredNarrationManifest,
  serializeCanonicalJson,
  type MasteredNarrationManifest,
  type NarrationLoudnessMeasurement,
} from "../../src/contracts";
import {
  commitImmutableDirectory,
  withProjectSealLock,
  writeJsonAtomic,
} from "./adapters/atomic-files";
import {
  runHostProcess,
  type ProcessRunner,
} from "./adapters/ffmpeg-normalizer";
import {
  encodeCanonicalPcmWav,
  measureCanonicalPcmWav,
  sha256Bytes,
} from "./domain/pcm-wav";

type LoudnormPass = Readonly<{
  inputI: number;
  inputTp: number;
  inputLra: number;
  inputThreshold: number;
  targetOffset: number;
}>;

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

const analysisFilter =
  `loudnorm=I=${NARRATION_MASTERING_POLICY.targetIntegratedLoudnessLufs}` +
  `:TP=${NARRATION_MASTERING_POLICY.targetTruePeakDbtp}` +
  `:LRA=${NARRATION_MASTERING_POLICY.targetLoudnessRangeLu}` +
  ":print_format=json";

export const analyzeNarrationLoudness = async ({
  path,
  runProcess = runHostProcess,
}: {
  readonly path: string;
  readonly runProcess?: ProcessRunner;
}): Promise<LoudnormPass> => {
  const result = await runProcess("ffmpeg", [
    "-nostdin",
    "-hide_banner",
    "-nostats",
    "-i",
    path,
    "-af",
    analysisFilter,
    "-f",
    "null",
    "-",
  ]);
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

const masterFilter = (analysis: LoudnormPass) =>
  `loudnorm=I=${NARRATION_MASTERING_POLICY.targetIntegratedLoudnessLufs}` +
  `:TP=${NARRATION_MASTERING_POLICY.targetTruePeakDbtp}` +
  `:LRA=${NARRATION_MASTERING_POLICY.targetLoudnessRangeLu}` +
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
}: {
  readonly wav: Buffer;
  readonly runProcess: ProcessRunner;
}) => {
  const directory = await mkdtemp(join(tmpdir(), "rsp-narration-master-"));
  const path = join(directory, "complete.wav");
  try {
    await writeBytesSynced(path, wav);
    return asMeasurement(await analyzeNarrationLoudness({ path, runProcess }));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

export const masterNarrationBytes = async ({
  sourcePath,
  sourceWav,
  runProcess = runHostProcess,
}: {
  readonly sourcePath: string;
  readonly sourceWav: Buffer;
  readonly runProcess?: ProcessRunner;
}) => {
  const sourceMeasurement = measureCanonicalPcmWav(sourceWav);
  const sourceAnalysis = await analyzeNarrationLoudness({
    path: sourcePath,
    runProcess,
  });
  const result = await runProcess("ffmpeg", [
    "-nostdin",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    sourcePath,
    "-af",
    masterFilter(sourceAnalysis),
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
    "s16le",
    "pipe:1",
  ]);
  if (result.exitCode !== 0 || result.stdout.length === 0) {
    throw new Error("FFmpeg narration mastering failed.");
  }
  const outputWav = encodeCanonicalPcmWav(result.stdout);
  const outputMeasurement = measureCanonicalPcmWav(outputWav);
  if (
    outputMeasurement.sampleFrameCount !== sourceMeasurement.sampleFrameCount
  ) {
    throw new Error("Narration mastering changed the sealed sample count.");
  }
  const measurements = await analyzeWavBytes({ wav: outputWav, runProcess });
  return { outputWav, measurements } as const;
};

const readJson = async (path: string, label: string) => {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`${label} is missing, malformed, or unreadable.`, {
      cause: error,
    });
  }
};

const projectPaths = (rootDir: string, storyId: string) => ({
  seal: join(
    rootDir,
    "src/projects",
    storyId,
    "generated/sealed-narration.generated.json",
  ),
  master: join(
    rootDir,
    "src/projects",
    storyId,
    "generated/mastered-narration.generated.json",
  ),
  lock: join(
    rootDir,
    "src/projects",
    storyId,
    "generated/.narration-seal.lock",
  ),
});

const readActiveMaster = async (
  path: string,
): Promise<MasteredNarrationManifest | undefined> => {
  try {
    return MasteredNarrationManifestSchema.parse(
      JSON.parse(await readFile(path, "utf8")),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new Error("Existing mastered narration receipt is invalid.", {
      cause: error,
    });
  }
};

export type MasteredNarrationCheckResult = Readonly<{
  storyId: string;
  sealedNarrationFingerprint: string;
  masteredNarrationFingerprint: string;
  outputAudioPath: string;
  outputAudioChecksum: string;
  outputAudioSampleFrameCount: number;
  measurements: NarrationLoudnessMeasurement;
}>;

export const checkMasteredNarrationArtifacts = async ({
  rootDir,
  storyId,
  runProcess = runHostProcess,
}: {
  readonly rootDir: string;
  readonly storyId: string;
  readonly runProcess?: ProcessRunner;
}): Promise<MasteredNarrationCheckResult> => {
  const paths = projectPaths(rootDir, storyId);
  const [seal, master] = await Promise.all([
    readJson(paths.seal, "sealed narration").then(
      SealedNarrationManifestSchema.parse,
    ),
    readJson(paths.master, "mastered narration").then(
      MasteredNarrationManifestSchema.parse,
    ),
  ]);
  if (
    seal.storyId !== storyId ||
    master.storyId !== storyId ||
    master.sealedNarrationFingerprint !== seal.sealedNarrationFingerprint ||
    master.sourceAudio.localPath !== seal.completeAudio.localPath ||
    master.sourceAudio.checksum !== seal.completeAudio.checksum ||
    master.sourceAudio.sampleFrameCount !==
      seal.completeAudio.sampleFrameCount ||
    serializeCanonicalJson(master.sourceAudio.pcm) !==
      serializeCanonicalJson(seal.completeAudio.pcm)
  ) {
    throw new Error("Mastered narration source binding is stale.");
  }
  const outputPath = join(rootDir, master.outputAudio.localPath);
  let outputWav: Buffer;
  try {
    outputWav = await readFile(outputPath);
  } catch (error) {
    throw new Error("Mastered narration audio is missing or unreadable.", {
      cause: error,
    });
  }
  if (sha256Bytes(outputWav) !== master.outputAudio.checksum) {
    throw new Error("Mastered narration audio checksum is stale.");
  }
  const outputMeasurement = measureCanonicalPcmWav(outputWav);
  if (
    outputMeasurement.sampleFrameCount !== master.outputAudio.sampleFrameCount
  ) {
    throw new Error("Mastered narration sample count is stale.");
  }
  const measurements = await analyzeWavBytes({
    wav: outputWav,
    runProcess,
  });
  if (
    serializeCanonicalJson(measurements) !==
    serializeCanonicalJson(master.measurements)
  ) {
    throw new Error("Mastered narration loudness measurement is stale.");
  }
  MasteredNarrationManifestSchema.parse(master);
  return {
    storyId,
    sealedNarrationFingerprint: seal.sealedNarrationFingerprint,
    masteredNarrationFingerprint: master.masteredNarrationFingerprint,
    outputAudioPath: master.outputAudio.localPath,
    outputAudioChecksum: master.outputAudio.checksum,
    outputAudioSampleFrameCount: master.outputAudio.sampleFrameCount,
    measurements,
  };
};

export const writeMasteredNarrationArtifacts = async ({
  rootDir,
  storyId,
  runProcess = runHostProcess,
}: {
  readonly rootDir: string;
  readonly storyId: string;
  readonly runProcess?: ProcessRunner;
}): Promise<MasteredNarrationCheckResult> => {
  const paths = projectPaths(rootDir, storyId);
  return withProjectSealLock(
    { lockPath: paths.lock, operation: "master-narration" },
    async () => {
      const seal = SealedNarrationManifestSchema.parse(
        await readJson(paths.seal, "sealed narration"),
      );
      if (seal.storyId !== storyId) {
        throw new Error("Sealed narration Story identity is stale.");
      }
      const existing = await readActiveMaster(paths.master);
      if (
        existing?.sealedNarrationFingerprint === seal.sealedNarrationFingerprint
      ) {
        return checkMasteredNarrationArtifacts({
          rootDir,
          storyId,
          runProcess,
        });
      }
      const sourcePath = join(rootDir, seal.completeAudio.localPath);
      const sourceWav = await readFile(sourcePath);
      if (sha256Bytes(sourceWav) !== seal.completeAudio.checksum) {
        throw new Error("Sealed complete narration checksum is stale.");
      }
      const sourceMeasurement = measureCanonicalPcmWav(sourceWav);
      if (
        sourceMeasurement.sampleFrameCount !==
        seal.completeAudio.sampleFrameCount
      ) {
        throw new Error("Sealed complete narration sample count is stale.");
      }
      const mastered = await masterNarrationBytes({
        sourcePath,
        sourceWav,
        runProcess,
      });
      const manifest = buildMasteredNarrationManifest({
        storyId,
        sealedNarrationFingerprint: seal.sealedNarrationFingerprint,
        sourceAudio: seal.completeAudio,
        outputAudio: {
          localPath: `public/projects/${storyId}/narration/pending/mastered/complete.wav`,
          checksum: sha256Bytes(mastered.outputWav),
          pcm: seal.completeAudio.pcm,
          sampleFrameCount: sourceMeasurement.sampleFrameCount,
        },
        measurements: mastered.measurements,
      });
      const destinationDir = join(
        rootDir,
        dirname(manifest.outputAudio.localPath),
      );
      const parent = dirname(destinationDir);
      await mkdir(parent, { recursive: true });
      const stagingDirectory = await mkdtemp(
        join(parent, `.${basename(destinationDir)}.staging-`),
      );
      try {
        await writeBytesSynced(
          join(stagingDirectory, "complete.wav"),
          mastered.outputWav,
        );
        await commitImmutableDirectory({
          sourceDir: stagingDirectory,
          destinationDir,
        });
        await writeJsonAtomic({ destination: paths.master, value: manifest });
      } finally {
        await rm(stagingDirectory, { recursive: true, force: true });
      }
      return checkMasteredNarrationArtifacts({
        rootDir,
        storyId,
        runProcess,
      });
    },
  );
};

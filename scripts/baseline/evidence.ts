import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import {
  computeM3EvidenceFingerprint,
  CompositionIdSchema,
  M3NarrativeBaselineEvidenceReceiptInputSchema,
  M3NarrativeBaselineEvidenceReceiptSchema,
  SealedNarrationManifestSchema,
  SemanticTimingSchema,
  Sha256DigestSchema,
  StoryIdSchema,
  type M3NarrativeBaselineEvidenceReceipt,
  type M3NarrativeBaselineEvidenceReceiptInput,
} from "../../src/contracts";
import { writeJsonAtomic } from "../narration/adapters/atomic-files";
import { generateProjectRegistry } from "../registry/generate";
import {
  discoverProjectEntries,
  loadProjectRegistrationEntry,
} from "../registry/project-files";

export type ProcessResult = {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
};

export type ProcessRunner = (
  command: string,
  args: readonly string[],
) => Promise<ProcessResult>;

const defaultProcessRunner: ProcessRunner = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (status) =>
      resolve({
        status: status ?? -1,
        stdout,
        stderr,
      }),
    );
  });

const parseSignalStats = (output: string) => {
  const minimum = /lavfi\.signalstats\.YMIN=([0-9.]+)/.exec(output)?.[1];
  const maximum = /lavfi\.signalstats\.YMAX=([0-9.]+)/.exec(output)?.[1];
  if (minimum === undefined || maximum === undefined) {
    throw new Error("FFmpeg alpha signal statistics are missing.");
  }
  const alphaMin = Number(minimum);
  const alphaMax = Number(maximum);
  if (
    !Number.isFinite(alphaMin) ||
    !Number.isFinite(alphaMax) ||
    alphaMin < 0 ||
    alphaMax > 255 ||
    alphaMin > alphaMax
  ) {
    throw new Error("FFmpeg alpha signal statistics are invalid.");
  }
  return { alphaMin, alphaMax };
};

const inspectAlphaPlane = async (
  path: string,
  runProcess: ProcessRunner,
  filterPrefix?: string,
) => {
  const filter = [
    filterPrefix,
    "alphaextract",
    "signalstats",
    "metadata=print:file=-",
  ]
    .filter((part): part is string => part !== undefined)
    .join(",");
  const result = await runProcess("ffmpeg", [
    "-v",
    "error",
    "-i",
    path,
    "-vf",
    filter,
    "-frames:v",
    "1",
    "-f",
    "null",
    "-",
  ]);
  if (result.status !== 0) {
    throw new Error(
      `FFmpeg could not inspect PNG alpha: ${result.stderr.trim() || "unknown failure"}`,
    );
  }
  return parseSignalStats(`${result.stdout}\n${result.stderr}`);
};

export const inspectAlphaStill = async (
  path: string,
  runProcess: ProcessRunner = defaultProcessRunner,
  inspectTopLeft = false,
): Promise<{
  readonly alphaMin: number;
  readonly alphaMax: number;
  readonly topLeftAlphaMax?: number;
}> => {
  const fullFrame = await inspectAlphaPlane(path, runProcess);
  if (!inspectTopLeft) return fullFrame;
  const topLeft = await inspectAlphaPlane(path, runProcess, "crop=64:64:0:0");
  return { ...fullFrame, topLeftAlphaMax: topLeft.alphaMax };
};

type ProbeStream = {
  readonly codec_type?: unknown;
  readonly codec_name?: unknown;
  readonly avg_frame_rate?: unknown;
  readonly nb_read_frames?: unknown;
  readonly sample_rate?: unknown;
  readonly channels?: unknown;
};

const parseFrameRate = (value: unknown): number => {
  if (typeof value !== "string") return Number.NaN;
  const [numeratorText, denominatorText] = value.split("/");
  const numerator = Number(numeratorText);
  const denominator = Number(denominatorText);
  return numerator / denominator;
};

export const inspectBaselineRender = async (
  path: string,
  runProcess: ProcessRunner = defaultProcessRunner,
): Promise<{
  readonly fps: 30;
  readonly durationInFrames: 1731;
  readonly videoStreamCount: 1;
  readonly audioStreamCount: 1;
}> => {
  const result = await runProcess("ffprobe", [
    "-v",
    "error",
    "-count_frames",
    "-show_entries",
    "stream=codec_type,codec_name,avg_frame_rate,nb_read_frames,sample_rate,channels",
    "-show_entries",
    "format=duration",
    "-of",
    "json",
    path,
  ]);
  if (result.status !== 0) {
    throw new Error(
      `ffprobe could not inspect Baseline render: ${result.stderr.trim() || "unknown failure"}`,
    );
  }
  let parsed: { readonly streams?: unknown; readonly format?: unknown };
  try {
    parsed = JSON.parse(result.stdout) as typeof parsed;
  } catch (error) {
    throw new Error("ffprobe returned malformed JSON.", { cause: error });
  }
  if (!Array.isArray(parsed.streams)) {
    throw new Error("ffprobe output has no stream list.");
  }
  const streams = parsed.streams as ProbeStream[];
  const video = streams.filter((stream) => stream.codec_type === "video");
  const audio = streams.filter((stream) => stream.codec_type === "audio");
  const errors: string[] = [];
  if (video.length !== 1) errors.push("one H.264 video stream is required");
  if (audio.length !== 1) errors.push("one AAC audio stream is required");
  if (video[0]?.codec_name !== "h264") errors.push("video must use H.264");
  if (audio[0]?.codec_name !== "aac") errors.push("audio must use AAC");
  if (parseFrameRate(video[0]?.avg_frame_rate) !== 30) {
    errors.push("video must use 30 fps");
  }
  if (Number(video[0]?.nb_read_frames) !== 1731) {
    errors.push("video must contain 1731 decoded frames");
  }
  if (errors.length > 0) throw new Error(errors.join("; "));
  return {
    fps: 30,
    durationInFrames: 1731,
    videoStreamCount: 1,
    audioStreamCount: 1,
  };
};

export const createM3EvidenceReceipt = (
  rawInput: M3NarrativeBaselineEvidenceReceiptInput,
): M3NarrativeBaselineEvidenceReceipt => {
  const input = M3NarrativeBaselineEvidenceReceiptInputSchema.parse(rawInput);
  return M3NarrativeBaselineEvidenceReceiptSchema.parse({
    ...input,
    evidenceFingerprint: computeM3EvidenceFingerprint(input),
  });
};

const sha256Bytes = (bytes: Buffer) =>
  Sha256DigestSchema.parse(
    `sha256:${createHash("sha256")
      .update(bytes.toString("latin1"), "latin1")
      .digest("hex")}`,
  );

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

const serializeReceipt = (receipt: M3NarrativeBaselineEvidenceReceipt) =>
  `${JSON.stringify(sortJsonValue(receipt), null, 2)}\n`;

export const resolveCurrentM3Entry = async (
  rootDir: string,
  rawStoryId: string,
) => {
  const storyId = StoryIdSchema.parse(rawStoryId);
  await generateProjectRegistry({ rootDir, mode: "check" });
  const expectedCompositionPath =
    `src/projects/${storyId}/Composition.tsx` as const;
  const compositionPaths = await discoverProjectEntries(rootDir);
  if (!compositionPaths.includes(expectedCompositionPath)) {
    throw new Error(`Unknown project: ${storyId}.`);
  }
  return loadProjectRegistrationEntry({
    rootDir,
    compositionPath: expectedCompositionPath,
  });
};

export const collectCurrentM3NarrativeBaselineEvidence = async ({
  rootDir,
  storyId: rawStoryId,
  runProcess = defaultProcessRunner,
}: {
  readonly rootDir: string;
  readonly storyId: string;
  readonly runProcess?: ProcessRunner;
}): Promise<M3NarrativeBaselineEvidenceReceipt> => {
  const storyId = StoryIdSchema.parse(rawStoryId);
  const entry = await resolveCurrentM3Entry(rootDir, storyId);

  const paths = {
    registry: "src/projects/project-registry.generated.ts",
    manifest: `src/projects/${storyId}/generated/sealed-narration.generated.json`,
    timing: `src/projects/${storyId}/generated/semantic-timing.generated.json`,
    transparentStill: `out/${storyId}/m3-transparent-frame-0.png`,
    captionStill: `out/${storyId}/m3-caption-frame-15.png`,
    render: `out/${storyId}/m3-narrative-baseline.mp4`,
    receipt: `src/projects/${storyId}/generated/narrative-baseline-evidence.generated.json`,
  } as const;
  const absolute = (path: string) => join(rootDir, path);
  const [
    registryBytes,
    manifestBytes,
    timingBytes,
    transparentStillBytes,
    captionStillBytes,
    renderBytes,
  ] = await Promise.all([
    readFile(absolute(paths.registry)),
    readFile(absolute(paths.manifest)),
    readFile(absolute(paths.timing)),
    readFile(absolute(paths.transparentStill)),
    readFile(absolute(paths.captionStill)),
    readFile(absolute(paths.render)),
  ]);
  const sealedNarration = SealedNarrationManifestSchema.parse(
    JSON.parse(manifestBytes.toString("utf8")),
  );
  const semanticTiming = SemanticTimingSchema.parse(
    JSON.parse(timingBytes.toString("utf8")),
  );
  if (
    sealedNarration.storyId !== storyId ||
    semanticTiming.storyId !== storyId ||
    entry.descriptor.id !== "GpsRelativity" ||
    entry.descriptor.fps !== 30 ||
    entry.descriptor.durationInFrames !== 1731 ||
    semanticTiming.fps !== entry.descriptor.fps ||
    semanticTiming.durationInFrames !== entry.descriptor.durationInFrames
  ) {
    throw new Error("M3 evidence inputs are stale against ProjectRegistry.");
  }
  const [transparentAlpha, captionAlpha, renderFacts] = await Promise.all([
    inspectAlphaStill(absolute(paths.transparentStill), runProcess),
    inspectAlphaStill(absolute(paths.captionStill), runProcess, true),
    inspectBaselineRender(absolute(paths.render), runProcess),
  ]);

  const receipt = createM3EvidenceReceipt({
    schemaVersion: 1,
    storyId: sealedNarration.storyId,
    compositionId: CompositionIdSchema.parse(entry.descriptor.id),
    sealedNarrationFingerprint: sealedNarration.sealedNarrationFingerprint,
    semanticTimingFingerprint: semanticTiming.fingerprint,
    generatedRegistryChecksum: sha256Bytes(registryBytes),
    projectRegistryEntryFingerprint: Sha256DigestSchema.parse(
      entry.projectRegistryEntryFingerprint,
    ),
    narrativeBaselineFingerprint: Sha256DigestSchema.parse(
      entry.narrativeBaselineFingerprint,
    ),
    artifacts: {
      transparentStill: {
        localPath: paths.transparentStill,
        checksum: sha256Bytes(transparentStillBytes),
        frame: 0,
        alphaMin: transparentAlpha.alphaMin as 0,
        alphaMax: transparentAlpha.alphaMax as 0,
      },
      captionStill: {
        localPath: paths.captionStill,
        checksum: sha256Bytes(captionStillBytes),
        frame: 15,
        alphaMin: captionAlpha.alphaMin as 0,
        alphaMax: captionAlpha.alphaMax,
        topLeftAlphaMax: captionAlpha.topLeftAlphaMax as 0,
      },
      render: {
        localPath: paths.render,
        checksum: sha256Bytes(renderBytes),
        ...renderFacts,
      },
    },
  });
  return receipt;
};

export const checkM3NarrativeBaselineEvidence = async ({
  rootDir,
  storyId,
  runProcess = defaultProcessRunner,
}: {
  readonly rootDir: string;
  readonly storyId: string;
  readonly runProcess?: ProcessRunner;
}): Promise<M3NarrativeBaselineEvidenceReceipt> => {
  const current = await collectCurrentM3NarrativeBaselineEvidence({
    rootDir,
    storyId,
    runProcess,
  });
  const receiptPath = join(
    rootDir,
    `src/projects/${current.storyId}/generated/narrative-baseline-evidence.generated.json`,
  );
  let persistedBytes: Buffer;
  try {
    persistedBytes = await readFile(receiptPath);
  } catch (error) {
    throw new Error("M3 evidence receipt is missing or unreadable.", {
      cause: error,
    });
  }
  let rawPersisted: unknown;
  try {
    rawPersisted = JSON.parse(persistedBytes.toString("utf8"));
  } catch (error) {
    throw new Error("M3 evidence receipt contains malformed JSON.", {
      cause: error,
    });
  }
  const persisted = M3NarrativeBaselineEvidenceReceiptSchema.parse(rawPersisted);
  if (
    persistedBytes.toString("utf8") !== serializeReceipt(current) ||
    serializeReceipt(persisted) !== serializeReceipt(current)
  ) {
    throw new Error("M3 evidence receipt drift: persisted bytes are stale.");
  }
  return persisted;
};

export const writeM3NarrativeBaselineEvidence = async ({
  rootDir,
  storyId,
  runProcess = defaultProcessRunner,
}: {
  readonly rootDir: string;
  readonly storyId: string;
  readonly runProcess?: ProcessRunner;
}): Promise<M3NarrativeBaselineEvidenceReceipt> => {
  const receipt = await collectCurrentM3NarrativeBaselineEvidence({
    rootDir,
    storyId,
    runProcess,
  });
  const receiptPath = join(
    rootDir,
    `src/projects/${receipt.storyId}/generated/narrative-baseline-evidence.generated.json`,
  );
  await writeJsonAtomic({
    destination: receiptPath,
    value: receipt,
  });
  return receipt;
};

export type BaselineEvidenceCliContext = {
  readonly rootDir: string;
  readonly runProcess: ProcessRunner;
  readonly stdout: (line: string) => void;
};

const defaultCliContext = (): BaselineEvidenceCliContext => ({
  rootDir: process.cwd(),
  runProcess: defaultProcessRunner,
  stdout: (line) => process.stdout.write(`${line}\n`),
});

export const runBaselineEvidenceCli = async (
  args: readonly string[],
  context: BaselineEvidenceCliContext = defaultCliContext(),
) => {
  if (args.length !== 2 || args[0] !== "--project") {
    throw new Error("Expected exactly --project <project slug>.");
  }
  const storyId = args[1] ?? "";
  const receipt = await writeM3NarrativeBaselineEvidence({
    rootDir: context.rootDir,
    storyId,
    runProcess: context.runProcess,
  });
  context.stdout(
    JSON.stringify({
      storyId: receipt.storyId,
      compositionId: receipt.compositionId,
      evidenceFingerprint: receipt.evidenceFingerprint,
    }),
  );
  return receipt;
};

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runBaselineEvidenceCli(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown failure.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}

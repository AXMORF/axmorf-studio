import {randomUUID} from "node:crypto";
import {lstat, mkdir, open, readFile, rename, rm} from "node:fs/promises";
import {dirname, join, resolve, sep} from "node:path";
import {pathToFileURL} from "node:url";

import {z} from "zod";

import {createFingerprint} from "../../src/contracts";
import {checksumExternalBytes} from "../external-references/project-files";
import {writeOrCheckSceneArtifact} from "../scene-package/project-files";

const SAMPLE_RATE = 48_000;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;
const FPS = 30;
const DURATION_IN_FRAMES = 1731;
const SAMPLE_FRAME_COUNT = (DURATION_IN_FRAMES * SAMPLE_RATE) / FPS;

const GlobalAudioInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatorVersion: z.literal("gps-m8-global-audio-generator-v1"),
    storyId: z.literal("gps-relativity"),
    fps: z.literal(FPS),
    durationInFrames: z.literal(DURATION_IN_FRAMES),
    sampleRate: z.literal(SAMPLE_RATE),
    channels: z.literal(CHANNELS),
    bitsPerSample: z.literal(BITS_PER_SAMPLE),
    assets: z
      .array(
        z
          .object({
            resourceId: z.enum([
              "asset.gps-cross-scene-ambience",
              "asset.gps-global-bgm",
            ]),
            role: z.enum(["cross-scene-ambience", "global-bgm"]),
            localPath: z.string().startsWith("public/projects/gps-relativity/global-audio/"),
            synthesisId: z.enum([
              "gps-orbital-ambience-v1",
              "gps-low-density-clock-bed-v1",
            ]),
            license: z
              .object({
                id: z.literal("Project-Authored"),
                verificationStatus: z.literal("verified"),
                sourceUrl: z.null(),
                attributionRequired: z.literal(false),
                attributionText: z.null(),
                verifiedAt: z.literal("2026-08-03T00:00:00.000Z"),
              })
              .strict(),
          })
          .strict(),
      )
      .length(2),
  })
  .strict()
  .superRefine((input, context) => {
    const expected = ["cross-scene-ambience", "global-bgm"];
    input.assets.forEach((asset, index) => {
      if (asset.role !== expected[index]) {
        context.addIssue({
          code: "custom",
          message: "Global audio assets must use canonical role order.",
          path: ["assets", index, "role"],
        });
      }
    });
  });

const fadeEnvelope = (sampleIndex: number): number => {
  const fadeSamples = SAMPLE_RATE * 0.8;
  const attack = Math.min(1, sampleIndex / fadeSamples);
  const release = Math.min(
    1,
    (SAMPLE_FRAME_COUNT - 1 - sampleIndex) / fadeSamples,
  );
  return Math.max(0, Math.min(attack, release));
};

const oscillator = (frequency: number, sampleIndex: number, phase = 0) =>
  Math.sin((2 * Math.PI * frequency * sampleIndex) / SAMPLE_RATE + phase);

const synthesize = (
  synthesisId:
    | "gps-orbital-ambience-v1"
    | "gps-low-density-clock-bed-v1",
  sampleIndex: number,
) => {
  const time = sampleIndex / SAMPLE_RATE;
  if (synthesisId === "gps-low-density-clock-bed-v1") {
    const slowPulse = 0.72 + 0.28 * Math.sin(2 * Math.PI * 0.0625 * time);
    const clockBreath = 0.82 + 0.18 * Math.sin(2 * Math.PI * 0.125 * time + 0.7);
    return (
      fadeEnvelope(sampleIndex) *
      slowPulse *
      clockBreath *
      (0.58 * oscillator(55, sampleIndex) +
        0.27 * oscillator(82.5, sampleIndex, 0.4) +
        0.15 * oscillator(110, sampleIndex, 1.1))
    );
  }
  const orbitalDrift = oscillator(31, sampleIndex, 0.2);
  const receiverField = oscillator(47.5, sampleIndex, 1.3);
  const signalTexture =
    oscillator(173, sampleIndex, 0.5) *
    (0.5 + 0.5 * oscillator(0.18, sampleIndex));
  return (
    fadeEnvelope(sampleIndex) *
    (0.56 * orbitalDrift + 0.34 * receiverField + 0.1 * signalTexture)
  );
};

const createCanonicalWav = (
  synthesisId:
    | "gps-orbital-ambience-v1"
    | "gps-low-density-clock-bed-v1",
) => {
  const pcm = Buffer.alloc(SAMPLE_FRAME_COUNT * 2);
  const amplitude =
    synthesisId === "gps-low-density-clock-bed-v1" ? 8_000 : 3_500;
  for (let index = 0; index < SAMPLE_FRAME_COUNT; index += 1) {
    const normalized = Math.max(-1, Math.min(1, synthesize(synthesisId, index)));
    pcm.writeInt16LE(Math.round(normalized * amplitude), index * 2);
  }
  const wav = Buffer.alloc(44 + pcm.length);
  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8, "ascii");
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(CHANNELS, 22);
  wav.writeUInt32LE(SAMPLE_RATE, 24);
  wav.writeUInt32LE(SAMPLE_RATE * CHANNELS * 2, 28);
  wav.writeUInt16LE(CHANNELS * 2, 32);
  wav.writeUInt16LE(BITS_PER_SAMPLE, 34);
  wav.write("data", 36, "ascii");
  wav.writeUInt32LE(pcm.length, 40);
  for (let index = 0; index < pcm.length; index += 1) {
    wav[44 + index] = pcm[index] ?? 0;
  }
  return wav;
};

export const inspectCanonicalWav = (bytes: ArrayLike<number>) => {
  const wav = Buffer.from(Array.from(bytes));
  if (
    wav.length < 44 ||
    wav.toString("ascii", 0, 4) !== "RIFF" ||
    wav.toString("ascii", 8, 16) !== "WAVEfmt " ||
    wav.readUInt16LE(20) !== 1 ||
    wav.toString("ascii", 36, 40) !== "data" ||
    wav.readUInt32LE(40) !== wav.length - 44
  ) {
    throw new Error("M8 global audio must be canonical PCM WAV.");
  }
  const channels = wav.readUInt16LE(22);
  const sampleRate = wav.readUInt32LE(24);
  const bitsPerSample = wav.readUInt16LE(34);
  if (bitsPerSample !== 16 || channels <= 0) {
    throw new Error("M8 global audio PCM format is unsupported.");
  }
  return {
    sampleRate,
    channels,
    bitsPerSample,
    sampleFrameCount: (wav.length - 44) / (channels * 2),
  } as const;
};

const assertInsideRoot = (rootDir: string, repositoryPath: string) => {
  const root = resolve(rootDir);
  const destination = resolve(rootDir, repositoryPath);
  if (!destination.startsWith(`${root}${sep}`)) {
    throw new Error("M8 global audio path escapes the repository root.");
  }
  return destination;
};

const writeOrCheckBytes = async ({
  destination,
  expected,
  mode,
}: {
  readonly destination: string;
  readonly expected: Buffer;
  readonly mode: "write" | "check";
}) => {
  let current: Buffer | null = null;
  try {
    const metadata = await lstat(destination);
    if (metadata.isSymbolicLink() || !metadata.isFile()) {
      throw new Error("M8 global audio output must be a regular file.");
    }
    current = await readFile(destination);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (
    current !== null &&
    current.length === expected.length &&
    current.every((value, index) => value === expected[index])
  )
    return;
  if (mode === "check") {
    throw new Error(
      current === null
        ? "M8 global audio output is missing."
        : "M8 global audio output bytes are stale.",
    );
  }
  if (current !== null) {
    throw new Error("M8 global audio writer refuses to overwrite unknown bytes.");
  }
  await mkdir(dirname(destination), {recursive: true});
  const temporary = `${destination}.tmp-${process.pid}-${randomUUID()}`;
  const handle = await open(temporary, "wx");
  try {
    await handle.writeFile(Uint8Array.from(Array.from(expected)));
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporary, destination);
  } finally {
    await rm(temporary, {force: true});
  }
};

export const generateGpsGlobalAudio = async ({
  rootDir,
  mode,
}: {
  readonly rootDir: string;
  readonly mode: "write" | "check";
}) => {
  const sourcePath = join(
    rootDir,
    "src/projects/gps-relativity/global-audio.json",
  );
  const source = GlobalAudioInputSchema.parse(
    JSON.parse(await readFile(sourcePath, "utf8")),
  );
  const assets = [];
  for (const declaration of source.assets) {
    const bytes = createCanonicalWav(declaration.synthesisId);
    const destination = assertInsideRoot(rootDir, declaration.localPath);
    await writeOrCheckBytes({destination, expected: bytes, mode});
    const inspected = inspectCanonicalWav(bytes);
    if (
      inspected.sampleRate !== SAMPLE_RATE ||
      inspected.channels !== CHANNELS ||
      inspected.bitsPerSample !== BITS_PER_SAMPLE ||
      inspected.sampleFrameCount !== SAMPLE_FRAME_COUNT
    ) {
      throw new Error("M8 global audio sample identity is stale.");
    }
    const checksum = checksumExternalBytes(Uint8Array.from(Array.from(bytes)));
    assets.push({...declaration, ...inspected, checksum});
  }
  const receiptInput = {
    schemaVersion: 1 as const,
    generatorVersion: source.generatorVersion,
    storyId: source.storyId,
    fps: source.fps,
    durationInFrames: source.durationInFrames,
    assets,
  };
  const receipt = {
    ...receiptInput,
    receiptFingerprint: createFingerprint({
      namespace: "gps-m8-global-audio-receipt",
      version: 1,
      value: receiptInput,
    }),
  };
  await writeOrCheckSceneArtifact({
    destination: join(
      rootDir,
      "src/projects/gps-relativity/generated/global-audio.generated.json",
    ),
    value: receipt,
    mode,
  });
  return receipt;
};

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const mode = process.argv[2];
  if (process.argv.length !== 3 || (mode !== "write" && mode !== "check")) {
    throw new Error("Expected exactly write or check.");
  }
  generateGpsGlobalAudio({rootDir: process.cwd(), mode}).catch(
    (error: unknown) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : "M8 global audio failed."}\n`,
      );
      process.exitCode = 1;
    },
  );
}

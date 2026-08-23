import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  NarrationPreparationReceiptSchema,
  NarrationSpecSchema,
  RenderSpecSchema,
  NarrationMasteringPolicySchema,
  SealedNarrationManifestSchema,
  StorySpecSchema,
  buildMasteredNarrationManifest,
  computeGenerationInputFingerprint,
  computeSealedNarrationFingerprint,
  createFingerprint,
  generateSemanticTiming,
  serializeCanonicalJson,
  type Sha256Digest,
  type ProducerConfig,
} from "../../src/contracts";
import type { PreparedNarrationInputs } from "../project-production/application/prepare-fixed-tasks";
import type {
  ProductionLocations,
  RuntimeExecutionResources,
} from "../project-production/application/production-locations";
import {
  encodeCanonicalPcmWav,
  sha256Bytes,
} from "../narration/domain/pcm-wav";
import { createExecutableProcessRunner } from "../narration/adapters/ffmpeg-normalizer";
import { masterNarrationBytes } from "../narration/mastering";
import { resolveNarrationMediaLogicalPath } from "../narration/production-paths";

export const DESKTOP_NATIVE_TEST_PROVIDER_VERSION =
  "desktop-native-test-pcm-v2" as const;

const SAMPLE_RATE = 48_000;

const write = async (path: string, value: string | Uint8Array) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, value);
};

const json = (value: unknown) => `${serializeCanonicalJson(value)}\n`;

const tone = ({
  sampleFrameCount,
  frequency,
}: {
  readonly sampleFrameCount: number;
  readonly frequency: number;
}) => {
  const pcm = Buffer.alloc(sampleFrameCount * 2);
  for (let index = 0; index < sampleFrameCount; index += 1) {
    const envelope = Math.min(
      1,
      index / 1_200,
      (sampleFrameCount - index) / 1_200,
    );
    const value = Math.round(
      Math.sin((2 * Math.PI * frequency * index) / SAMPLE_RATE) *
        4_000 *
        Math.max(0, envelope),
    );
    pcm.writeInt16LE(value, index * 2);
  }
  return pcm;
};

const readJson = async (path: string) =>
  JSON.parse(await readFile(path, "utf8")) as unknown;

/**
 * Native-gate-only narration port. The gate build must select this function
 * explicitly; production builds must not import this module or fall back to it.
 */
export type WorkspacePrepareNarration = (input: {
  readonly locations: ProductionLocations;
  readonly runtime: RuntimeExecutionResources;
  readonly config: ProducerConfig;
  readonly projectId: string;
}) => Promise<PreparedNarrationInputs>;

export const prepareWorkspaceNarration: WorkspacePrepareNarration = async ({
  locations,
  runtime,
  config,
  projectId,
}): Promise<PreparedNarrationInputs> => {
  if (locations.layoutKind !== "workspace") {
    throw new Error("desktop-native-test-provider-workspace-required");
  }
  const sourceRoot = join(locations.projectSourceRoot, projectId);
  const mediaRoot = join(locations.projectMediaRoot, projectId);
  const story = StorySpecSchema.parse(
    await readJson(join(sourceRoot, "story.json")),
  );
  const narration = NarrationSpecSchema.parse(
    await readJson(join(sourceRoot, "narration.json")),
  );
  const render = RenderSpecSchema.parse(
    await readJson(join(sourceRoot, "render.json")),
  );
  if (story.storyId !== projectId) {
    throw new Error("desktop-native-test-provider-project-mismatch");
  }
  const generationInputFingerprint = computeGenerationInputFingerprint(
    story,
    narration,
  );
  const providerAttemptFingerprint = createFingerprint({
    namespace: "desktop-native-test-provider-attempt",
    version: 1,
    value: {
      adapterVersion: DESKTOP_NATIVE_TEST_PROVIDER_VERSION,
      generationInputFingerprint,
    },
  });
  const pcm = {
    sampleRate: SAMPLE_RATE,
    channelLayout: "mono",
    sampleFormat: "s16le",
  } as const;
  const segmentPcm: Buffer[] = [];
  const chunkAudioBytes = new Map<string, Uint8Array>();
  const segments: Array<
    | Readonly<{
        kind: "chunk";
        chunkId: string;
        meaningId: string;
        ttsText: string;
        localPath: string;
        checksum: Sha256Digest;
        pcm: typeof pcm;
        sampleFrameCount: number;
      }>
    | Readonly<{
        kind: "pause";
        afterChunkId: string;
        meaningId: string;
        pauseMs: number;
        sampleFrameCount: number;
      }>
  > = [];
  let frequency = 360;
  for (const beat of story.beats) {
    if (beat.kind !== "narrated-scene") continue;
    const pauses = new Map(
      beat.explicitPauses.map(({ afterChunkId, pauseMs }) => [
        afterChunkId,
        pauseMs,
      ]),
    );
    for (const chunk of beat.ttsChunks) {
      const sampleFrameCount = 36_000;
      const rawPcm = tone({ sampleFrameCount, frequency });
      frequency += 90;
      const wav = encodeCanonicalPcmWav(rawPcm);
      const logicalPath = `public/projects/${projectId}/narration/chunks/${chunk.chunkId}.wav`;
      await write(
        join(mediaRoot, "narration/chunks", `${chunk.chunkId}.wav`),
        wav,
      );
      chunkAudioBytes.set(chunk.chunkId, wav);
      segmentPcm.push(rawPcm);
      segments.push({
        kind: "chunk",
        chunkId: chunk.chunkId,
        meaningId: beat.meaningId,
        ttsText: chunk.ttsText,
        localPath: logicalPath,
        checksum: sha256Bytes(wav),
        pcm,
        sampleFrameCount,
      });
      const pauseMs = pauses.get(chunk.chunkId);
      if (pauseMs !== undefined) {
        const pauseFrames = Math.round((pauseMs * SAMPLE_RATE) / 1_000);
        segmentPcm.push(Buffer.alloc(pauseFrames * 2));
        segments.push({
          kind: "pause",
          afterChunkId: chunk.chunkId,
          meaningId: beat.meaningId,
          pauseMs,
          sampleFrameCount: pauseFrames,
        });
      }
    }
  }
  const completePcm = Buffer.concat(segmentPcm);
  const completeAudioBytes = encodeCanonicalPcmWav(completePcm);
  const completeAudio = {
    localPath: `public/projects/${projectId}/narration/complete.wav`,
    checksum: sha256Bytes(completeAudioBytes),
    pcm,
    sampleFrameCount: completePcm.length / 2,
  } as const;
  const sealInput = {
    schemaVersion: 1,
    storyId: projectId,
    narrationSpec: narration,
    generationInputFingerprint,
    normalizationAlgorithmId: "pcm-s16le-normalize-v1",
    assemblyAlgorithmId: "ordered-pcm-concat-v1",
    canonicalPcm: pcm,
    segments,
    completeAudio,
  } as const;
  const sealedNarration = SealedNarrationManifestSchema.parse({
    ...sealInput,
    sealedNarrationFingerprint: computeSealedNarrationFingerprint(sealInput),
  });
  const completeAudioPath = join(mediaRoot, "narration/complete.wav");
  await write(completeAudioPath, completeAudioBytes);
  const mastered = await masterNarrationBytes({
    sourcePath: completeAudioPath,
    sourceWav: completeAudioBytes,
    targetLoudnessLufs: config.tts.speech.targetLoudnessLufs,
    runProcess: createExecutableProcessRunner(runtime.ffmpegExecutable),
    temporaryRoot: locations.disposableBuildRoot,
  });
  const masteredAudio = {
    localPath: `public/projects/${projectId}/narration-mastered/pending/complete.wav`,
    checksum: sha256Bytes(mastered.outputWav),
    pcm,
    sampleFrameCount: completePcm.length / 2,
  } as const;
  const masteredNarration = buildMasteredNarrationManifest({
    storyId: projectId,
    sealedNarrationFingerprint: sealedNarration.sealedNarrationFingerprint,
    sourceAudio: completeAudio,
    masteringPolicy: NarrationMasteringPolicySchema.parse(
      mastered.masteringPolicy,
    ),
    outputAudio: masteredAudio,
    measurements: mastered.measurements,
  });
  const semanticTiming = generateSemanticTiming({
    story,
    narration,
    render,
    sealedNarration,
  });
  const sealedManifestBytes = new TextEncoder().encode(json(sealedNarration));
  const semanticTimingBytes = new TextEncoder().encode(json(semanticTiming));
  const masteredManifestBytes = new TextEncoder().encode(
    json(masteredNarration),
  );
  const preparationReceipt = NarrationPreparationReceiptSchema.parse({
    schemaVersion: 1,
    contractVersion: "narration-preparation-v1",
    storyId: projectId,
    generationInputFingerprint,
    providerAttemptFingerprint,
    sealedNarrationFingerprint: sealedNarration.sealedNarrationFingerprint,
    masteringPolicy: masteredNarration.masteringPolicy,
  });
  await Promise.all([
    write(
      resolveNarrationMediaLogicalPath({
        locations,
        storyId: projectId,
        logicalPath: masteredNarration.outputAudio.localPath,
      }),
      mastered.outputWav,
    ),
    write(
      join(sourceRoot, "generated/sealed-narration.generated.json"),
      sealedManifestBytes,
    ),
    write(
      join(sourceRoot, "generated/semantic-timing.generated.json"),
      semanticTimingBytes,
    ),
    write(
      join(sourceRoot, "generated/mastered-narration.generated.json"),
      masteredManifestBytes,
    ),
    write(
      join(sourceRoot, "generated/narration-preparation.generated.json"),
      json(preparationReceipt),
    ),
  ]);
  return {
    providerAttemptFingerprint,
    masteringPolicy: masteredNarration.masteringPolicy,
    sealedNarration,
    semanticTiming,
    masteredNarration,
    sealedManifestBytes,
    semanticTimingBytes,
    masteredManifestBytes,
    completeAudioBytes,
    masteredAudioBytes: mastered.outputWav,
    chunkAudioBytes,
    actualCost: {
      providerRequests: chunkAudioBytes.size,
      providerCacheHits: 0,
    },
  };
};

export const prepareDesktopNativeTestNarration = prepareWorkspaceNarration;

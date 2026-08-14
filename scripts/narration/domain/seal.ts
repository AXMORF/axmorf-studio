import { computeGenerationInputFingerprint } from "../../../src/contracts/generation-input";
import type { NarrationSpec } from "../../../src/contracts/narration";
import {
  computeSealedNarrationFingerprint,
  SealedNarrationManifestSchema,
  type SealedNarrationManifest,
} from "../../../src/contracts/sealed-narration";
import { flattenTtsChunks, type StorySpec } from "../../../src/contracts/story";
import {
  CanonicalMeasuredChunkSchema,
  NarrationGenerationProgressSchema,
  type NarrationGenerationProgress,
} from "./candidate-progress";
import { computeChunkRequestFingerprint } from "./provider-input";
import {
  CANONICAL_NARRATION_PCM,
  concatenateCanonicalPcm,
  createExplicitPausePcm,
  measureCanonicalPcmWav,
  sha256Bytes,
} from "./pcm-wav";

export type NarrationSeal = {
  readonly manifest: SealedNarrationManifest;
  readonly completeWav: Buffer;
  readonly chunkWavs: ReadonlyMap<string, Buffer>;
};

const toSafeNumber = (value: bigint, label: string): number => {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${label} exceeds the safe integer range.`);
  }
  return Number(value);
};

export const buildNarrationSeal = ({
  story,
  narration,
  progress,
  normalizedChunks,
}: {
  readonly story: StorySpec;
  readonly narration: NarrationSpec;
  readonly progress: NarrationGenerationProgress;
  readonly normalizedChunks: ReadonlyMap<string, Buffer>;
}): NarrationSeal => {
  const parsedProgress = NarrationGenerationProgressSchema.parse(progress);
  const generationInputFingerprint = computeGenerationInputFingerprint(
    story,
    narration,
  );
  if (parsedProgress.storyId !== story.storyId) {
    throw new Error("Narration progress storyId does not match StorySpec.");
  }
  if (
    parsedProgress.generationInputFingerprint !== generationInputFingerprint
  ) {
    throw new Error("Narration progress generation input fingerprint is stale.");
  }

  const expectedChunks = flattenTtsChunks(story);
  if (parsedProgress.chunks.length !== expectedChunks.length) {
    throw new Error(
      "A complete measured candidate is required for every authored chunk.",
    );
  }
  const expectedChunkIds = new Set(
    expectedChunks.map((chunk) => chunk.chunkId as string),
  );
  if (
    normalizedChunks.size !== expectedChunks.length ||
    [...normalizedChunks.keys()].some((chunkId) => !expectedChunkIds.has(chunkId))
  ) {
    throw new Error(
      "Normalized chunk selection must contain exactly the authored chunks.",
    );
  }

  const pausesByChunkId = new Map(
    story.beats.flatMap((beat) =>
      beat.kind === "narrated-scene"
        ? beat.explicitPauses.map((pause) => [
            pause.afterChunkId,
            { ...pause, meaningId: beat.meaningId },
          ] as const)
        : [],
    ),
  );
  const chunkWavs = new Map<string, Buffer>();
  const wavParts: Buffer[] = [];
  const provisionalSegments: unknown[] = [];
  let segmentSampleFrameTotal = 0n;

  expectedChunks.forEach((expected, index) => {
    const measured = CanonicalMeasuredChunkSchema.parse(
      parsedProgress.chunks[index],
    );
    if (
      measured.chunkId !== expected.chunkId ||
      measured.meaningId !== expected.meaningId ||
      measured.ttsText !== expected.ttsText
    ) {
      throw new Error(
        `Measured narration chunk ${index} does not match authored order and identity.`,
      );
    }
    const requestFingerprint = computeChunkRequestFingerprint({
      generationInputFingerprint,
      providerAttemptFingerprint: parsedProgress.providerAttemptFingerprint,
      chunkId: expected.chunkId,
      meaningId: expected.meaningId,
      ttsText: expected.ttsText,
    });
    if (measured.requestFingerprint !== requestFingerprint) {
      throw new Error(`Measured chunk ${expected.chunkId} request is stale.`);
    }
    const normalizedWav = normalizedChunks.get(expected.chunkId);
    if (normalizedWav === undefined) {
      throw new Error(`Missing normalized WAV for ${expected.chunkId}.`);
    }
    const actualMeasurement = measureCanonicalPcmWav(normalizedWav);
    if (actualMeasurement.sampleFrameCount <= 0) {
      throw new Error(`Normalized chunk ${expected.chunkId} is empty.`);
    }
    if (
      actualMeasurement.sampleFrameCount !== measured.sampleFrameCount ||
      sha256Bytes(normalizedWav) !== measured.normalizedChecksum
    ) {
      throw new Error(
        `Normalized checksum or measurement is stale for ${expected.chunkId}.`,
      );
    }
    chunkWavs.set(expected.chunkId, normalizedWav);
    wavParts.push(normalizedWav);
    segmentSampleFrameTotal += BigInt(measured.sampleFrameCount);
    provisionalSegments.push({
      kind: "chunk",
      chunkId: expected.chunkId,
      meaningId: expected.meaningId,
      ttsText: expected.ttsText,
      localPath: `public/projects/${story.storyId}/narration/pending/chunks/${expected.chunkId}.wav`,
      checksum: measured.normalizedChecksum,
      pcm: CANONICAL_NARRATION_PCM,
      sampleFrameCount: measured.sampleFrameCount,
    });

    const pause = pausesByChunkId.get(expected.chunkId);
    if (pause !== undefined) {
      const explicitPause = createExplicitPausePcm(pause.pauseMs);
      wavParts.push(explicitPause.wav);
      segmentSampleFrameTotal += BigInt(explicitPause.sampleFrameCount);
      provisionalSegments.push({
        kind: "pause",
        afterChunkId: pause.afterChunkId,
        meaningId: pause.meaningId,
        pauseMs: pause.pauseMs,
        sampleFrameCount: explicitPause.sampleFrameCount,
      });
    }
  });

  const completeWav = concatenateCanonicalPcm(wavParts);
  const completeMeasurement = measureCanonicalPcmWav(completeWav);
  if (
    completeMeasurement.sampleFrameCount !==
    toSafeNumber(segmentSampleFrameTotal, "Complete narration sample count")
  ) {
    throw new Error(
      "Complete narration decoded sample count does not equal the segment sum.",
    );
  }

  const provisionalInput = {
    schemaVersion: 1,
    storyId: story.storyId,
    narrationSpec: narration,
    generationInputFingerprint,
    normalizationAlgorithmId: "pcm-s16le-normalize-v1",
    assemblyAlgorithmId: "ordered-pcm-concat-v1",
    canonicalPcm: CANONICAL_NARRATION_PCM,
    segments: provisionalSegments,
    completeAudio: {
      localPath: `public/projects/${story.storyId}/narration/pending/complete.wav`,
      checksum: sha256Bytes(completeWav),
      pcm: CANONICAL_NARRATION_PCM,
      sampleFrameCount: completeMeasurement.sampleFrameCount,
    },
  } as const;
  const sealedNarrationFingerprint =
    computeSealedNarrationFingerprint(provisionalInput);
  const sealedDigest = sealedNarrationFingerprint.slice("sha256:".length);
  const publicDirectory = `public/projects/${story.storyId}/narration/${sealedDigest}`;
  const finalInput = {
    ...provisionalInput,
    segments: provisionalSegments.map((segment) => {
      const value = segment as { readonly kind: "chunk" | "pause" };
      return value.kind === "chunk"
        ? {
            ...(segment as Record<string, unknown>),
            localPath: `${publicDirectory}/chunks/${(segment as { readonly chunkId: string }).chunkId}.wav`,
          }
        : segment;
    }),
    completeAudio: {
      ...provisionalInput.completeAudio,
      localPath: `${publicDirectory}/complete.wav`,
    },
  };
  if (
    computeSealedNarrationFingerprint(finalInput) !==
    sealedNarrationFingerprint
  ) {
    throw new Error("Content-addressed paths changed the sealed fingerprint.");
  }
  const manifest = SealedNarrationManifestSchema.parse({
    ...finalInput,
    sealedNarrationFingerprint,
  });
  return { manifest, completeWav, chunkWavs };
};

import { z } from "zod";

import { createFingerprint, serializeCanonicalJson } from "./fingerprint";
import { computeGenerationInputFingerprint } from "./generation-input";
import type { NarrationSpec } from "./narration";
import {
  MeaningIdSchema,
  NonNegativeIntegerSchema,
  Sha256DigestSchema,
  StoryIdSchema,
  TtsChunkIdSchema,
} from "./primitives";
import type { RenderSpec } from "./render";
import type { SealedNarrationManifest } from "./sealed-narration";
import type { StorySpec } from "./story";

export const TIMING_ALGORITHM_ID = "pcm-cumulative-ceil-v1" as const;

const FrameRangeSchema = z
  .object({
    startFrame: NonNegativeIntegerSchema,
    endFrame: NonNegativeIntegerSchema,
  })
  .strict()
  .superRefine((range, context) => {
    if (range.endFrame < range.startFrame) {
      context.addIssue({
        code: "custom",
        message: "Frame range must not run backward.",
      });
    }
  })
  .readonly();

const SampleRangeSchema = z
  .object({
    startSampleFrame: NonNegativeIntegerSchema,
    endSampleFrame: NonNegativeIntegerSchema,
  })
  .strict()
  .superRefine((range, context) => {
    if (range.endSampleFrame < range.startSampleFrame) {
      context.addIssue({
        code: "custom",
        message: "Sample range must not run backward.",
      });
    }
  })
  .readonly();

const NonEmptySampleRangeSchema = SampleRangeSchema.superRefine(
  (range, context) => {
    if (range.endSampleFrame === range.startSampleFrame) {
      context.addIssue({
        code: "custom",
        message: "Chunk sample range must contain PCM samples.",
      });
    }
  },
);

const TimedChunkSchema = z
  .object({
    kind: z.literal("chunk"),
    chunkId: TtsChunkIdSchema,
    meaningId: MeaningIdSchema,
    ttsText: z.string().trim().min(1),
    sampleRange: NonEmptySampleRangeSchema,
    frameRange: FrameRangeSchema,
  })
  .strict()
  .readonly();

const TimedPauseSchema = z
  .object({
    kind: z.literal("pause"),
    afterChunkId: TtsChunkIdSchema,
    meaningId: MeaningIdSchema,
    pauseMs: NonNegativeIntegerSchema,
    sampleRange: SampleRangeSchema,
    frameRange: FrameRangeSchema,
  })
  .strict()
  .readonly();

const CaptionCueSchema = z
  .object({
    chunkId: TtsChunkIdSchema,
    meaningId: MeaningIdSchema,
    text: z.string().trim().min(1),
    startFrame: NonNegativeIntegerSchema,
    endFrame: NonNegativeIntegerSchema,
  })
  .strict()
  .superRefine((cue, context) => {
    if (cue.endFrame <= cue.startFrame) {
      context.addIssue({
        code: "custom",
        message: "CaptionCue must cover at least one frame.",
      });
    }
  })
  .readonly();

const StoryBeatTimingSchema = z
  .object({
    meaningId: MeaningIdSchema,
    startFrame: NonNegativeIntegerSchema,
    endFrame: NonNegativeIntegerSchema,
  })
  .strict()
  .superRefine((beat, context) => {
    if (beat.endFrame <= beat.startFrame) {
      context.addIssue({
        code: "custom",
        message: "StoryBeat timing must cover at least one frame.",
      });
    }
  })
  .readonly();

export const SemanticTimingSchema = z
  .object({
    schemaVersion: z.literal(1),
    algorithmId: z.literal(TIMING_ALGORITHM_ID),
    storyId: StoryIdSchema,
    fingerprint: Sha256DigestSchema,
    sampleRate: z.number().int().positive().safe(),
    fps: z.number().int().positive().safe(),
    leadInFrames: NonNegativeIntegerSchema,
    tailFrames: NonNegativeIntegerSchema,
    durationInFrames: z.number().int().positive().safe(),
    segments: z
      .array(z.discriminatedUnion("kind", [TimedChunkSchema, TimedPauseSchema]))
      .min(1)
      .readonly(),
    captionCues: z.array(CaptionCueSchema).min(1).readonly(),
    storyBeats: z.array(StoryBeatTimingSchema).min(1).readonly(),
  })
  .strict()
  .readonly();

export type SemanticTiming = z.infer<typeof SemanticTimingSchema>;

export const ceilDivBigInt = (value: bigint, divisor: bigint): bigint => {
  if (value < 0n || divisor <= 0n)
    throw new Error("ceilDivBigInt requires value >= 0 and divisor > 0.");
  return (value + divisor - 1n) / divisor;
};

const toSafeNumber = (value: bigint, label: string): number => {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${label} is outside the non-negative safe integer range.`);
  }
  return Number(value);
};

export const pauseMsToSampleFrames = (
  pauseMs: number,
  sampleRate: number,
): number => {
  if (!Number.isSafeInteger(pauseMs) || pauseMs < 0)
    throw new Error("pauseMs must be non-negative.");
  if (!Number.isSafeInteger(sampleRate) || sampleRate <= 0)
    throw new Error("sampleRate must be positive.");
  const samples = (BigInt(pauseMs) * BigInt(sampleRate) + 500n) / 1000n;
  if (pauseMs > 0 && samples === 0n)
    throw new Error("Positive pause must produce at least one sample frame.");
  return toSafeNumber(samples, "pause sampleFrameCount");
};

export const sampleFrameToFrame = ({
  sampleFrame,
  fps,
  sampleRate,
}: {
  readonly sampleFrame: number;
  readonly fps: number;
  readonly sampleRate: number;
}): number => {
  if (![sampleFrame, fps, sampleRate].every(Number.isSafeInteger)) {
    throw new Error("sampleFrame, fps, and sampleRate must be safe integers.");
  }
  return toSafeNumber(
    ceilDivBigInt(BigInt(sampleFrame) * BigInt(fps), BigInt(sampleRate)),
    "frame boundary",
  );
};

export const computeSemanticTimingFingerprint = (
  sealedNarration: SealedNarrationManifest,
  render: RenderSpec,
) =>
  createFingerprint({
    namespace: "semantic-timing",
    version: 1,
    value: {
      algorithmId: TIMING_ALGORITHM_ID,
      sealedNarrationFingerprint: sealedNarration.sealedNarrationFingerprint,
      fps: render.fps,
      leadInFrames: render.leadInFrames,
      tailFrames: render.tailFrames,
    },
  });

export const generateSemanticTiming = ({
  story,
  narration,
  render,
  sealedNarration,
}: {
  readonly story: StorySpec;
  readonly narration: NarrationSpec;
  readonly render: RenderSpec;
  readonly sealedNarration: SealedNarrationManifest;
}): SemanticTiming => {
  if (story.storyId !== sealedNarration.storyId)
    throw new Error("Story and sealed narration ids differ.");
  if (
    serializeCanonicalJson(narration) !==
    serializeCanonicalJson(sealedNarration.narrationSpec)
  ) {
    throw new Error("NarrationSpec does not match sealed narration.");
  }
  if (
    computeGenerationInputFingerprint(story, narration) !==
    sealedNarration.generationInputFingerprint
  ) {
    throw new Error("Generation input fingerprint is stale.");
  }

  const expected = story.beats.flatMap((beat) => {
    const pauses = new Map(
      beat.explicitPauses.map((pause) => [pause.afterChunkId, pause]),
    );
    return beat.ttsChunks.flatMap((chunk) => {
      const pause = pauses.get(chunk.chunkId);
      return [
        {
          kind: "chunk" as const,
          chunkId: chunk.chunkId,
          meaningId: beat.meaningId,
          ttsText: chunk.ttsText,
        },
        ...(pause
          ? [
              {
                kind: "pause" as const,
                afterChunkId: chunk.chunkId,
                meaningId: beat.meaningId,
                pauseMs: pause.pauseMs,
              },
            ]
          : []),
      ];
    });
  });

  if (expected.length !== sealedNarration.segments.length) {
    throw new Error("Sealed timeline segment count does not match StorySpec.");
  }

  let sampleCursor = 0n;
  const timedSegments = sealedNarration.segments.map((segment, index) => {
    const declaration = expected[index];
    if (
      serializeCanonicalJson(declaration) !==
      serializeCanonicalJson(
        segment.kind === "chunk"
          ? {
              kind: segment.kind,
              chunkId: segment.chunkId,
              meaningId: segment.meaningId,
              ttsText: segment.ttsText,
            }
          : {
              kind: segment.kind,
              afterChunkId: segment.afterChunkId,
              meaningId: segment.meaningId,
              pauseMs: segment.pauseMs,
            },
      )
    ) {
      throw new Error(`Sealed segment ${index} does not match StorySpec.`);
    }
    if (
      segment.kind === "pause" &&
      segment.sampleFrameCount !==
        pauseMsToSampleFrames(
          segment.pauseMs,
          sealedNarration.canonicalPcm.sampleRate,
        )
    ) {
      throw new Error(`Pause segment ${index} has a stale sampleFrameCount.`);
    }

    const startSampleFrameBigInt = sampleCursor;
    sampleCursor += BigInt(segment.sampleFrameCount);
    const endSampleFrameBigInt = sampleCursor;
    const startSampleFrame = toSafeNumber(
      startSampleFrameBigInt,
      "startSampleFrame",
    );
    const endSampleFrame = toSafeNumber(endSampleFrameBigInt, "endSampleFrame");
    const startFrame = toSafeNumber(
      BigInt(render.leadInFrames) +
        BigInt(
          sampleFrameToFrame({
            sampleFrame: startSampleFrame,
            fps: render.fps,
            sampleRate: sealedNarration.canonicalPcm.sampleRate,
          }),
        ),
      "absolute startFrame",
    );
    const endFrame = toSafeNumber(
      BigInt(render.leadInFrames) +
        BigInt(
          sampleFrameToFrame({
            sampleFrame: endSampleFrame,
            fps: render.fps,
            sampleRate: sealedNarration.canonicalPcm.sampleRate,
          }),
        ),
      "absolute endFrame",
    );
    if (segment.kind === "chunk" && endFrame <= startFrame) {
      throw new Error(`TTSChunk ${segment.chunkId} quantizes to zero frames.`);
    }

    return {
      ...declaration,
      sampleRange: { startSampleFrame, endSampleFrame },
      frameRange: { startFrame, endFrame },
    };
  });

  if (sampleCursor !== BigInt(sealedNarration.completeAudio.sampleFrameCount)) {
    throw new Error("Generated sample timeline does not match complete audio.");
  }

  const captionCues = timedSegments.flatMap((segment) =>
    segment.kind === "chunk"
      ? [
          {
            chunkId: segment.chunkId,
            meaningId: segment.meaningId,
            text: segment.ttsText,
            startFrame: segment.frameRange.startFrame,
            endFrame: segment.frameRange.endFrame,
          },
        ]
      : [],
  );

  const storyBeats = story.beats.map((beat) => {
    const owned = timedSegments.filter(
      (segment) => segment.meaningId === beat.meaningId,
    );
    if (owned.length === 0)
      throw new Error(`StoryBeat ${beat.meaningId} has no timed segments.`);
    return {
      meaningId: beat.meaningId,
      startFrame: owned[0].frameRange.startFrame,
      endFrame: owned[owned.length - 1].frameRange.endFrame,
    };
  });

  const narrationFrames = sampleFrameToFrame({
    sampleFrame: toSafeNumber(sampleCursor, "total sampleFrameCount"),
    fps: render.fps,
    sampleRate: sealedNarration.canonicalPcm.sampleRate,
  });

  return SemanticTimingSchema.parse({
    schemaVersion: 1,
    algorithmId: TIMING_ALGORITHM_ID,
    storyId: story.storyId,
    fingerprint: computeSemanticTimingFingerprint(sealedNarration, render),
    sampleRate: sealedNarration.canonicalPcm.sampleRate,
    fps: render.fps,
    leadInFrames: render.leadInFrames,
    tailFrames: render.tailFrames,
    durationInFrames: toSafeNumber(
      BigInt(render.leadInFrames) +
        BigInt(narrationFrames) +
        BigInt(render.tailFrames),
      "durationInFrames",
    ),
    segments: timedSegments,
    captionCues,
    storyBeats,
  });
};

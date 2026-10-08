import { z } from "zod";

import { createFingerprint, serializeCanonicalJson } from "./fingerprint";
import {
  computeGenerationInputFingerprint,
  computeStoryFingerprint,
} from "./generation-input";
import type { NarrationSpec } from "./narration";
import {
  MeaningIdSchema,
  NonNegativeIntegerSchema,
  PositiveIntegerSchema,
  Sha256DigestSchema,
  StoryIdSchema,
  TtsChunkIdSchema,
} from "./primitives";
import { RenderSpecSchema, type RenderSpec } from "./render";
import type { SealedNarrationManifest } from "./sealed-narration";
import { isVisualStory, StorySpecSchema, type StorySpec } from "./story";

export const VISUAL_TIMING_ALGORITHM_ID = "authored-frames-v1" as const;

export const TIMING_ALGORITHM_ID = "pcm-cumulative-ceil-v1" as const;
export const AUTHORED_FRAME_TIMING_ALGORITHM_ID =
  "authored-cumulative-frames-v1" as const;

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

const NarratedStoryBeatTimingSchema = z
  .object({
    kind: z.literal("narrated-scene"),
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

const SilentStoryBeatTimingSchema = z
  .object({
    kind: z.literal("silent-scene"),
    meaningId: MeaningIdSchema,
    presetFingerprint: Sha256DigestSchema,
    presetDurationInFrames: PositiveIntegerSchema,
    startFrame: NonNegativeIntegerSchema,
    endFrame: NonNegativeIntegerSchema,
  })
  .strict()
  .superRefine((beat, context) => {
    if (beat.endFrame <= beat.startFrame) {
      context.addIssue({
        code: "custom",
        message: "Silent StoryBeat timing must cover at least one frame.",
      });
    }
    if (beat.endFrame - beat.startFrame !== beat.presetDurationInFrames) {
      context.addIssue({
        code: "custom",
        message: "Silent StoryBeat timing must equal its preset duration.",
        path: ["endFrame"],
      });
    }
  })
  .readonly();

const StoryBeatTimingSchema = z.discriminatedUnion("kind", [
  NarratedStoryBeatTimingSchema,
  SilentStoryBeatTimingSchema,
]);

export const PcmSemanticTimingSchema = z
  .object({
    schemaVersion: z.literal(3),
    algorithmId: z.literal(TIMING_ALGORITHM_ID),
    storyId: StoryIdSchema,
    fingerprint: Sha256DigestSchema,
    sampleRate: z.number().int().positive().safe(),
    fps: z.number().int().positive().safe(),
    leadInFrames: NonNegativeIntegerSchema,
    tailFrames: NonNegativeIntegerSchema,
    narrationStartFrame: NonNegativeIntegerSchema,
    durationInFrames: z.number().int().positive().safe(),
    segments: z
      .array(z.discriminatedUnion("kind", [TimedChunkSchema, TimedPauseSchema]))
      .min(1)
      .readonly(),
    captionCues: z.array(CaptionCueSchema).min(1).readonly(),
    storyBeats: z.array(StoryBeatTimingSchema).min(1).readonly(),
  })
  .strict()
  .superRefine((timing, context) => {
    const expectedCaptionCues: Array<{
      readonly chunkId: string;
      readonly meaningId: string;
      readonly text: string;
      readonly startFrame: number;
      readonly endFrame: number;
    }> = [];
    const narratedGroups: Array<{
      readonly meaningId: string;
      readonly startFrame: number;
      endFrame: number;
    }> = [];
    const seenMeaningIds = new Set<string>();
    let previousSampleEnd = 0;
    let previousFrameEnd = timing.narrationStartFrame;

    timing.segments.forEach((segment, index) => {
      if (segment.sampleRange.startSampleFrame !== previousSampleEnd) {
        context.addIssue({
          code: "custom",
          message: "Segment sample ranges must share cumulative boundaries.",
          path: ["segments", index, "sampleRange", "startSampleFrame"],
        });
      }
      if (segment.frameRange.startFrame !== previousFrameEnd) {
        context.addIssue({
          code: "custom",
          message: "Segment frame ranges must share cumulative boundaries.",
          path: ["segments", index, "frameRange", "startFrame"],
        });
      }
      previousSampleEnd = segment.sampleRange.endSampleFrame;
      previousFrameEnd = segment.frameRange.endFrame;

      if (segment.kind === "chunk") {
        expectedCaptionCues.push({
          chunkId: segment.chunkId,
          meaningId: segment.meaningId,
          text: segment.ttsText,
          startFrame: segment.frameRange.startFrame,
          endFrame: segment.frameRange.endFrame,
        });
      }

      const currentBeat = narratedGroups.at(-1);
      if (currentBeat?.meaningId === segment.meaningId) {
        currentBeat.endFrame = segment.frameRange.endFrame;
      } else {
        if (seenMeaningIds.has(segment.meaningId)) {
          context.addIssue({
            code: "custom",
            message: "StoryBeat segments must form one contiguous range.",
            path: ["segments", index, "meaningId"],
          });
        }
        seenMeaningIds.add(segment.meaningId);
        narratedGroups.push({
          meaningId: segment.meaningId,
          startFrame: segment.frameRange.startFrame,
          endFrame: segment.frameRange.endFrame,
        });
      }
    });

    if (timing.captionCues.length !== expectedCaptionCues.length) {
      context.addIssue({
        code: "custom",
        message: "CaptionCue must be one-to-one with timed TTSChunk segments.",
        path: ["captionCues"],
      });
    } else {
      timing.captionCues.forEach((cue, index) => {
        const expected = expectedCaptionCues[index];
        if (
          cue.chunkId !== expected.chunkId ||
          cue.meaningId !== expected.meaningId ||
          cue.text !== expected.text ||
          cue.startFrame !== expected.startFrame ||
          cue.endFrame !== expected.endFrame
        ) {
          context.addIssue({
            code: "custom",
            message: "CaptionCue must match its timed TTSChunk segment.",
            path: ["captionCues", index],
          });
        }
      });
    }

    let beatFrameCursor = timing.leadInFrames;
    const narratedBeats = timing.storyBeats.filter(
      (beat) => beat.kind !== "silent-scene",
    );
    timing.storyBeats.forEach((beat, index) => {
      if (beat.startFrame !== beatFrameCursor) {
        context.addIssue({
          code: "custom",
          message: "StoryBeat timing windows must be continuous.",
          path: ["storyBeats", index, "startFrame"],
        });
      }
      beatFrameCursor = beat.endFrame;
    });
    if (
      narratedBeats.length !== narratedGroups.length ||
      narratedBeats.length === 0
    ) {
      context.addIssue({
        code: "custom",
        message: "Narrated StoryBeat timing must match narration segments.",
        path: ["storyBeats"],
      });
    } else {
      narratedBeats.forEach((beat, index) => {
        const expected = narratedGroups[index];
        if (
          beat.meaningId !== expected.meaningId ||
          beat.startFrame !== expected.startFrame ||
          beat.endFrame !== expected.endFrame
        ) {
          context.addIssue({
            code: "custom",
            message: "Narrated StoryBeat timing must match its segment group.",
            path: ["storyBeats", index],
          });
        }
      });
      if (timing.narrationStartFrame !== narratedBeats[0]?.startFrame) {
        context.addIssue({
          code: "custom",
          message: "narrationStartFrame must equal the first narrated Scene.",
          path: ["narrationStartFrame"],
        });
      }
    }

    const expectedDuration = beatFrameCursor + timing.tailFrames;
    if (
      !Number.isSafeInteger(expectedDuration) ||
      timing.durationInFrames !== expectedDuration
    ) {
      context.addIssue({
        code: "custom",
        message: "durationInFrames must include the final boundary and tail.",
        path: ["durationInFrames"],
      });
    }
  })
  .readonly();

export const AuthoredFrameTimingSchema = z
  .object({
    schemaVersion: z.literal(3),
    algorithmId: z.literal(AUTHORED_FRAME_TIMING_ALGORITHM_ID),
    storyId: StoryIdSchema,
    fingerprint: Sha256DigestSchema,
    sampleRate: z.null(),
    fps: z.number().int().positive().safe(),
    leadInFrames: NonNegativeIntegerSchema,
    tailFrames: NonNegativeIntegerSchema,
    narrationStartFrame: z.null(),
    durationInFrames: PositiveIntegerSchema,
    segments: z.tuple([]).readonly(),
    captionCues: z.tuple([]).readonly(),
    storyBeats: z.array(SilentStoryBeatTimingSchema).min(1).readonly(),
    contentFrameRange: z
      .object({
        startFrame: NonNegativeIntegerSchema,
        endFrame: PositiveIntegerSchema,
      })
      .strict()
      .readonly(),
  })
  .strict()
  .superRefine((timing, context) => {
    let cursor = timing.leadInFrames;
    const ids = new Set<string>();
    timing.storyBeats.forEach((beat, index) => {
      if (beat.startFrame !== cursor || ids.has(beat.meaningId)) {
        context.addIssue({
          code: "custom",
          message:
            "Authored-frame Beats must have unique IDs and cumulative frame boundaries.",
          path: ["storyBeats", index],
        });
      }
      cursor = beat.endFrame;
      ids.add(beat.meaningId);
    });
    const expectedDuration = cursor + timing.tailFrames;
    if (
      !Number.isSafeInteger(expectedDuration) ||
      timing.durationInFrames !== expectedDuration
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Authored-frame duration must include cumulative Beats and tail.",
        path: ["durationInFrames"],
      });
    }
    if (
      timing.contentFrameRange.endFrame <=
        timing.contentFrameRange.startFrame ||
      !timing.storyBeats.some(
        (beat) => beat.startFrame === timing.contentFrameRange.startFrame,
      ) ||
      !timing.storyBeats.some(
        (beat) => beat.endFrame === timing.contentFrameRange.endFrame,
      )
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Authored visual content must cover a non-empty whole-Beat frame window.",
        path: ["contentFrameRange"],
      });
    }
  })
  .readonly();

const VisualStoryBeatTimingSchema = z
  .object({
    kind: z.literal("visual-scene"),
    meaningId: MeaningIdSchema,
    durationInFrames: PositiveIntegerSchema,
    startFrame: NonNegativeIntegerSchema,
    endFrame: PositiveIntegerSchema,
  })
  .strict()
  .refine((beat) => beat.endFrame - beat.startFrame === beat.durationInFrames, {
    message: "Visual StoryBeat timing must equal its authored duration.",
    path: ["endFrame"],
  })
  .readonly();

export const VisualSemanticTimingSchema = z
  .object({
    schemaVersion: z.literal(3),
    algorithmId: z.literal(VISUAL_TIMING_ALGORITHM_ID),
    storyId: StoryIdSchema,
    fingerprint: Sha256DigestSchema,
    sampleRate: z.null(),
    fps: PositiveIntegerSchema,
    leadInFrames: NonNegativeIntegerSchema,
    tailFrames: NonNegativeIntegerSchema,
    narrationStartFrame: z.null(),
    durationInFrames: PositiveIntegerSchema,
    segments: z
      .array(z.discriminatedUnion("kind", [TimedChunkSchema, TimedPauseSchema]))
      .max(0)
      .readonly(),
    captionCues: z.array(CaptionCueSchema).max(0).readonly(),
    storyBeats: z
      .array(
        z.discriminatedUnion("kind", [
          VisualStoryBeatTimingSchema,
          SilentStoryBeatTimingSchema,
        ]),
      )
      .min(1)
      .readonly(),
  })
  .strict()
  .superRefine((timing, context) => {
    let cursor = timing.leadInFrames;
    const meaningIds = new Set<string>();
    timing.storyBeats.forEach((beat, index) => {
      if (beat.startFrame !== cursor) {
        context.addIssue({
          code: "custom",
          message: "StoryBeat timing windows must be continuous.",
          path: ["storyBeats", index, "startFrame"],
        });
      }
      if (meaningIds.has(beat.meaningId)) {
        context.addIssue({
          code: "custom",
          message: "StoryBeat timing meaning IDs must be unique.",
          path: ["storyBeats", index, "meaningId"],
        });
      }
      meaningIds.add(beat.meaningId);
      if (
        beat.kind === "silent-scene" &&
        index !== 0 &&
        index !== timing.storyBeats.length - 1
      ) {
        context.addIssue({
          code: "custom",
          message: "Silent Scenes must stay at a Story boundary.",
          path: ["storyBeats", index],
        });
      }
      cursor = beat.endFrame;
    });
    if (!timing.storyBeats.some((beat) => beat.kind === "visual-scene")) {
      context.addIssue({
        code: "custom",
        message: "Authored-frame timing requires visual content.",
        path: ["storyBeats"],
      });
    }
    const expectedDuration = cursor + timing.tailFrames;
    if (
      !Number.isSafeInteger(expectedDuration) ||
      timing.durationInFrames !== expectedDuration
    ) {
      context.addIssue({
        code: "custom",
        message: "durationInFrames must include the final boundary and tail.",
        path: ["durationInFrames"],
      });
    }
  })
  .readonly();

export const SemanticTimingSchema = z.discriminatedUnion("algorithmId", [
  PcmSemanticTimingSchema,
  AuthoredFrameTimingSchema,
  VisualSemanticTimingSchema,
]);

export type PcmSemanticTiming = z.infer<typeof PcmSemanticTimingSchema>;
export type VisualSemanticTiming = z.infer<typeof VisualSemanticTimingSchema>;
export type SemanticTiming = z.infer<typeof SemanticTimingSchema>;
export type AuthoredFrameTiming = z.infer<typeof AuthoredFrameTimingSchema>;

export const resolveSemanticContentFrameRange = (
  rawTiming: unknown,
): Readonly<{ startFrame: number; endFrame: number }> => {
  const timing = SemanticTimingSchema.parse(rawTiming);
  if (timing.algorithmId === AUTHORED_FRAME_TIMING_ALGORITHM_ID)
    return timing.contentFrameRange;
  const content = timing.storyBeats.filter(
    (beat) => beat.kind !== "silent-scene",
  );
  const first = content[0];
  const last = content.at(-1);
  if (first === undefined || last === undefined)
    throw new Error("Semantic timing has no content window.");
  return { startFrame: first.startFrame, endFrame: last.endFrame } as const;
};

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
  story: StorySpec,
  sealedNarration: SealedNarrationManifest | null,
  render: RenderSpec,
) => {
  if (story.timingSource === "authored-frames") {
    if (sealedNarration !== null)
      throw new Error("Authored-frame timing cannot use sealed narration.");
    return createFingerprint({
      namespace: "semantic-timing",
      version: 3,
      value: {
        algorithmId: AUTHORED_FRAME_TIMING_ALGORITHM_ID,
        storyFingerprint: computeStoryFingerprint(story),
        fps: render.fps,
        leadInFrames: render.leadInFrames,
        tailFrames: render.tailFrames,
      },
    });
  }
  if (isVisualStory(story))
    throw new Error(
      "Visual Stories use authored-frame timing without sealed narration.",
    );
  if (sealedNarration === null)
    throw new Error("Narrated timing requires sealed narration.");
  return createFingerprint({
    namespace: "semantic-timing",
    version: 3,
    value: {
      algorithmId: TIMING_ALGORITHM_ID,
      storyFingerprint: computeStoryFingerprint(story),
      sealedNarrationFingerprint: sealedNarration.sealedNarrationFingerprint,
      fps: render.fps,
      leadInFrames: render.leadInFrames,
      tailFrames: render.tailFrames,
    },
  });
};

export const generateAuthoredFrameTiming = ({
  story: rawStory,
  render: rawRender,
}: {
  readonly story: StorySpec;
  readonly render: RenderSpec;
}): AuthoredFrameTiming => {
  const story = StorySpecSchema.parse(rawStory);
  const render = RenderSpecSchema.parse(rawRender);
  if (story.timingSource !== "authored-frames")
    throw new Error(
      "Authored-frame timing requires an explicit Story timing source.",
    );
  let cursor = BigInt(render.leadInFrames);
  const storyBeats = story.beats.map((beat) => {
    if (beat.kind !== "silent-scene")
      throw new Error("Authored-frame timing rejects narrated Beats.");
    const startFrame = toSafeNumber(cursor, "Authored-frame startFrame");
    cursor += BigInt(beat.preset.durationInFrames);
    return {
      kind: beat.kind,
      meaningId: beat.meaningId,
      presetFingerprint: beat.preset.presetFingerprint,
      presetDurationInFrames: beat.preset.durationInFrames,
      startFrame,
      endFrame: toSafeNumber(cursor, "Authored-frame endFrame"),
    };
  });
  const content = storyBeats.filter((_, index) => {
    const beat = story.beats[index];
    return (
      beat.kind === "silent-scene" &&
      beat.preset.implementation.kind === "scene-owner"
    );
  });
  const first = content[0];
  const last = content.at(-1);
  if (first === undefined || last === undefined)
    throw new Error("Authored-frame timing requires visual content.");
  return AuthoredFrameTimingSchema.parse({
    schemaVersion: 3,
    algorithmId: AUTHORED_FRAME_TIMING_ALGORITHM_ID,
    storyId: story.storyId,
    fingerprint: computeSemanticTimingFingerprint(story, null, render),
    sampleRate: null,
    fps: render.fps,
    leadInFrames: render.leadInFrames,
    tailFrames: render.tailFrames,
    narrationStartFrame: null,
    durationInFrames: toSafeNumber(
      cursor + BigInt(render.tailFrames),
      "Authored-frame durationInFrames",
    ),
    segments: [],
    captionCues: [],
    storyBeats,
    contentFrameRange: {
      startFrame: first.startFrame,
      endFrame: last.endFrame,
    },
  });
};

export const generateSemanticTiming = ({
  story,
  narration,
  render,
  sealedNarration,
}: {
  readonly story: StorySpec;
  readonly narration: NarrationSpec | null;
  readonly render: RenderSpec;
  readonly sealedNarration: SealedNarrationManifest | null;
}): SemanticTiming => {
  if (story.timingSource === "authored-frames") {
    if (sealedNarration !== null)
      throw new Error("Authored-frame timing cannot use sealed narration.");
    return generateAuthoredFrameTiming({ story, render });
  }
  if (sealedNarration === null || narration === null)
    throw new Error("Narrated timing requires sealed narration.");
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
    if (beat.kind !== "narrated-scene") return [];
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

  const leadingSilentFrames =
    story.beats[0]?.kind === "silent-scene"
      ? story.beats[0].preset.durationInFrames
      : 0;
  const narrationStartFrame = toSafeNumber(
    BigInt(render.leadInFrames) + BigInt(leadingSilentFrames),
    "narrationStartFrame",
  );
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
      BigInt(narrationStartFrame) +
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
      BigInt(narrationStartFrame) +
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

  let beatFrameCursor = render.leadInFrames;
  const storyBeats = story.beats.map((beat) => {
    if (beat.kind === "visual-scene")
      throw new Error("Visual Stories cannot use PCM timing.");
    if (beat.kind === "silent-scene") {
      const startFrame = beatFrameCursor;
      beatFrameCursor = toSafeNumber(
        BigInt(beatFrameCursor) + BigInt(beat.preset.durationInFrames),
        `Silent Scene ${beat.meaningId} endFrame`,
      );
      return {
        kind: beat.kind,
        meaningId: beat.meaningId,
        presetFingerprint: beat.preset.presetFingerprint,
        presetDurationInFrames: beat.preset.durationInFrames,
        startFrame,
        endFrame: beatFrameCursor,
      };
    }
    const owned = timedSegments.filter(
      (segment) => segment.meaningId === beat.meaningId,
    );
    if (owned.length === 0)
      throw new Error(`StoryBeat ${beat.meaningId} has no timed segments.`);
    const timingBeat = {
      kind: beat.kind,
      meaningId: beat.meaningId,
      startFrame: owned[0].frameRange.startFrame,
      endFrame: owned[owned.length - 1].frameRange.endFrame,
    };
    if (timingBeat.startFrame !== beatFrameCursor) {
      throw new Error(`StoryBeat ${beat.meaningId} timing is not continuous.`);
    }
    beatFrameCursor = timingBeat.endFrame;
    return timingBeat;
  });

  return PcmSemanticTimingSchema.parse({
    schemaVersion: 3,
    algorithmId: TIMING_ALGORITHM_ID,
    storyId: story.storyId,
    fingerprint: computeSemanticTimingFingerprint(
      story,
      sealedNarration,
      render,
    ),
    sampleRate: sealedNarration.canonicalPcm.sampleRate,
    fps: render.fps,
    leadInFrames: render.leadInFrames,
    tailFrames: render.tailFrames,
    narrationStartFrame,
    durationInFrames: toSafeNumber(
      BigInt(beatFrameCursor) + BigInt(render.tailFrames),
      "durationInFrames",
    ),
    segments: timedSegments,
    captionCues,
    storyBeats,
  });
};

export const computeVisualSemanticTimingFingerprint = (
  story: StorySpec,
  render: RenderSpec,
) =>
  createFingerprint({
    namespace: "semantic-timing",
    version: 3,
    value: {
      algorithmId: VISUAL_TIMING_ALGORITHM_ID,
      storyFingerprint: computeStoryFingerprint(story),
      fps: render.fps,
      leadInFrames: render.leadInFrames,
      tailFrames: render.tailFrames,
    },
  });

/** Visual Scenes own authored frame durations; no PCM or speech is synthesized. */
export const generateVisualSemanticTiming = ({
  story: rawStory,
  render: rawRender,
}: {
  readonly story: StorySpec;
  readonly render: RenderSpec;
}): VisualSemanticTiming => {
  const story = StorySpecSchema.parse(rawStory);
  const render = RenderSpecSchema.parse(rawRender);
  if (!isVisualStory(story))
    throw new Error("Authored-frame timing requires a visual Story.");
  let cursor = render.leadInFrames;
  const storyBeats = story.beats.map((beat) => {
    if (beat.kind === "narrated-scene")
      throw new Error("Narrated and visual content Scenes cannot be mixed.");
    const duration =
      beat.kind === "visual-scene"
        ? beat.durationInFrames
        : beat.preset.durationInFrames;
    const startFrame = cursor;
    cursor = toSafeNumber(
      BigInt(cursor) + BigInt(duration),
      `Scene ${beat.meaningId} endFrame`,
    );
    return {
      kind: beat.kind,
      meaningId: beat.meaningId,
      ...(beat.kind === "visual-scene"
        ? { durationInFrames: duration }
        : {
            presetFingerprint: beat.preset.presetFingerprint,
            presetDurationInFrames: duration,
          }),
      startFrame,
      endFrame: cursor,
    };
  });
  return VisualSemanticTimingSchema.parse({
    schemaVersion: 3,
    algorithmId: VISUAL_TIMING_ALGORITHM_ID,
    storyId: story.storyId,
    fingerprint: computeVisualSemanticTimingFingerprint(story, render),
    sampleRate: null,
    fps: render.fps,
    leadInFrames: render.leadInFrames,
    tailFrames: render.tailFrames,
    narrationStartFrame: null,
    durationInFrames: toSafeNumber(
      BigInt(cursor) + BigInt(render.tailFrames),
      "durationInFrames",
    ),
    segments: [],
    captionCues: [],
    storyBeats,
  });
};

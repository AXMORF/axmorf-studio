import { z } from "zod";

import { createFingerprint } from "./fingerprint";
import {
  MeaningIdSchema,
  NonNegativeIntegerSchema,
  PositiveIntegerSchema,
  Sha256DigestSchema,
  StoryIdSchema,
  TtsChunkIdSchema,
} from "./primitives";
import { ResourceIdSchema } from "./resource-catalog";

const NonEmptyTextSchema = z.string().trim().min(1);
const StableSlugSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);

export const STORY_SPEC_SCHEMA_VERSION = 3 as const;

export const TTSChunkSchema = z
  .object({
    chunkId: TtsChunkIdSchema,
    ttsText: NonEmptyTextSchema,
  })
  .strict()
  .readonly();

export const ExplicitPauseSchema = z
  .object({
    afterChunkId: TtsChunkIdSchema,
    pauseMs: NonNegativeIntegerSchema,
  })
  .strict()
  .readonly();

const NarratedStoryBeatSchema = z
  .object({
    kind: z.literal("narrated-scene"),
    meaningId: MeaningIdSchema,
    narrativePurpose: NonEmptyTextSchema,
    ttsChunks: z.array(TTSChunkSchema).min(1).readonly(),
    explicitPauses: z.array(ExplicitPauseSchema).readonly(),
  })
  .strict()
  .superRefine((beat, context) => {
    const chunkOrder = new Map(
      beat.ttsChunks.map((chunk, index) => [chunk.chunkId, index]),
    );
    const ownedChunks = new Set(chunkOrder.keys());
    const pausedChunks = new Set<string>();
    let previousPauseChunkIndex = -1;

    beat.explicitPauses.forEach((pause, index) => {
      if (!ownedChunks.has(pause.afterChunkId)) {
        context.addIssue({
          code: "custom",
          message:
            "Explicit pause must follow a chunk owned by the same StoryBeat.",
          path: ["explicitPauses", index, "afterChunkId"],
        });
      }
      if (pausedChunks.has(pause.afterChunkId)) {
        context.addIssue({
          code: "custom",
          message: "A TTSChunk can have at most one explicit pause after it.",
          path: ["explicitPauses", index, "afterChunkId"],
        });
      }
      pausedChunks.add(pause.afterChunkId);
      const currentChunkIndex = chunkOrder.get(pause.afterChunkId);
      if (
        currentChunkIndex !== undefined &&
        currentChunkIndex <= previousPauseChunkIndex
      ) {
        context.addIssue({
          code: "custom",
          message: "Explicit pauses must follow TTSChunk order.",
          path: ["explicitPauses", index, "afterChunkId"],
        });
      }
      if (currentChunkIndex !== undefined)
        previousPauseChunkIndex = currentChunkIndex;
    });
  })
  .readonly();

export const TemplateSceneSoundCueSchema = z
  .object({
    cueId: StableSlugSchema,
    resourceId: ResourceIdSchema,
    anchorId: StableSlugSchema,
    offsetFrames: z.number().int().safe(),
    durationInFrames: PositiveIntegerSchema,
    volume: z.number().finite().min(0).max(1),
  })
  .strict()
  .readonly();

const SilentSceneImplementationSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("template-copy"),
      templateId: StableSlugSchema,
      templateFingerprint: Sha256DigestSchema,
      instanceFingerprint: Sha256DigestSchema,
      rendererSourceFingerprint: Sha256DigestSchema,
      soundCues: z
        .array(TemplateSceneSoundCueSchema)
        .max(16)
        .readonly(),
    })
    .strict()
    .readonly(),
  z
    .object({ kind: z.literal("scene-owner") })
    .strict()
    .readonly(),
]);

const SilentScenePresetInputSchema = z
  .object({
    schemaVersion: z.literal(3),
    presetId: StableSlugSchema,
    durationInFrames: PositiveIntegerSchema,
    visualIntent: NonEmptyTextSchema.max(1600),
    soundIntent: NonEmptyTextSchema.max(1600),
    resourceIds: z.array(ResourceIdSchema).max(128).readonly(),
    implementation: SilentSceneImplementationSchema,
  })
  .strict()
  .superRefine((preset, context) => {
    const sorted = [...preset.resourceIds].sort((left, right) =>
      left.localeCompare(right),
    );
    preset.resourceIds.forEach((resourceId, index) => {
      if (
        resourceId !== sorted[index] ||
        preset.resourceIds.indexOf(resourceId) !== index
      ) {
        context.addIssue({
          code: "custom",
          message: "Silent Scene preset resources must be unique and sorted.",
          path: ["resourceIds", index],
        });
      }
    });
    if (preset.implementation.kind === "template-copy") {
      const cueIds = new Set<string>();
      preset.implementation.soundCues.forEach((cue, index) => {
        if (cueIds.has(cue.cueId)) {
          context.addIssue({
            code: "custom",
            message: "Reusable Scene sound cue IDs must be unique.",
            path: ["implementation", "soundCues", index, "cueId"],
          });
        }
        cueIds.add(cue.cueId);
        if (!preset.resourceIds.includes(cue.resourceId)) {
          context.addIssue({
            code: "custom",
            message: "Reusable Scene sound cues must use preset resources.",
            path: ["implementation", "soundCues", index, "resourceId"],
          });
        }
        if (
          cue.offsetFrames < 0 ||
          cue.offsetFrames + cue.durationInFrames > preset.durationInFrames
        ) {
          context.addIssue({
            code: "custom",
            message: "Reusable Scene sound cue must fit its preset window.",
            path: ["implementation", "soundCues", index],
          });
        }
      });
    }
  });

export const computeSilentScenePresetFingerprint = (rawInput: unknown) => {
  const record = { ...(rawInput as Record<string, unknown>) };
  delete record.presetFingerprint;
  const input = SilentScenePresetInputSchema.parse(record);
  return createFingerprint({
    namespace: "silent-scene-preset",
    version: 3,
    value: input,
  });
};

export const SilentScenePresetSchema = SilentScenePresetInputSchema.extend({
  presetFingerprint: Sha256DigestSchema,
})
  .strict()
  .superRefine((preset, context) => {
    if (
      preset.presetFingerprint !== computeSilentScenePresetFingerprint(preset)
    ) {
      context.addIssue({
        code: "custom",
        message: "Silent Scene preset fingerprint is stale.",
        path: ["presetFingerprint"],
      });
    }
  })
  .readonly();

export const buildSilentScenePreset = (rawInput: {
  readonly presetId: unknown;
  readonly durationInFrames: unknown;
  readonly visualIntent: unknown;
  readonly soundIntent: unknown;
  readonly resourceIds: readonly unknown[];
  readonly implementation: unknown;
}) => {
  const input = SilentScenePresetInputSchema.parse({
    schemaVersion: 3,
    ...rawInput,
  });
  return SilentScenePresetSchema.parse({
    ...input,
    presetFingerprint: computeSilentScenePresetFingerprint(input),
  });
};

const SilentStoryBeatSchema = z
  .object({
    kind: z.literal("silent-scene"),
    meaningId: MeaningIdSchema,
    narrativePurpose: NonEmptyTextSchema,
    preset: SilentScenePresetSchema,
  })
  .strict()
  .readonly();

export const StoryBeatSchema = z.discriminatedUnion("kind", [
  NarratedStoryBeatSchema,
  SilentStoryBeatSchema,
]);

export const StorySpecSchema = z
  .object({
    schemaVersion: z.literal(STORY_SPEC_SCHEMA_VERSION),
    storyId: StoryIdSchema,
    title: NonEmptyTextSchema,
    beats: z.array(StoryBeatSchema).min(1).readonly(),
  })
  .strict()
  .superRefine((story, context) => {
    const meaningIds = new Set<string>();
    const chunkIds = new Set<string>();
    let narratedBeatCount = 0;

    story.beats.forEach((beat, beatIndex) => {
      if (meaningIds.has(beat.meaningId)) {
        context.addIssue({
          code: "custom",
          message: "meaningId must be globally unique within StorySpec.",
          path: ["beats", beatIndex, "meaningId"],
        });
      }
      meaningIds.add(beat.meaningId);

      if (beat.kind === "silent-scene") {
        if (beatIndex !== 0 && beatIndex !== story.beats.length - 1) {
          context.addIssue({
            code: "custom",
            message:
              "Silent Scenes must stay at a Story boundary.",
            path: ["beats", beatIndex],
          });
        }
        return;
      }

      narratedBeatCount += 1;
      beat.ttsChunks.forEach((chunk, chunkIndex) => {
        if (chunkIds.has(chunk.chunkId)) {
          context.addIssue({
            code: "custom",
            message: "chunkId must be globally unique within StorySpec.",
            path: ["beats", beatIndex, "ttsChunks", chunkIndex, "chunkId"],
          });
        }
        chunkIds.add(chunk.chunkId);
      });
    });
    if (narratedBeatCount === 0) {
      context.addIssue({
        code: "custom",
        message: "StorySpec requires at least one narrated content Scene.",
        path: ["beats"],
      });
    }
  })
  .readonly();

export type TTSChunk = z.infer<typeof TTSChunkSchema>;
export type ExplicitPause = z.infer<typeof ExplicitPauseSchema>;
export type SilentScenePreset = z.infer<typeof SilentScenePresetSchema>;
export type SilentSceneImplementation = z.infer<
  typeof SilentSceneImplementationSchema
>;
export type StoryBeat = z.infer<typeof StoryBeatSchema>;
export type StorySpec = z.infer<typeof StorySpecSchema>;

export const flattenTtsChunks = (story: StorySpec) =>
  story.beats.flatMap((beat) =>
    beat.kind === "narrated-scene"
      ? beat.ttsChunks.map((chunk) => ({
          chunkId: chunk.chunkId,
          meaningId: beat.meaningId,
          ttsText: chunk.ttsText,
        }))
      : [],
  );

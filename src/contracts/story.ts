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

export const STORY_SPEC_SCHEMA_VERSION = 2 as const;

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

const SilentScenePresetInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    sceneRole: z.enum(["intro", "outro"]),
    presetId: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
    durationInFrames: PositiveIntegerSchema,
    visualIntent: NonEmptyTextSchema.max(1600),
    soundIntent: NonEmptyTextSchema.max(1600),
    resourceIds: z.array(ResourceIdSchema).min(1).max(128).readonly(),
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
  });

export const computeSilentScenePresetFingerprint = (rawInput: unknown) => {
  const record = { ...(rawInput as Record<string, unknown>) };
  delete record.presetFingerprint;
  const input = SilentScenePresetInputSchema.parse(record);
  return createFingerprint({
    namespace: "silent-scene-preset",
    version: 1,
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
  readonly sceneRole: unknown;
  readonly presetId: unknown;
  readonly durationInFrames: unknown;
  readonly visualIntent: unknown;
  readonly soundIntent: unknown;
  readonly resourceIds: readonly unknown[];
}) => {
  const input = SilentScenePresetInputSchema.parse({
    schemaVersion: 1,
    ...rawInput,
  });
  return SilentScenePresetSchema.parse({
    ...input,
    presetFingerprint: computeSilentScenePresetFingerprint(input),
  });
};

export const DEFAULT_INTRO_SCENE_PRESET = buildSilentScenePreset({
  sceneRole: "intro",
  presetId: "axmorf-brand-intro-v1",
  durationInFrames: 60,
  visualIntent:
    "Reveal the AXMORF mark and wordmark as a concise Project-opening Scene.",
  soundIntent:
    "Play only the checksum-bound AXMORF intro chime as Scene-local SFX.",
  resourceIds: ["asset.axmorf-intro-chime"],
});

export const DEFAULT_OUTRO_SCENE_PRESET = buildSilentScenePreset({
  sceneRole: "outro",
  presetId: "axmorf-source-follow-outro-v1",
  durationInFrames: 240,
  visualIntent:
    "Show source credits then resolve to the AXMORF follow lockup as the closing Scene.",
  soundIntent:
    "Play only the checksum-bound AXMORF outro chime as Scene-local SFX.",
  resourceIds: ["asset.axmorf-outro-chime"],
});

const SilentStoryBeatSchema = z
  .object({
    kind: z.literal("silent-scene"),
    sceneRole: z.enum(["intro", "outro"]),
    meaningId: MeaningIdSchema,
    narrativePurpose: NonEmptyTextSchema,
    preset: SilentScenePresetSchema,
  })
  .strict()
  .superRefine((beat, context) => {
    if (beat.sceneRole !== beat.preset.sceneRole) {
      context.addIssue({
        code: "custom",
        message: "Silent Scene role must match its selected preset.",
        path: ["preset", "sceneRole"],
      });
    }
  })
  .readonly();

export const StoryBeatSchema = z.discriminatedUnion("kind", [
  NarratedStoryBeatSchema,
  SilentStoryBeatSchema,
]);

const StoryBookendSelectionSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("scene"), meaningId: MeaningIdSchema }).strict(),
  z.object({ mode: z.literal("disabled") }).strict(),
]);

export const StorySpecSchema = z
  .object({
    schemaVersion: z.literal(STORY_SPEC_SCHEMA_VERSION),
    storyId: StoryIdSchema,
    title: NonEmptyTextSchema,
    bookends: z
      .object({
        intro: StoryBookendSelectionSchema,
        outro: StoryBookendSelectionSchema,
      })
      .strict()
      .readonly(),
    beats: z.array(StoryBeatSchema).min(1).readonly(),
  })
  .strict()
  .superRefine((story, context) => {
    const meaningIds = new Set<string>();
    const chunkIds = new Set<string>();
    const silentRoles = new Set<string>();
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
        if (silentRoles.has(beat.sceneRole)) {
          context.addIssue({
            code: "custom",
            message: "StorySpec can contain at most one silent Scene per role.",
            path: ["beats", beatIndex, "sceneRole"],
          });
        }
        silentRoles.add(beat.sceneRole);
        if (
          (beat.sceneRole === "intro" && beatIndex !== 0) ||
          (beat.sceneRole === "outro" && beatIndex !== story.beats.length - 1)
        ) {
          context.addIssue({
            code: "custom",
            message: "Silent intro must be first and silent outro must be last.",
            path: ["beats", beatIndex, "sceneRole"],
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
    for (const sceneRole of ["intro", "outro"] as const) {
      const selection = story.bookends[sceneRole];
      const beat = story.beats.find(
        (candidate) =>
          candidate.kind === "silent-scene" &&
          candidate.sceneRole === sceneRole,
      );
      if (
        (selection.mode === "disabled" && beat !== undefined) ||
        (selection.mode === "scene" &&
          (beat === undefined || beat.meaningId !== selection.meaningId))
      ) {
        context.addIssue({
          code: "custom",
          message: `Story ${sceneRole} selection must exactly match its silent Scene.`,
          path: ["bookends", sceneRole],
        });
      }
    }
  })
  .readonly();

export type TTSChunk = z.infer<typeof TTSChunkSchema>;
export type ExplicitPause = z.infer<typeof ExplicitPauseSchema>;
export type SilentScenePreset = z.infer<typeof SilentScenePresetSchema>;
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

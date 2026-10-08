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

export const StoryTimingSourceSchema = z.enum([
  "sealed-narration",
  "authored-frames",
]);

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

const TemplateScenePlaybackRangeObject = z
  .object({
    startFrame: NonNegativeIntegerSchema,
    endFrame: PositiveIntegerSchema,
    musicVolume: z.number().finite().min(0).max(1).optional(),
    musicFadeInFrames: NonNegativeIntegerSchema.optional(),
    musicFadeOutFrames: NonNegativeIntegerSchema.optional(),
  })
  .strict();

const addPlaybackRangeIssues = (
  range: z.infer<typeof TemplateScenePlaybackRangeObject>,
  context: z.RefinementCtx,
) => {
  const duration = range.endFrame - range.startFrame;
  if (duration <= 0) {
    context.addIssue({
      code: "custom",
      message: "Template playback range must contain at least one frame.",
      path: ["endFrame"],
    });
  }
  for (const field of ["musicFadeInFrames", "musicFadeOutFrames"] as const) {
    if ((range[field] ?? 0) > duration) {
      context.addIssue({
        code: "custom",
        message: "Template music fades must fit the playback range.",
        path: [field],
      });
    }
  }
};

export const TemplateScenePlaybackRangeSchema =
  TemplateScenePlaybackRangeObject.superRefine(
    addPlaybackRangeIssues,
  ).readonly();

export const TemplateScenePlaybackWindowSchema =
  TemplateScenePlaybackRangeObject.extend({
    sourceDurationInFrames: PositiveIntegerSchema,
  })
    .superRefine((window, context) => {
      addPlaybackRangeIssues(window, context);
      if (window.endFrame > window.sourceDurationInFrames) {
        context.addIssue({
          code: "custom",
          message: "Template playback must stay inside its immutable source.",
          path: ["endFrame"],
        });
      }
    })
    .readonly();

export type TemplateScenePlaybackRange = z.infer<
  typeof TemplateScenePlaybackRangeSchema
>;

const SilentSceneImplementationSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("template-copy"),
      templateId: StableSlugSchema,
      templateFingerprint: Sha256DigestSchema,
      instanceFingerprint: Sha256DigestSchema,
      rendererSourceFingerprint: Sha256DigestSchema,
      soundCues: z.array(TemplateSceneSoundCueSchema).max(16).readonly(),
      playbackWindow: TemplateScenePlaybackWindowSchema.optional(),
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
      const window = preset.implementation.playbackWindow;
      if (
        window !== undefined &&
        preset.durationInFrames !== window.endFrame - window.startFrame
      ) {
        context.addIssue({
          code: "custom",
          message: "Template preset duration must equal its playback range.",
          path: ["durationInFrames"],
        });
      }
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
          cue.offsetFrames + cue.durationInFrames >
            (window?.sourceDurationInFrames ?? preset.durationInFrames)
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

export const VisualStoryBeatSchema = z
  .object({
    kind: z.literal("visual-scene"),
    meaningId: MeaningIdSchema,
    narrativePurpose: NonEmptyTextSchema,
    durationInFrames: PositiveIntegerSchema,
  })
  .strict()
  .readonly();

export const StoryBeatSchema = z.discriminatedUnion("kind", [
  NarratedStoryBeatSchema,
  VisualStoryBeatSchema,
  SilentStoryBeatSchema,
]);

export const FilmPlanSchema = z
  .object({
    concept: NonEmptyTextSchema.max(1600),
    subject: NonEmptyTextSchema.max(1600),
    cameraIntent: NonEmptyTextSchema.max(1600),
    rhythmIntent: NonEmptyTextSchema.max(1600),
    soundIntent: NonEmptyTextSchema.max(1600),
  })
  .strict()
  .readonly();

export const StoryVisualAuthoringShape = {
  filmPlan: FilmPlanSchema.optional(),
  visualScenes: z
    .array(
      z
        .object({
          meaningIds: z.array(MeaningIdSchema).min(1).max(256).readonly(),
        })
        .strict()
        .readonly(),
    )
    .min(1)
    .max(256)
    .readonly()
    .optional(),
} as const;

export const addStoryVisualOwnershipIssues = (
  story: {
    readonly timingSource?: string;
    readonly beats: readonly {
      readonly kind: string;
      readonly meaningId: string;
      readonly preset?: { readonly implementation: { readonly kind: string } };
    }[];
    readonly visualScenes?: readonly {
      readonly meaningIds: readonly string[];
    }[];
  },
  context: z.RefinementCtx,
) => {
  if (story.visualScenes === undefined) return;
  const content = story.beats
    .filter(
      (beat) =>
        beat.kind === "narrated-scene" ||
        beat.kind === "visual-scene" ||
        (story.timingSource === "authored-frames" &&
          beat.preset?.implementation.kind === "scene-owner"),
    )
    .map((beat) => beat.meaningId);
  const claimed = story.visualScenes.flatMap((scene) => scene.meaningIds);
  if (
    claimed.length !== content.length ||
    claimed.some((id, index) => id !== content[index])
  ) {
    context.addIssue({
      code: "custom",
      message:
        "Visual Scenes must cover content StoryBeats exactly once in consecutive Story order.",
      path: ["visualScenes"],
    });
  }
};

export const StorySpecSchema = z
  .object({
    schemaVersion: z.literal(STORY_SPEC_SCHEMA_VERSION),
    storyId: StoryIdSchema,
    title: NonEmptyTextSchema,
    timingSource: StoryTimingSourceSchema.optional(),
    beats: z.array(StoryBeatSchema).min(1).readonly(),
    ...StoryVisualAuthoringShape,
  })
  .strict()
  .superRefine((story, context) => {
    addStoryVisualOwnershipIssues(story, context);
    const meaningIds = new Set<string>();
    const chunkIds = new Set<string>();
    let narratedBeatCount = 0;
    let visualContentBeatCount = 0;
    const authoredFrames = story.timingSource === "authored-frames";
    let visualBeatCount = 0;

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
        if (beat.preset.implementation.kind === "scene-owner")
          visualContentBeatCount += 1;
        if (
          (!authoredFrames ||
            beat.preset.implementation.kind === "template-copy") &&
          beatIndex !== 0 &&
          beatIndex !== story.beats.length - 1
        ) {
          context.addIssue({
            code: "custom",
            message: "Silent Scenes must stay at a Story boundary.",
            path: ["beats", beatIndex],
          });
        }
        return;
      }

      if (beat.kind === "visual-scene") {
        visualBeatCount += 1;
        return;
      }

      narratedBeatCount += 1;
      if (authoredFrames) {
        context.addIssue({
          code: "custom",
          message: "Authored-frame Stories cannot contain narrated Beats.",
          path: ["beats", beatIndex],
        });
      }
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
    if (!authoredFrames && narratedBeatCount + visualBeatCount === 0) {
      context.addIssue({
        code: "custom",
        message:
          "StorySpec requires at least one narrated or visual content Scene.",
        path: ["beats"],
      });
    }
    if (narratedBeatCount > 0 && visualBeatCount > 0) {
      context.addIssue({
        code: "custom",
        message:
          "Narrated and visual content Scenes cannot be mixed in one Story; choose one timing authority.",
        path: ["beats"],
      });
    }
    if (authoredFrames && visualBeatCount > 0) {
      context.addIssue({
        code: "custom",
        message:
          "Explicit authored-frame Stories use scene-owner presets, not visual-scene Beats.",
        path: ["beats"],
      });
    }
    if (story.timingSource === "sealed-narration" && visualBeatCount > 0) {
      context.addIssue({
        code: "custom",
        message: "Sealed narration timing cannot contain visual-scene Beats.",
        path: ["timingSource"],
      });
    }
    if (authoredFrames && visualContentBeatCount === 0) {
      context.addIssue({
        code: "custom",
        message:
          "Authored-frame Stories require at least one scene-owner visual content Beat.",
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
export type StoryTimingSource = z.infer<typeof StoryTimingSourceSchema>;

export const isSceneOwnerBeat = (
  beat:
    | Readonly<{
        kind: string;
        preset?: { readonly implementation: { readonly kind: string } };
      }>
    | undefined,
) =>
  beat?.kind === "narrated-scene" ||
  beat?.kind === "visual-scene" ||
  (beat?.kind === "silent-scene" &&
    beat.preset?.implementation.kind === "scene-owner");

export const resolveStorySceneGroups = (
  story: Pick<StorySpec, "beats" | "visualScenes">,
) => {
  const groups = new Map(
    story.visualScenes?.map((scene) => [
      scene.meaningIds[0],
      scene.meaningIds,
    ]) ?? [],
  );
  const claimed = new Set(
    story.visualScenes?.flatMap((scene) => scene.meaningIds) ?? [],
  );
  const byId = new Map(story.beats.map((beat) => [beat.meaningId, beat]));
  return story.beats.flatMap((beat) => {
    const ids = groups.get(beat.meaningId);
    if (ids !== undefined)
      return [
        {
          meaningId: beat.meaningId,
          beats: ids.map((id) => {
            const member = byId.get(id);
            if (member === undefined)
              throw new Error("Visual Scene contains an unknown StoryBeat.");
            return member;
          }),
        },
      ];
    return claimed.has(beat.meaningId)
      ? []
      : [{ meaningId: beat.meaningId, beats: [beat] }];
  });
};

export const aggregateSceneTimingBeat = <
  T extends readonly {
    readonly kind: string;
    readonly meaningId: string;
    readonly startFrame: number;
    readonly endFrame: number;
  }[],
>(
  timings: T,
  meaningIds: readonly string[],
  storyBeat?: StoryBeat,
): T[number] => {
  const members = meaningIds.map((id) => {
    const beat = timings.find((item) => item.meaningId === id);
    if (beat === undefined)
      throw new Error("Visual Scene timing is incomplete.");
    return beat;
  });
  if (
    members.length === 0 ||
    members.some(
      (beat, index) =>
        index > 0 &&
        (beat.startFrame !== members[index - 1].endFrame ||
          beat.kind !== members[0].kind),
    )
  )
    throw new Error(
      "Visual Scene timing must be contiguous with one timing source.",
    );
  if (members.length > 1 && members[0].kind === "silent-scene") {
    if (storyBeat?.kind !== "silent-scene")
      throw new Error(
        "Authored Scene timing requires its aggregated StoryBeat.",
      );
    return Object.assign({}, members[0], {
      endFrame: members.at(-1)!.endFrame,
      presetFingerprint: storyBeat.preset.presetFingerprint,
      presetDurationInFrames: storyBeat.preset.durationInFrames,
    });
  }
  if (members.length > 1 && members[0].kind === "visual-scene") {
    return Object.assign({}, members[0], {
      endFrame: members.at(-1)!.endFrame,
      durationInFrames: members.at(-1)!.endFrame - members[0].startFrame,
    });
  }
  return { ...members[0], endFrame: members.at(-1)!.endFrame };
};

export const aggregateSceneStoryBeat = (
  beats: readonly StoryBeat[],
): StoryBeat => {
  if (beats.length === 0)
    throw new Error("Visual Scene has no owned StoryBeat.");
  if (beats.length === 1) return beats[0];
  const first = beats[0];
  if (
    first.kind === "silent-scene" &&
    first.preset.implementation.kind === "scene-owner" &&
    beats.every(
      (beat) =>
        beat.kind === "silent-scene" &&
        beat.preset.implementation.kind === "scene-owner",
    )
  ) {
    const presets = beats.flatMap((beat) =>
      beat.kind === "silent-scene" ? [beat.preset] : [],
    );
    return {
      ...first,
      preset: buildSilentScenePreset({
        presetId: first.preset.presetId,
        durationInFrames: presets.reduce(
          (sum, preset) => sum + preset.durationInFrames,
          0,
        ),
        visualIntent: first.preset.visualIntent,
        soundIntent: first.preset.soundIntent,
        resourceIds: [
          ...new Set(presets.flatMap((preset) => preset.resourceIds)),
        ].sort(),
        implementation: first.preset.implementation,
      }),
    };
  }
  if (
    first.kind === "visual-scene" &&
    beats.every((beat) => beat.kind === "visual-scene")
  ) {
    return {
      ...first,
      durationInFrames: beats.reduce(
        (sum, beat) =>
          sum + (beat.kind === "visual-scene" ? beat.durationInFrames : 0),
        0,
      ),
    };
  }
  if (
    first.kind !== "narrated-scene" ||
    beats.some((beat) => beat.kind !== "narrated-scene")
  )
    throw new Error(
      "Only content Beats with the same timing source can share a visual Scene.",
    );
  return {
    ...first,
    ttsChunks: beats.flatMap((beat) =>
      beat.kind === "narrated-scene" ? beat.ttsChunks : [],
    ),
    explicitPauses: beats.flatMap((beat) =>
      beat.kind === "narrated-scene" ? beat.explicitPauses : [],
    ),
  };
};
export type VisualStoryBeat = z.infer<typeof VisualStoryBeatSchema>;

export const isVisualStory = (story: Pick<StorySpec, "beats">): boolean =>
  story.beats.some((beat) => beat.kind === "visual-scene");

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

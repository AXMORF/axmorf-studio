import { z } from "zod";

import { AuthoringRequirementSchema } from "./authoring-requirements";
import { SceneProductionBriefItemSchema } from "./authoring-briefs";
import { VideoBriefSchema } from "./brief";
import { createFingerprint } from "./fingerprint";
import { MeaningIdSchema, StoryIdSchema, TtsChunkIdSchema } from "./primitives";
import { AuthoredPublishingIntentSchema } from "./publishing-intent";
import { ResourceIdSchema } from "./resource-catalog";
import { SceneTemplateIdSchema } from "./scene-template";
import { StyleProfileIdSchema } from "./scene-primitives";
import {
  ExplicitPauseSchema,
  STORY_SPEC_SCHEMA_VERSION,
  TTSChunkSchema,
} from "./story";
import { VisualStyleArtDirectionSchema } from "./visual-style";
import { VisualThemeSelectionSchema } from "./visual-theme";

export const PROJECT_CREATE_INPUT_VERSION = "project-create-input-v1" as const;
export const PENDING_SCENE_AUTHORING_VERSION =
  "pending-scene-authoring-v1" as const;

const NonEmptyTextSchema = z.string().trim().min(1);
const SafeAuthoredTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(1600)
  .refine(
    (value) =>
      !/(?:Bearer\s|(?:^|\s)\/(?:home|data|tmp)\/|[A-Za-z]:\\|\b(?:token|secret|private[-_ ]?config|provider[-_ ]?endpoint)\b)/iu.test(
        value,
      ),
    "Project create authored text must not contain private diagnostics.",
  );

const uniqueSorted = (
  values: readonly string[],
  context: z.RefinementCtx,
  path: PropertyKey,
) => {
  const sorted = [...values].sort((left, right) => left.localeCompare(right));
  if (
    new Set(values).size !== values.length ||
    values.some((value, index) => value !== sorted[index])
  ) {
    context.addIssue({
      code: "custom",
      message: "Project create identity lists must be unique and sorted.",
      path: [path],
    });
  }
};

export const ProjectCreateNarratedBeatSchema = z
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
      beat.ttsChunks.map(({ chunkId }, index) => [chunkId, index]),
    );
    if (chunkOrder.size !== beat.ttsChunks.length) {
      context.addIssue({
        code: "custom",
        message: "Project create TTS chunk IDs must be unique.",
        path: ["ttsChunks"],
      });
    }
    const paused = new Set<string>();
    let previousIndex = -1;
    beat.explicitPauses.forEach((pause, index) => {
      const currentIndex = chunkOrder.get(pause.afterChunkId);
      if (
        currentIndex === undefined ||
        paused.has(pause.afterChunkId) ||
        currentIndex <= previousIndex
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Project create pauses must uniquely follow owned TTS chunks in order.",
          path: ["explicitPauses", index],
        });
      }
      paused.add(pause.afterChunkId);
      if (currentIndex !== undefined) previousIndex = currentIndex;
    });
  })
  .readonly();

export const ProjectCreateStorySchema = z
  .object({
    schemaVersion: z.literal(STORY_SPEC_SCHEMA_VERSION),
    storyId: StoryIdSchema,
    title: NonEmptyTextSchema,
    beats: z.array(ProjectCreateNarratedBeatSchema).min(1).max(256).readonly(),
  })
  .strict()
  .superRefine((story, context) => {
    const meaningIds = story.beats.map(({ meaningId }) => meaningId);
    const chunkIds = story.beats.flatMap(({ ttsChunks }) =>
      ttsChunks.map(({ chunkId }) => chunkId),
    );
    if (new Set(meaningIds).size !== meaningIds.length) {
      context.addIssue({
        code: "custom",
        message: "Project create meaning IDs must be globally unique.",
        path: ["beats"],
      });
    }
    if (new Set(chunkIds).size !== chunkIds.length) {
      context.addIssue({
        code: "custom",
        message: "Project create TTS chunk IDs must be globally unique.",
        path: ["beats"],
      });
    }
  })
  .readonly();

export const ProjectCreateVisualStyleSchema = z
  .object({
    styleProfileId: StyleProfileIdSchema,
    artDirection: VisualStyleArtDirectionSchema,
    theme: VisualThemeSelectionSchema.optional(),
    continuityRules: z
      .array(SafeAuthoredTextSchema.max(512))
      .max(32)
      .readonly(),
    forbiddenTreatments: z
      .array(SafeAuthoredTextSchema.max(512))
      .max(32)
      .readonly(),
  })
  .strict()
  .superRefine((style, context) => {
    for (const field of ["continuityRules", "forbiddenTreatments"] as const) {
      if (new Set(style[field]).size !== style[field].length) {
        context.addIssue({
          code: "custom",
          message: "Project create visual style rules must be unique.",
          path: [field],
        });
      }
    }
  })
  .readonly();

const SnapshotSelectionSchema = z
  .object({
    sourceId: z.literal("video-shotcraft"),
    allowedCardIds: z
      .array(
        z
          .string()
          .min(1)
          .max(128)
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
      )
      .min(1)
      .max(128)
      .readonly(),
  })
  .strict()
  .superRefine((selection, context) =>
    uniqueSorted(selection.allowedCardIds, context, "allowedCardIds"),
  )
  .readonly();

const ResourceSelectionsSchema = z
  .object({
    allowedResourceIds: z.array(ResourceIdSchema).max(256).readonly(),
    allowedSnapshots: z.array(SnapshotSelectionSchema).max(16).readonly(),
  })
  .strict()
  .superRefine((resources, context) => {
    uniqueSorted(resources.allowedResourceIds, context, "allowedResourceIds");
    const sourceIds = resources.allowedSnapshots.map(
      ({ sourceId }) => sourceId,
    );
    uniqueSorted(sourceIds, context, "allowedSnapshots");
  })
  .readonly();

export const ProjectCreateGlobalVisualSchema = z
  .object({
    visualIntent: z
      .array(
        z
          .object({
            intentId: z
              .string()
              .min(1)
              .max(96)
              .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
            description: SafeAuthoredTextSchema,
            appliesTo: z.enum(["full-composition", "frozen-frame-windows"]),
          })
          .strict()
          .readonly(),
      )
      .min(1)
      .max(64)
      .readonly(),
  })
  .strict()
  .superRefine((brief, context) => {
    if (
      new Set(brief.visualIntent.map(({ intentId }) => intentId)).size !==
      brief.visualIntent.length
    ) {
      context.addIssue({
        code: "custom",
        message: "Global visual intent IDs must be unique.",
        path: ["visualIntent"],
      });
    }
  })
  .readonly();

const RenderChoicesSchema = z
  .object({
    compositionId: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/u),
    leadInFrames: z.number().int().nonnegative().safe(),
    tailFrames: z.number().int().nonnegative().safe(),
    audioChannels: z.union([z.literal(1), z.literal(2)]),
  })
  .strict()
  .readonly();

const ProductionChoicesSchema = z
  .object({
    enhancementSelection: z
      .object({
        storyVisual: z.literal("required"),
        sound: z.enum(["allowed", "none"]),
        globalVisual: z.literal("required"),
      })
      .strict()
      .readonly(),
    resourcePolicy: z
      .object({
        selfAuthoredVisualsAllowed: z.literal(true),
        unlistedThirdPartyResources: z.literal("deny"),
      })
      .strict()
      .readonly(),
    additionalRequirements: z
      .array(AuthoringRequirementSchema)
      .max(256)
      .readonly(),
  })
  .strict()
  .readonly();

const SceneTemplateSelectionsSchema = z
  .object({
    introSceneTemplateId: SceneTemplateIdSchema.nullable(),
    outroSceneTemplateId: SceneTemplateIdSchema.nullable(),
  })
  .strict()
  .readonly();

const ProjectCreateInputObject = z.object({
  schemaVersion: z.literal(1),
  contractVersion: z.literal(PROJECT_CREATE_INPUT_VERSION),
  storyId: StoryIdSchema,
  brief: VideoBriefSchema,
  story: ProjectCreateStorySchema,
  visualStyle: ProjectCreateVisualStyleSchema,
  resources: ResourceSelectionsSchema,
  scenes: z.array(SceneProductionBriefItemSchema).min(1).max(256).readonly(),
  globalVisual: ProjectCreateGlobalVisualSchema,
  render: RenderChoicesSchema,
  publishing: AuthoredPublishingIntentSchema,
  production: ProductionChoicesSchema,
  sceneTemplates: SceneTemplateSelectionsSchema.optional(),
});

export const ProjectCreateInputSchema = ProjectCreateInputObject.strict()
  .superRefine((input, context) => {
    if (
      input.brief.storyId !== input.storyId ||
      input.story.storyId !== input.storyId
    ) {
      context.addIssue({
        code: "custom",
        message: "Project create input must belong to one Story.",
        path: ["storyId"],
      });
    }
    if (
      input.scenes.length !== input.story.beats.length ||
      input.scenes.some(
        ({ meaningId }, index) =>
          meaningId !== input.story.beats[index]?.meaningId,
      )
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Project create Scene authoring must cover StoryBeats in order.",
        path: ["scenes"],
      });
    }
    const allowedResources = new Set(input.resources.allowedResourceIds);
    const snapshots = new Map(
      input.resources.allowedSnapshots.map((snapshot) => [
        snapshot.sourceId,
        new Set(snapshot.allowedCardIds),
      ]),
    );
    input.scenes.forEach((scene, sceneIndex) => {
      scene.candidateResourceIds.forEach((resourceId) => {
        if (!allowedResources.has(resourceId)) {
          context.addIssue({
            code: "custom",
            message: "Scene resources must be selected in the Story pool.",
            path: ["scenes", sceneIndex, "candidateResourceIds"],
          });
        }
      });
      scene.allowedSnapshotCards.forEach((selection) => {
        const allowedCards = snapshots.get(selection.sourceId);
        if (
          allowedCards === undefined ||
          selection.cardIds.some((cardId) => !allowedCards.has(cardId))
        ) {
          context.addIssue({
            code: "custom",
            message: "Scene snapshots must be selected in the Story pool.",
            path: ["scenes", sceneIndex, "allowedSnapshotCards"],
          });
        }
      });
    });
  })
  .readonly();

export const computeProjectCreateInputFingerprint = (rawInput: unknown) =>
  createFingerprint({
    namespace: "project-create-input",
    version: 1,
    value: ProjectCreateInputSchema.parse(rawInput),
  });

const PendingSceneAuthoringInputObject = z.object({
  schemaVersion: z.literal(1),
  contractVersion: z.literal(PENDING_SCENE_AUTHORING_VERSION),
  storyId: StoryIdSchema,
  scenes: z.array(SceneProductionBriefItemSchema).min(1).max(256).readonly(),
});

export const PendingSceneAuthoringInputSchema =
  PendingSceneAuthoringInputObject.strict().readonly();

export const computePendingSceneAuthoringFingerprint = (rawInput: unknown) => {
  const record = { ...(rawInput as Record<string, unknown>) };
  delete record.authoringFingerprint;
  return createFingerprint({
    namespace: "pending-scene-authoring",
    version: 1,
    value: PendingSceneAuthoringInputSchema.parse(record),
  });
};

export const PendingSceneAuthoringSchema =
  PendingSceneAuthoringInputObject.extend({
    authoringFingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
  })
    .strict()
    .superRefine((input, context) => {
      if (
        input.authoringFingerprint !==
        computePendingSceneAuthoringFingerprint(input)
      ) {
        context.addIssue({
          code: "custom",
          message: "Pending Scene authoring fingerprint is stale.",
          path: ["authoringFingerprint"],
        });
      }
    })
    .readonly();

export const buildPendingSceneAuthoring = (rawInput: unknown) => {
  const input = PendingSceneAuthoringInputSchema.parse(rawInput);
  return PendingSceneAuthoringSchema.parse({
    ...input,
    authoringFingerprint: computePendingSceneAuthoringFingerprint(input),
  });
};

export type ProjectCreateInput = z.infer<typeof ProjectCreateInputSchema>;
export type PendingSceneAuthoring = z.infer<typeof PendingSceneAuthoringSchema>;
export type ProjectCreateNarratedBeat = z.infer<
  typeof ProjectCreateNarratedBeatSchema
>;
export type ProjectCreateTtsChunkId = z.infer<typeof TtsChunkIdSchema>;

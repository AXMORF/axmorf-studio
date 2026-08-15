import { z } from "zod";

import { VideoSourceReferencesSchema } from "./brief";
import { createFingerprint } from "./fingerprint";
import { ExternalRepositoryPathSchema } from "./external-reference";
import {
  MeaningIdSchema,
  Sha256DigestSchema,
  StoryIdSchema,
} from "./primitives";
import { ProductionReadabilityPolicySchema } from "./production-readability";
import { SCENE_COMPOSITION_BOUNDARY_VERSION } from "./production-requirements";
import { ResourceIdSchema } from "./resource-catalog";
import { StoryBeatSchema } from "./story";

const TimingRangeShape = {
  meaningId: MeaningIdSchema,
  startFrame: z.number().int().nonnegative().safe(),
  endFrame: z.number().int().positive().safe(),
} as const;

const NarratedTimingBeatSchema = z
  .object({ kind: z.literal("narrated-scene"), ...TimingRangeShape })
  .strict()
  .refine((beat) => beat.endFrame > beat.startFrame, {
    message: "Scene timing Beat range must be non-empty.",
    path: ["endFrame"],
  })
  .readonly();

const SilentTimingBeatSchema = z
  .object({
    kind: z.literal("silent-scene"),
    presetFingerprint: Sha256DigestSchema,
    presetDurationInFrames: z.number().int().positive().safe(),
    ...TimingRangeShape,
  })
  .strict()
  .refine((beat) => beat.endFrame > beat.startFrame, {
    message: "Scene timing Beat range must be non-empty.",
    path: ["endFrame"],
  })
  .readonly();

const TimingBeatSchema = z.discriminatedUnion("kind", [
  NarratedTimingBeatSchema,
  SilentTimingBeatSchema,
]);

const AllowedSnapshotSchema = z
  .object({
    sourceId: z.literal("video-shotcraft"),
    snapshotFingerprint: Sha256DigestSchema,
    allowedCardIds: z
      .array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u))
      .min(1)
      .readonly(),
  })
  .strict()
  .readonly();

const ContinuityBriefSchema = z
  .object({
    previousMeaningId: MeaningIdSchema.nullable(),
    previousSummary: z.string().trim().min(1).max(1000).nullable(),
    nextMeaningId: MeaningIdSchema.nullable(),
    nextSummary: z.string().trim().min(1).max(1000).nullable(),
    continuityBrief: z.string().trim().min(1).max(1600),
  })
  .strict()
  .superRefine((continuity, context) => {
    if (
      (continuity.previousMeaningId === null) !==
        (continuity.previousSummary === null) ||
      (continuity.nextMeaningId === null) !== (continuity.nextSummary === null)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Adjacent meaning IDs and summaries must be declared together.",
      });
    }
  })
  .readonly();

const SceneAllowedDirectoriesSchema = z
  .object({
    sceneRoot: ExternalRepositoryPathSchema,
    publicAssetRoot: ExternalRepositoryPathSchema,
  })
  .strict()
  .readonly();

const SceneTaskInputObject = z
  .object({
    schemaVersion: z.literal(5),
    storyId: StoryIdSchema,
    meaningId: MeaningIdSchema,
    storyBeat: StoryBeatSchema,
    sourceReferences: VideoSourceReferencesSchema,
    timingBeat: TimingBeatSchema,
    storyFingerprint: Sha256DigestSchema,
    semanticTimingFingerprint: Sha256DigestSchema,
    renderFingerprint: Sha256DigestSchema,
    visualStyleFingerprint: Sha256DigestSchema,
    resourceCatalogFingerprint: Sha256DigestSchema,
    allowedSnapshots: z.array(AllowedSnapshotSchema).max(8).readonly(),
    allowedResourceIds: z.array(ResourceIdSchema).max(128).readonly(),
    continuity: ContinuityBriefSchema,
    allowedDirectories: SceneAllowedDirectoriesSchema,
    readabilityPolicy: ProductionReadabilityPolicySchema,
    sceneCompositionBoundaryVersion: z.literal(
      SCENE_COMPOSITION_BOUNDARY_VERSION,
    ),
    taskInputFingerprint: Sha256DigestSchema,
  })
  .strict();

type SceneTaskFingerprintInput = Omit<
  z.input<typeof SceneTaskInputObject>,
  "schemaVersion" | "taskInputFingerprint"
> & { readonly schemaVersion?: 5 };

export const computeSceneTaskInputFingerprint = (
  rawTask: SceneTaskFingerprintInput & {
    readonly taskInputFingerprint?: unknown;
  },
) => {
  const task = { ...rawTask } as Record<string, unknown>;
  delete task.taskInputFingerprint;
  return createFingerprint({
    namespace: "scene-task-input",
    version: 5,
    value: task,
  });
};

const addSceneTaskIssues = (
  task: z.infer<typeof SceneTaskInputObject>,
  context: z.RefinementCtx,
) => {
  if (
    task.storyBeat.meaningId !== task.meaningId ||
    task.timingBeat.meaningId !== task.meaningId ||
    task.storyBeat.kind !== task.timingBeat.kind
  ) {
    context.addIssue({
      code: "custom",
      message: "Scene task StoryBeat and timing must own one Scene identity.",
      path: ["meaningId"],
    });
  }
  if (
    task.storyBeat.kind === "silent-scene" &&
    (task.timingBeat.kind !== "silent-scene" ||
      task.storyBeat.preset.presetFingerprint !==
        task.timingBeat.presetFingerprint ||
      task.storyBeat.preset.durationInFrames !==
        task.timingBeat.presetDurationInFrames ||
      task.timingBeat.endFrame - task.timingBeat.startFrame !==
        task.storyBeat.preset.durationInFrames)
  ) {
    context.addIssue({
      code: "custom",
      message: "Silent Scene task preset timing identity is stale.",
      path: ["timingBeat"],
    });
  }
  const expectedSceneRoot = `src/projects/${task.storyId}/scenes/${task.meaningId}`;
  const expectedAssetRoots = [
    `public/projects/${task.storyId}/scenes/${task.meaningId}`,
    `public/assets/library/${task.storyId}/${task.meaningId}`,
  ];
  if (
    task.allowedDirectories.sceneRoot !== expectedSceneRoot ||
    !expectedAssetRoots.includes(task.allowedDirectories.publicAssetRoot)
  ) {
    context.addIssue({
      code: "custom",
      message: "Scene task output directories must be exact and meaning-local.",
      path: ["allowedDirectories"],
    });
  }
  if (
    new Set(task.allowedResourceIds).size !== task.allowedResourceIds.length ||
    new Set(task.allowedSnapshots.map((snapshot) => snapshot.sourceId)).size !==
      task.allowedSnapshots.length
  ) {
    context.addIssue({
      code: "custom",
      message: "Scene task allowlists must contain unique identities.",
    });
  }
  if (
    task.storyBeat.kind === "silent-scene" &&
    JSON.stringify(task.allowedResourceIds) !==
      JSON.stringify(task.storyBeat.preset.resourceIds)
  ) {
    context.addIssue({
      code: "custom",
      message: "Silent Scene task resources must equal its preset resources.",
      path: ["allowedResourceIds"],
    });
  }
  if (task.taskInputFingerprint !== computeSceneTaskInputFingerprint(task)) {
    context.addIssue({
      code: "custom",
      message: "Scene task input fingerprint is stale.",
      path: ["taskInputFingerprint"],
    });
  }
};

export const SceneTaskInputSchema =
  SceneTaskInputObject.superRefine(addSceneTaskIssues).readonly();

export const buildSceneTaskInputV5 = (rawInput: SceneTaskFingerprintInput) => {
  const input = { ...rawInput, schemaVersion: 5 as const };
  return SceneTaskInputSchema.parse({
    ...input,
    taskInputFingerprint: computeSceneTaskInputFingerprint(input),
  });
};

export type SceneTaskInput = z.infer<typeof SceneTaskInputSchema>;

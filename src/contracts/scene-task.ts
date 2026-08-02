import { z } from "zod";

import { createFingerprint } from "./fingerprint";
import { ExternalRepositoryPathSchema } from "./external-reference";
import {
  MeaningIdSchema,
  Sha256DigestSchema,
  StoryIdSchema,
} from "./primitives";
import { ResourceIdSchema } from "./resource-catalog";
import { StoryBeatSchema } from "./story";

const TimingBeatSchema = z
  .object({
    meaningId: MeaningIdSchema,
    startFrame: z.number().int().nonnegative().safe(),
    endFrame: z.number().int().positive().safe(),
  })
  .strict()
  .refine((beat) => beat.endFrame > beat.startFrame, {
    message: "Scene timing Beat range must be non-empty.",
    path: ["endFrame"],
  })
  .readonly();

const AllowedSnapshotSchema = z
  .object({
    sourceId: z.literal("video-shotcraft"),
    snapshotFingerprint: Sha256DigestSchema,
    allowedCardIds: z
      .array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/))
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

const SceneTaskInputObjectSchema = z
  .object({
    schemaVersion: z.literal(1),
    storyId: StoryIdSchema,
    meaningId: MeaningIdSchema,
    storyBeat: StoryBeatSchema,
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
    taskInputFingerprint: Sha256DigestSchema,
  })
  .strict();

type SceneTaskFingerprintInput = Omit<
  z.input<typeof SceneTaskInputObjectSchema>,
  "schemaVersion" | "taskInputFingerprint"
> & { readonly schemaVersion?: 1 };

export const computeSceneTaskInputFingerprint = (
  rawTask: SceneTaskFingerprintInput & {
    readonly taskInputFingerprint?: unknown;
  },
) => {
  const task = { ...rawTask } as Record<string, unknown>;
  delete task.taskInputFingerprint;
  return createFingerprint({
    namespace: "scene-task-input",
    version: 1,
    value: task,
  });
};

export const SceneTaskInputSchema = SceneTaskInputObjectSchema.superRefine(
  (task, context) => {
    if (
      task.storyBeat.meaningId !== task.meaningId ||
      task.timingBeat.meaningId !== task.meaningId
    ) {
      context.addIssue({
        code: "custom",
        message: "Scene task StoryBeat and timing must own the same meaningId.",
        path: ["meaningId"],
      });
    }
    const expectedSceneRoot = `src/projects/${task.storyId}/scenes/${task.meaningId}`;
    const expectedAssetRoot = `public/assets/library/${task.storyId}/${task.meaningId}`;
    if (
      task.allowedDirectories.sceneRoot !== expectedSceneRoot ||
      task.allowedDirectories.publicAssetRoot !== expectedAssetRoot
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Scene task output directories must be exact and meaning-local.",
        path: ["allowedDirectories"],
      });
    }
    if (
      new Set(task.allowedResourceIds).size !==
        task.allowedResourceIds.length ||
      new Set(task.allowedSnapshots.map((snapshot) => snapshot.sourceId))
        .size !== task.allowedSnapshots.length
    ) {
      context.addIssue({
        code: "custom",
        message: "Scene task allowlists must contain unique identities.",
      });
    }
    if (task.taskInputFingerprint !== computeSceneTaskInputFingerprint(task)) {
      context.addIssue({
        code: "custom",
        message: "Scene task input fingerprint is stale.",
        path: ["taskInputFingerprint"],
      });
    }
  },
).readonly();

export const buildSceneTaskInput = (rawInput: SceneTaskFingerprintInput) => {
  const input = {
    ...rawInput,
    schemaVersion: 1 as const,
  };
  return SceneTaskInputSchema.parse({
    ...input,
    taskInputFingerprint: computeSceneTaskInputFingerprint(input),
  });
};

export type SceneTaskInput = z.infer<typeof SceneTaskInputSchema>;

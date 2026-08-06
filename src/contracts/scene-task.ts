import { z } from "zod";

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

const SceneTaskInputV1Object = z
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

const SceneTaskInputV2Object = SceneTaskInputV1Object.extend({
  schemaVersion: z.literal(2),
  readabilityPolicy: ProductionReadabilityPolicySchema,
}).strict();
const SceneTaskInputV3Object = SceneTaskInputV2Object.extend({
  schemaVersion: z.literal(3),
  sceneCompositionBoundaryVersion: z.literal(
    SCENE_COMPOSITION_BOUNDARY_VERSION,
  ),
}).strict();

type SceneTaskV1FingerprintInput = Omit<
  z.input<typeof SceneTaskInputV1Object>,
  "schemaVersion" | "taskInputFingerprint"
> & { readonly schemaVersion?: 1 };

type SceneTaskV2FingerprintInput = Omit<
  z.input<typeof SceneTaskInputV2Object>,
  "schemaVersion" | "taskInputFingerprint"
> & { readonly schemaVersion?: 2 };
type SceneTaskV3FingerprintInput = Omit<
  z.input<typeof SceneTaskInputV3Object>,
  "schemaVersion" | "taskInputFingerprint"
> & { readonly schemaVersion?: 3 };

type SceneTaskFingerprintInput =
  | SceneTaskV1FingerprintInput
  | SceneTaskV2FingerprintInput
  | SceneTaskV3FingerprintInput;

export const computeSceneTaskInputFingerprint = (
  rawTask: SceneTaskFingerprintInput & {
    readonly taskInputFingerprint?: unknown;
  },
) => {
  const task = { ...rawTask } as Record<string, unknown>;
  delete task.taskInputFingerprint;
  return createFingerprint({
    namespace: "scene-task-input",
    version: task.schemaVersion === 3 ? 3 : task.schemaVersion === 2 ? 2 : 1,
    value: task,
  });
};

const addSceneTaskIssues = (
  task:
    | z.infer<typeof SceneTaskInputV1Object>
    | z.infer<typeof SceneTaskInputV2Object>
    | z.infer<typeof SceneTaskInputV3Object>,
  context: z.RefinementCtx,
) => {
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
  if (task.taskInputFingerprint !== computeSceneTaskInputFingerprint(task)) {
    context.addIssue({
      code: "custom",
      message: "Scene task input fingerprint is stale.",
      path: ["taskInputFingerprint"],
    });
  }
};

const SceneTaskInputV1Schema =
  SceneTaskInputV1Object.superRefine(addSceneTaskIssues).readonly();
const SceneTaskInputV2Schema =
  SceneTaskInputV2Object.superRefine(addSceneTaskIssues).readonly();
const SceneTaskInputV3Schema =
  SceneTaskInputV3Object.superRefine(addSceneTaskIssues).readonly();

export const SceneTaskInputSchema = z.union([
  SceneTaskInputV1Schema,
  SceneTaskInputV2Schema,
  SceneTaskInputV3Schema,
]);

export const buildSceneTaskInput = (rawInput: SceneTaskV1FingerprintInput) => {
  const input = {
    ...rawInput,
    schemaVersion: 1 as const,
  };
  return SceneTaskInputSchema.parse({
    ...input,
    taskInputFingerprint: computeSceneTaskInputFingerprint(input),
  });
};

export const buildSceneTaskInputV2 = (
  rawInput: SceneTaskV2FingerprintInput,
) => {
  const input = {
    ...rawInput,
    schemaVersion: 2 as const,
  };
  return SceneTaskInputSchema.parse({
    ...input,
    taskInputFingerprint: computeSceneTaskInputFingerprint(input),
  });
};

export const buildSceneTaskInputV3 = (
  rawInput: SceneTaskV3FingerprintInput,
) => {
  const input = { ...rawInput, schemaVersion: 3 as const };
  return SceneTaskInputSchema.parse({
    ...input,
    taskInputFingerprint: computeSceneTaskInputFingerprint(input),
  });
};

export type SceneTaskInput = z.infer<typeof SceneTaskInputSchema>;

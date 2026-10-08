import { z } from "zod";

import { VideoSourceReferencesSchema } from "./brief";
import { createFingerprint } from "./fingerprint";
import { ExternalRepositoryPathSchema } from "./external-reference";
import {
  MeaningIdSchema,
  Sha256DigestSchema,
  StoryIdSchema,
} from "./primitives";
import { SceneViewportSchema } from "./scene-readability";
import {
  AuthoringRequirementCategorySchema,
  AuthoringRequirementIdSchema,
  AuthoringRequirementStatementSchema,
  SCENE_COMPOSITION_BOUNDARY_VERSION,
} from "./authoring-requirements";
import { ResourceIdSchema } from "./resource-catalog";
import {
  StoryBeatSchema,
  aggregateSceneStoryBeat,
  isSceneOwnerBeat,
} from "./story";
import {
  SceneContinuityContractSchema,
  computeSceneContinuityId,
} from "./scene-continuity";

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

const VisualTimingBeatSchema = z
  .object({
    kind: z.literal("visual-scene"),
    durationInFrames: z.number().int().positive().safe(),
    ...TimingRangeShape,
  })
  .strict()
  .refine((beat) => beat.endFrame - beat.startFrame === beat.durationInFrames, {
    message: "Visual Scene timing Beat must equal its authored duration.",
    path: ["endFrame"],
  })
  .readonly();

const TimingBeatSchema = z.discriminatedUnion("kind", [
  NarratedTimingBeatSchema,
  VisualTimingBeatSchema,
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
    handoffs: SceneContinuityContractSchema.optional(),
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

const SceneTaskRequirementSchema = z
  .object({
    requirementId: AuthoringRequirementIdSchema,
    category: AuthoringRequirementCategorySchema,
    statement: AuthoringRequirementStatementSchema,
    severity: z.enum(["error", "warning"]),
  })
  .strict()
  .readonly();

const SceneTaskInputObject = z
  .object({
    schemaVersion: z.union([z.literal(7), z.literal(8)]),
    storyId: StoryIdSchema,
    meaningId: MeaningIdSchema,
    storyBeat: StoryBeatSchema,
    sourceReferences: VideoSourceReferencesSchema,
    timingBeat: TimingBeatSchema,
    coveredBeats: z
      .array(
        z
          .object({ storyBeat: StoryBeatSchema, timingBeat: TimingBeatSchema })
          .strict()
          .readonly(),
      )
      .min(2)
      .max(256)
      .readonly()
      .optional(),
    storyFingerprint: Sha256DigestSchema,
    renderFingerprint: Sha256DigestSchema,
    visualStyleFingerprint: Sha256DigestSchema,
    resourceCatalogFingerprint: Sha256DigestSchema,
    allowedSnapshots: z.array(AllowedSnapshotSchema).max(8).readonly(),
    allowedResourceIds: z.array(ResourceIdSchema).max(128).readonly(),
    continuity: ContinuityBriefSchema,
    allowedDirectories: SceneAllowedDirectoriesSchema,
    sceneRequirements: z.array(SceneTaskRequirementSchema).max(256).readonly(),
    sceneViewport: SceneViewportSchema,
    sceneCompositionBoundaryVersion: z.literal(
      SCENE_COMPOSITION_BOUNDARY_VERSION,
    ),
    taskInputFingerprint: Sha256DigestSchema,
  })
  .strict();

type SceneTaskFingerprintInput = Omit<
  z.input<typeof SceneTaskInputObject>,
  "schemaVersion" | "taskInputFingerprint"
> & { readonly schemaVersion?: 7 | 8 };

export const computeSceneTaskInputFingerprint = (
  rawTask: SceneTaskFingerprintInput & {
    readonly taskInputFingerprint?: unknown;
  },
) => {
  const task = { ...rawTask } as Record<string, unknown>;
  delete task.taskInputFingerprint;
  return createFingerprint({
    namespace: "scene-task-input",
    version: rawTask.schemaVersion ?? 7,
    value: task,
  });
};

const addSceneTaskIssues = (
  task: z.infer<typeof SceneTaskInputObject>,
  context: z.RefinementCtx,
) => {
  if ((task.schemaVersion === 8) !== (task.coveredBeats !== undefined))
    context.addIssue({
      code: "custom",
      message:
        "Multi-Beat Scene tasks require schemaVersion 8 and exact covered Beats.",
      path: ["coveredBeats"],
    });
  if (task.coveredBeats !== undefined) {
    const members = task.coveredBeats;
    if (
      members[0].storyBeat.meaningId !== task.meaningId ||
      members[0].timingBeat.startFrame !== task.timingBeat.startFrame ||
      members.at(-1)!.timingBeat.endFrame !== task.timingBeat.endFrame ||
      new Set(members.map((member) => member.storyBeat.meaningId)).size !==
        members.length ||
      members.some(
        (member, index) =>
          member.storyBeat.kind !== task.storyBeat.kind ||
          member.timingBeat.kind !== member.storyBeat.kind ||
          member.storyBeat.meaningId !== member.timingBeat.meaningId ||
          (index > 0 &&
            member.timingBeat.startFrame !==
              members[index - 1].timingBeat.endFrame) ||
          (member.storyBeat.kind === "silent-scene" &&
            (member.storyBeat.preset.implementation.kind !== "scene-owner" ||
              member.timingBeat.kind !== "silent-scene" ||
              member.timingBeat.presetFingerprint !==
                member.storyBeat.preset.presetFingerprint ||
              member.timingBeat.presetDurationInFrames !==
                member.storyBeat.preset.durationInFrames ||
              member.timingBeat.endFrame - member.timingBeat.startFrame !==
                member.storyBeat.preset.durationInFrames)),
      )
    )
      context.addIssue({
        code: "custom",
        message:
          "Covered Beats must exactly bind consecutive content timing and identity.",
        path: ["coveredBeats"],
      });
    try {
      if (
        JSON.stringify(task.storyBeat) !==
        JSON.stringify(
          aggregateSceneStoryBeat(members.map((member) => member.storyBeat)),
        )
      )
        throw new Error("Scene aggregate changed owned content.");
    } catch {
      context.addIssue({
        code: "custom",
        message:
          "Multi-Beat Scene must preserve every owned Beat in its aggregate.",
        path: ["storyBeat"],
      });
    }
  }
  const handoffs = task.continuity.handoffs;
  if (handoffs !== undefined) {
    for (const direction of ["incoming", "outgoing"] as const) {
      const seam =
        direction === "incoming"
          ? handoffs.incoming
          : handoffs.outgoing.kind === "continuous"
            ? handoffs.outgoing
            : null;
      const neighbor =
        direction === "incoming"
          ? task.continuity.previousMeaningId
          : task.continuity.nextMeaningId;
      if (
        seam !== null &&
        (!isSceneOwnerBeat(task.storyBeat) ||
          neighbor === null ||
          seam.continuityId !==
            computeSceneContinuityId(
              task.storyId,
              direction === "incoming" ? neighbor : task.meaningId,
              direction === "incoming" ? task.meaningId : neighbor,
            ))
      )
        context.addIssue({
          code: "custom",
          message: "Scene handoff identity is cross-bound to its adjacency.",
          path: ["continuity", "handoffs", direction],
        });
    }
  }
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
    task.storyBeat.kind === "visual-scene" &&
    (task.timingBeat.kind !== "visual-scene" ||
      task.timingBeat.durationInFrames !== task.storyBeat.durationInFrames)
  ) {
    context.addIssue({
      code: "custom",
      message: "Visual Scene task authored timing identity is stale.",
      path: ["timingBeat"],
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
    new Set(task.sceneRequirements.map(({ requirementId }) => requirementId))
      .size !== task.sceneRequirements.length
  ) {
    context.addIssue({
      code: "custom",
      message: "Scene task requirements must contain unique identities.",
      path: ["sceneRequirements"],
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

export const buildSceneTaskInputV7 = (rawInput: SceneTaskFingerprintInput) => {
  const input = { ...rawInput, schemaVersion: 7 as const };
  return SceneTaskInputSchema.parse({
    ...input,
    taskInputFingerprint: computeSceneTaskInputFingerprint(input),
  });
};

export const buildSceneTaskInputV8 = (rawInput: SceneTaskFingerprintInput) => {
  const input = { ...rawInput, schemaVersion: 8 as const };
  return SceneTaskInputSchema.parse({
    ...input,
    taskInputFingerprint: computeSceneTaskInputFingerprint(input),
  });
};

export type SceneTaskInput = z.infer<typeof SceneTaskInputSchema>;

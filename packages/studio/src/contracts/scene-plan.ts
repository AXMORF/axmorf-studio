import { z } from "zod";

import { createFingerprint } from "./fingerprint";
import {
  MeaningIdSchema,
  NonNegativeIntegerSchema,
  PositiveIntegerSchema,
  Sha256DigestSchema,
} from "./primitives";
import {
  ResourceIdSchema,
  SelectedResourceRefSchema,
} from "./resource-catalog";
import {
  SceneEventIdSchema,
  SceneLocalFrameRangeSchema,
  SceneLocalFrameSchema,
  ShotIdSchema,
} from "./scene-primitives";

const NonEmptyPlanTextSchema = z.string().trim().min(1).max(1600);
const UniqueResourceIdsSchema = z
  .array(ResourceIdSchema)
  .max(128)
  .superRefine((ids, context) => {
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        message: "Resource IDs must be unique.",
      });
    }
  })
  .readonly();

const VisualPlanInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    taskInputFingerprint: Sha256DigestSchema,
    meaningId: MeaningIdSchema,
    semanticObjective: NonEmptyPlanTextSchema,
    subject: NonEmptyPlanTextSchema,
    primaryAction: NonEmptyPlanTextSchema,
    causalLink: NonEmptyPlanTextSchema,
    primaryComposition: NonEmptyPlanTextSchema,
    styleRealization: z.array(NonEmptyPlanTextSchema).min(1).max(32).readonly(),
    continuity: NonEmptyPlanTextSchema,
    orderedShotIds: z.array(ShotIdSchema).min(1).max(64).readonly(),
    visualResourceIds: UniqueResourceIdsSchema,
    recipeDecision: z.enum([
      "empty",
      "inspiration-only",
      "exact-demo-localized",
    ]),
    fallbackIntent: NonEmptyPlanTextSchema,
  })
  .strict();

const withFingerprint = <Input extends Record<string, unknown>>(
  namespace: string,
  input: Input,
) =>
  createFingerprint({
    namespace,
    version: 1,
    value: input,
  });

const omitFingerprint = (
  value: Record<string, unknown>,
  field: string,
): Record<string, unknown> => {
  const input = { ...value };
  delete input[field];
  return input;
};

export const SceneVisualPlanSchema = VisualPlanInputSchema.extend({
  visualPlanFingerprint: Sha256DigestSchema,
})
  .strict()
  .superRefine((plan, context) => {
    const input = omitFingerprint(plan, "visualPlanFingerprint");
    if (
      new Set(plan.orderedShotIds).size !== plan.orderedShotIds.length ||
      plan.visualPlanFingerprint !== withFingerprint("scene-visual-plan", input)
    ) {
      context.addIssue({
        code: "custom",
        message: "Scene visual plan order or fingerprint is invalid.",
        path: ["visualPlanFingerprint"],
      });
    }
  })
  .readonly();

export const buildSceneVisualPlan = (
  rawInput: Omit<z.input<typeof VisualPlanInputSchema>, "schemaVersion"> & {
    readonly schemaVersion?: 1;
    readonly visualPlanFingerprint?: unknown;
  },
) => {
  const input = VisualPlanInputSchema.parse({
    schemaVersion: 1,
    taskInputFingerprint: rawInput.taskInputFingerprint,
    meaningId: rawInput.meaningId,
    semanticObjective: rawInput.semanticObjective,
    subject: rawInput.subject,
    primaryAction: rawInput.primaryAction,
    causalLink: rawInput.causalLink,
    primaryComposition: rawInput.primaryComposition,
    styleRealization: rawInput.styleRealization,
    continuity: rawInput.continuity,
    orderedShotIds: rawInput.orderedShotIds,
    visualResourceIds: rawInput.visualResourceIds,
    recipeDecision: rawInput.recipeDecision,
    fallbackIntent: rawInput.fallbackIntent,
  });
  return SceneVisualPlanSchema.parse({
    ...input,
    visualPlanFingerprint: withFingerprint("scene-visual-plan", input),
  });
};

const ShotPlanSchema = z
  .object({
    shotId: ShotIdSchema,
    order: NonNegativeIntegerSchema,
    primaryRange: SceneLocalFrameRangeSchema,
    purpose: NonEmptyPlanTextSchema,
    action: NonEmptyPlanTextSchema,
    visualResourceIds: UniqueResourceIdsSchema,
    syncAnchorIds: z.array(SceneEventIdSchema).max(32).readonly(),
  })
  .strict()
  .readonly();

const ShotPlanSetInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    taskInputFingerprint: Sha256DigestSchema,
    meaningId: MeaningIdSchema,
    sceneDurationInFrames: PositiveIntegerSchema,
    shots: z.array(ShotPlanSchema).min(1).max(64).readonly(),
  })
  .strict();

export const ShotPlanSetSchema = ShotPlanSetInputSchema.extend({
  shotPlanFingerprint: Sha256DigestSchema,
})
  .strict()
  .superRefine((plan, context) => {
    let previousEnd = 0;
    const shotIds = new Set<string>();
    plan.shots.forEach((shot, index) => {
      if (shot.primaryRange.endFrame > plan.sceneDurationInFrames) {
        context.addIssue({
          code: "custom",
          message: `Shot endFrame ${shot.primaryRange.endFrame} exceeds the immutable Scene duration ${plan.sceneDurationInFrames}; use a Scene-local exclusive end no greater than ${plan.sceneDurationInFrames}.`,
          path: ["shots", index, "primaryRange", "endFrame"],
        });
      }
      if (
        shot.order !== index ||
        shot.primaryRange.startFrame < previousEnd ||
        shotIds.has(shot.shotId) ||
        new Set(shot.syncAnchorIds).size !== shot.syncAnchorIds.length
      ) {
        context.addIssue({
          code: "custom",
          message: "Shot order identities ranges or anchors are invalid.",
          path: ["shots", index],
        });
      }
      previousEnd = shot.primaryRange.endFrame;
      shotIds.add(shot.shotId);
    });
    const input = omitFingerprint(plan, "shotPlanFingerprint");
    if (plan.shotPlanFingerprint !== withFingerprint("shot-plan-set", input)) {
      context.addIssue({
        code: "custom",
        message: "Shot plan fingerprint is stale.",
        path: ["shotPlanFingerprint"],
      });
    }
  })
  .readonly();

export const buildShotPlanSet = (
  rawInput: Omit<z.input<typeof ShotPlanSetInputSchema>, "schemaVersion"> & {
    readonly schemaVersion?: 1;
    readonly shotPlanFingerprint?: unknown;
  },
) => {
  const input = ShotPlanSetInputSchema.parse({
    schemaVersion: 1,
    taskInputFingerprint: rawInput.taskInputFingerprint,
    meaningId: rawInput.meaningId,
    sceneDurationInFrames: rawInput.sceneDurationInFrames,
    shots: rawInput.shots,
  });
  return ShotPlanSetSchema.parse({
    ...input,
    shotPlanFingerprint: withFingerprint("shot-plan-set", input),
  });
};

const SyncAnchorSchema = z
  .object({
    eventId: SceneEventIdSchema,
    sceneLocalFrame: SceneLocalFrameSchema,
    purpose: NonEmptyPlanTextSchema,
  })
  .strict()
  .readonly();

const SyncAnchorSetInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    taskInputFingerprint: Sha256DigestSchema,
    meaningId: MeaningIdSchema,
    sceneDurationInFrames: PositiveIntegerSchema,
    anchors: z.array(SyncAnchorSchema).max(64).readonly(),
  })
  .strict();

export const SceneSyncAnchorSetSchema = SyncAnchorSetInputSchema.extend({
  syncAnchorFingerprint: Sha256DigestSchema,
})
  .strict()
  .superRefine((set, context) => {
    if (
      new Set(set.anchors.map((anchor) => anchor.eventId)).size !==
        set.anchors.length ||
      set.anchors.some(
        (anchor) => anchor.sceneLocalFrame >= set.sceneDurationInFrames,
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "Scene sync anchors must be unique and within the Scene.",
        path: ["anchors"],
      });
    }
    const input = omitFingerprint(set, "syncAnchorFingerprint");
    if (
      set.syncAnchorFingerprint !== withFingerprint("scene-sync-anchors", input)
    ) {
      context.addIssue({
        code: "custom",
        message: "Scene sync anchor fingerprint is stale.",
        path: ["syncAnchorFingerprint"],
      });
    }
  })
  .readonly();

export const buildSceneSyncAnchors = (
  rawInput: Omit<z.input<typeof SyncAnchorSetInputSchema>, "schemaVersion"> & {
    readonly schemaVersion?: 1;
    readonly syncAnchorFingerprint?: unknown;
  },
) => {
  const input = SyncAnchorSetInputSchema.parse({
    schemaVersion: 1,
    taskInputFingerprint: rawInput.taskInputFingerprint,
    meaningId: rawInput.meaningId,
    sceneDurationInFrames: rawInput.sceneDurationInFrames,
    anchors: rawInput.anchors,
  });
  return SceneSyncAnchorSetSchema.parse({
    ...input,
    syncAnchorFingerprint: withFingerprint("scene-sync-anchors", input),
  });
};

const SceneSfxRefSchema = SelectedResourceRefSchema.refine(
  (resource) =>
    resource.kind === "asset" &&
    (resource.role === "sound-effect" || resource.role === "background-music"),
  "Sound contributions must use Scene SFX assets.",
);

const SceneSoundContributionSchema = z
  .object({
    contributionId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    resource: SceneSfxRefSchema,
    timing: z.discriminatedUnion("kind", [
      z
        .object({
          kind: z.literal("anchor"),
          eventId: SceneEventIdSchema,
          offsetFrames: z.number().int().safe(),
        })
        .strict()
        .readonly(),
      z
        .object({
          kind: z.literal("explicit"),
          sceneLocalFrame: SceneLocalFrameSchema,
        })
        .strict()
        .readonly(),
    ]),
    durationInFrames: PositiveIntegerSchema,
    volume: z.number().finite().min(0).max(1),
  })
  .strict()
  .readonly();

const SoundPlanInputSchema = z
  .object({
    schemaVersion: z.literal(2),
    taskInputFingerprint: Sha256DigestSchema,
    meaningId: MeaningIdSchema,
    sceneDurationInFrames: PositiveIntegerSchema,
    contributions: z.array(SceneSoundContributionSchema).max(128).readonly(),
  })
  .strict();

export const SceneSoundPlanSchema = SoundPlanInputSchema.extend({
  soundPlanFingerprint: Sha256DigestSchema,
})
  .strict()
  .superRefine((plan, context) => {
    if (
      new Set(plan.contributions.map(({ contributionId }) => contributionId))
        .size !== plan.contributions.length
    ) {
      context.addIssue({
        code: "custom",
        message: "Scene sound contribution IDs must be unique.",
        path: ["contributions"],
      });
    }
    const input = omitFingerprint(plan, "soundPlanFingerprint");
    if (
      plan.soundPlanFingerprint !== withFingerprint("scene-sound-plan", input)
    ) {
      context.addIssue({
        code: "custom",
        message: "Scene sound plan fingerprint is stale.",
        path: ["soundPlanFingerprint"],
      });
    }
  })
  .readonly();

export const buildSceneSoundPlan = (
  rawInput: Omit<z.input<typeof SoundPlanInputSchema>, "schemaVersion"> & {
    readonly schemaVersion?: 2;
    readonly soundPlanFingerprint?: unknown;
  },
) => {
  const input = SoundPlanInputSchema.parse({
    schemaVersion: 2,
    taskInputFingerprint: rawInput.taskInputFingerprint,
    meaningId: rawInput.meaningId,
    sceneDurationInFrames: rawInput.sceneDurationInFrames,
    contributions: rawInput.contributions,
  });
  return SceneSoundPlanSchema.parse({
    ...input,
    soundPlanFingerprint: withFingerprint("scene-sound-plan", input),
  });
};

export const resolveSceneSoundContributions = ({
  soundPlan: rawSoundPlan,
  syncAnchors: rawSyncAnchors,
}: {
  readonly soundPlan: unknown;
  readonly syncAnchors: unknown;
}) => {
  const soundPlan = SceneSoundPlanSchema.parse(rawSoundPlan);
  const syncAnchors = SceneSyncAnchorSetSchema.parse(rawSyncAnchors);
  if (
    soundPlan.taskInputFingerprint !== syncAnchors.taskInputFingerprint ||
    soundPlan.meaningId !== syncAnchors.meaningId ||
    soundPlan.sceneDurationInFrames !== syncAnchors.sceneDurationInFrames
  ) {
    throw new Error("Scene sound and sync anchor identities do not match.");
  }
  const anchorFrames = new Map(
    syncAnchors.anchors.map((anchor) => [
      anchor.eventId,
      anchor.sceneLocalFrame,
    ]),
  );
  return soundPlan.contributions.map((contribution) => {
    const startFrame =
      contribution.timing.kind === "explicit"
        ? contribution.timing.sceneLocalFrame
        : (() => {
            const anchorFrame = anchorFrames.get(contribution.timing.eventId);
            if (anchorFrame === undefined) {
              throw new Error(
                `Sound contribution anchor is missing: ${contribution.timing.eventId}.`,
              );
            }
            return anchorFrame + contribution.timing.offsetFrames;
          })();
    const endFrame = startFrame + contribution.durationInFrames;
    if (
      !Number.isSafeInteger(startFrame) ||
      startFrame < 0 ||
      endFrame > soundPlan.sceneDurationInFrames
    ) {
      throw new Error(
        `Sound contribution exceeds the Scene range: ${contribution.contributionId}.`,
      );
    }
    return {
      contributionId: contribution.contributionId,
      startFrame,
      endFrame,
    };
  });
};

export const validateScenePlanBundle = ({
  taskInputFingerprint,
  meaningId,
  sceneDurationInFrames,
  allowedResourceIds,
  visualPlan: rawVisualPlan,
  shotPlan: rawShotPlan,
  syncAnchors: rawSyncAnchors,
  soundPlan: rawSoundPlan,
}: {
  readonly taskInputFingerprint: unknown;
  readonly meaningId: unknown;
  readonly sceneDurationInFrames: unknown;
  readonly allowedResourceIds: readonly string[];
  readonly visualPlan: unknown;
  readonly shotPlan: unknown;
  readonly syncAnchors: unknown;
  readonly soundPlan: unknown;
}) => {
  const fingerprint = Sha256DigestSchema.parse(taskInputFingerprint);
  const parsedMeaningId = MeaningIdSchema.parse(meaningId);
  const duration = PositiveIntegerSchema.parse(sceneDurationInFrames);
  const visualPlan = SceneVisualPlanSchema.parse(rawVisualPlan);
  const shotPlan = ShotPlanSetSchema.parse(rawShotPlan);
  const syncAnchors = SceneSyncAnchorSetSchema.parse(rawSyncAnchors);
  const soundPlan = SceneSoundPlanSchema.parse(rawSoundPlan);
  for (const artifact of [visualPlan, shotPlan, syncAnchors, soundPlan]) {
    if (
      artifact.taskInputFingerprint !== fingerprint ||
      artifact.meaningId !== parsedMeaningId
    ) {
      throw new Error("Scene plan artifact does not match its frozen task.");
    }
  }
  if (
    shotPlan.sceneDurationInFrames !== duration ||
    syncAnchors.sceneDurationInFrames !== duration ||
    soundPlan.sceneDurationInFrames !== duration ||
    JSON.stringify(visualPlan.orderedShotIds) !==
      JSON.stringify(shotPlan.shots.map((shot) => shot.shotId))
  ) {
    throw new Error("Scene plan order or fixed duration is inconsistent.");
  }
  const allowed = new Set(
    allowedResourceIds.map((id) => ResourceIdSchema.parse(id)),
  );
  const referenced = [
    ...visualPlan.visualResourceIds,
    ...shotPlan.shots.flatMap((shot) => shot.visualResourceIds),
    ...soundPlan.contributions.map(
      (contribution) => contribution.resource.resourceId,
    ),
  ];
  if (referenced.some((id) => !allowed.has(id))) {
    throw new Error(
      "Scene plan references a resource outside its task allowlist.",
    );
  }
  const anchors = new Set(syncAnchors.anchors.map((anchor) => anchor.eventId));
  if (
    shotPlan.shots.some((shot) =>
      shot.syncAnchorIds.some((eventId) => !anchors.has(eventId)),
    )
  ) {
    throw new Error("Shot plan references an undeclared Scene sync anchor.");
  }
  resolveSceneSoundContributions({ soundPlan, syncAnchors });
  return { visualPlan, shotPlan, syncAnchors, soundPlan };
};

export type SceneVisualPlan = z.infer<typeof SceneVisualPlanSchema>;
export type ShotPlanSet = z.infer<typeof ShotPlanSetSchema>;
export type SceneSyncAnchorSet = z.infer<typeof SceneSyncAnchorSetSchema>;
export type SceneSoundPlan = z.infer<typeof SceneSoundPlanSchema>;

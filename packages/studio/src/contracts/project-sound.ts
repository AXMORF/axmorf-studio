import { z } from "zod";

import { createFingerprint } from "./fingerprint";
import {
  NonNegativeIntegerSchema,
  Sha256DigestSchema,
  StoryIdSchema,
} from "./primitives";
import { ResourceIdSchema } from "./resource-catalog";
import { SynthesizedMusicTimelineSchema } from "./synthesized-music";

export const PROJECT_SOUND_PLAN_VERSION = "project-sound-plan-v1" as const;

const ProjectSoundContributionSchema = z
  .object({
    contributionId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
    resourceId: ResourceIdSchema,
    descriptorFingerprint: Sha256DigestSchema,
    volume: z.number().finite().min(0).max(1),
    loop: z.boolean(),
    playbackScope: z.enum([
      "content-window",
      "narrated-content",
      "content",
      "composition",
    ]),
    fadeInFrames: NonNegativeIntegerSchema.optional(),
    fadeOutFrames: NonNegativeIntegerSchema.optional(),
    /** Lowers music to `volume` across measured narration chunks with linear ramps. */
    speechDucking: z
      .object({
        volume: z.number().finite().min(0).max(1),
        rampFrames: z.number().int().min(1).max(60),
      })
      .strict()
      .readonly()
      .optional(),
  })
  .strict()
  .superRefine((contribution, context) => {
    if (
      contribution.speechDucking !== undefined &&
      contribution.speechDucking.volume > contribution.volume
    ) {
      context.addIssue({
        code: "custom",
        message: "Speech ducking cannot raise music above its base volume.",
        path: ["speechDucking", "volume"],
      });
    }
  })
  .readonly();

const ProjectSoundPlanInputObject = z
  .object({
    schemaVersion: z.literal(1),
    contractVersion: z.literal(PROJECT_SOUND_PLAN_VERSION),
    storyId: StoryIdSchema,
    sceneMusicPolicy: z.enum(["preserve", "mute"]).optional(),
    synthesizedMusic: SynthesizedMusicTimelineSchema.optional(),
    contributions: z
      .array(ProjectSoundContributionSchema)
      .max(16)
      .superRefine((contributions, context) => {
        const ids = contributions.map(({ contributionId }) => contributionId);
        if (new Set(ids).size !== ids.length) {
          context.addIssue({
            code: "custom",
            message: "Project sound contribution IDs must be unique.",
          });
        }
      })
      .readonly(),
  })
  .strict();

export const ProjectSoundPlanInputSchema =
  ProjectSoundPlanInputObject.readonly();

export const computeProjectSoundPlanFingerprint = (rawInput: unknown) => {
  const record = { ...(rawInput as Record<string, unknown>) };
  delete record.soundPlanFingerprint;
  const input = ProjectSoundPlanInputSchema.parse(record);
  return createFingerprint({
    namespace: "project-sound-plan",
    version: input.schemaVersion,
    value: input,
  });
};

export const ProjectSoundPlanSchema = ProjectSoundPlanInputObject.extend({
  soundPlanFingerprint: Sha256DigestSchema,
})
  .strict()
  .superRefine((plan, context) => {
    if (
      plan.synthesizedMusic !== undefined &&
      (plan.sceneMusicPolicy !== "mute" ||
        plan.contributions.length !== 1 ||
        plan.contributions[0]?.playbackScope !== "composition" ||
        plan.contributions[0]?.loop !== true)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Synthesized music requires one composition loop and muted Scene scores.",
      });
    }
    if (
      plan.soundPlanFingerprint !== computeProjectSoundPlanFingerprint(plan)
    ) {
      context.addIssue({
        code: "custom",
        message: "Project sound plan fingerprint is stale.",
        path: ["soundPlanFingerprint"],
      });
    }
  })
  .readonly();

export const buildProjectSoundPlan = (rawInput: unknown) => {
  const input = ProjectSoundPlanInputSchema.parse({
    ...(rawInput as Record<string, unknown>),
    schemaVersion: 1,
    contractVersion: PROJECT_SOUND_PLAN_VERSION,
  });
  return ProjectSoundPlanSchema.parse({
    ...input,
    soundPlanFingerprint: computeProjectSoundPlanFingerprint(input),
  });
};

export type ProjectSoundPlan = z.infer<typeof ProjectSoundPlanSchema>;

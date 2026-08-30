import { z } from "zod";

import { createFingerprint } from "./fingerprint";
import { Sha256DigestSchema, StoryIdSchema } from "./primitives";
import { ResourceIdSchema } from "./resource-catalog";

export const PROJECT_SOUND_PLAN_VERSION = "project-sound-plan-v1" as const;

const ProjectSoundContributionSchema = z
  .object({
    contributionId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
    resourceId: ResourceIdSchema,
    descriptorFingerprint: Sha256DigestSchema,
    volume: z.number().finite().min(0).max(1),
    loop: z.boolean(),
    playbackScope: z.literal("narrated-content"),
  })
  .strict()
  .readonly();

const ProjectSoundPlanInputObject = z
  .object({
    schemaVersion: z.literal(1),
    contractVersion: z.literal(PROJECT_SOUND_PLAN_VERSION),
    storyId: StoryIdSchema,
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

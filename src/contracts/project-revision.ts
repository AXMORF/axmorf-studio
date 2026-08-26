import { z } from "zod";

import { SceneProductionBriefItemSchema } from "./authoring-briefs";
import { VideoBriefSchema } from "./brief";
import { createFingerprint } from "./fingerprint";
import {
  ProjectCreateGlobalVisualSchema,
  ProjectCreateStorySchema,
  ProjectCreateVisualStyleSchema,
} from "./project-create";
import { ProductionRevisionIdSchema } from "./production-revision";
import { AuthoredPublishingIntentSchema } from "./publishing-intent";
import { StoryIdSchema } from "./primitives";

export const PROJECT_REVISION_INPUT_VERSION =
  "project-revision-input-v1" as const;
export const PROJECT_REVISION_CANDIDATE_VERSION =
  "project-revision-candidate-v1" as const;

export const ProjectRevisionCandidateIdSchema = z
  .string()
  .regex(/^revision-candidate-[0-9a-f]{64}$/u)
  .brand<"ProjectRevisionCandidateId">();

const ProjectRevisionPatchObject = z.strictObject({
  brief: VideoBriefSchema.optional(),
  story: ProjectCreateStorySchema.optional(),
  visualStyle: ProjectCreateVisualStyleSchema.optional(),
  scenes: z
    .array(SceneProductionBriefItemSchema)
    .min(1)
    .max(256)
    .readonly()
    .optional(),
  globalVisual: ProjectCreateGlobalVisualSchema.optional(),
  publishing: AuthoredPublishingIntentSchema.optional(),
});

export const ProjectRevisionPatchSchema = ProjectRevisionPatchObject.superRefine(
  (patch, context) => {
    if (Object.values(patch).every((value) => value === undefined)) {
      context.addIssue({
        code: "custom",
        message: "Project revision patch must change at least one authored section.",
        path: [],
      });
    }
  },
).readonly();

export const ProjectRevisionInputSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    contractVersion: z.literal(PROJECT_REVISION_INPUT_VERSION),
    storyId: StoryIdSchema,
    baseRevisionId: ProductionRevisionIdSchema,
    patch: ProjectRevisionPatchSchema,
  })
  .superRefine((input, context) => {
    if (
      input.patch.brief !== undefined &&
      input.patch.brief.storyId !== input.storyId
    ) {
      context.addIssue({
        code: "custom",
        message: "Revised VideoBrief must belong to the selected Project.",
        path: ["patch", "brief", "storyId"],
      });
    }
    if (
      input.patch.story !== undefined &&
      input.patch.story.storyId !== input.storyId
    ) {
      context.addIssue({
        code: "custom",
        message: "Revised Story must belong to the selected Project.",
        path: ["patch", "story", "storyId"],
      });
    }
  })
  .readonly();

export const computeProjectRevisionCandidateId = (rawInput: unknown) => {
  const input = ProjectRevisionInputSchema.parse(rawInput);
  const fingerprint = createFingerprint({
    namespace: "project-revision-candidate",
    version: 1,
    value: input,
  });
  return ProjectRevisionCandidateIdSchema.parse(
    `revision-candidate-${fingerprint.slice("sha256:".length)}`,
  );
};

export const ProjectRevisionCandidateRecordSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    contractVersion: z.literal(PROJECT_REVISION_CANDIDATE_VERSION),
    candidateId: ProjectRevisionCandidateIdSchema,
    input: ProjectRevisionInputSchema,
    baseSourceCurrentId: z.string().regex(/^source-current-[0-9a-f]{64}$/u),
    baseDeliveryBuildId: z.string().regex(/^delivery-[0-9a-f]{64}$/u),
    changedSections: z
      .array(
        z.enum([
          "brief",
          "globalVisual",
          "publishing",
          "scenes",
          "story",
          "visualStyle",
        ]),
      )
      .min(1)
      .readonly(),
    createdAt: z.string().datetime({ offset: true }),
  })
  .superRefine((record, context) => {
    const expectedCandidateId = computeProjectRevisionCandidateId(record.input);
    if (record.candidateId !== expectedCandidateId) {
      context.addIssue({
        code: "custom",
        message: "Project revision candidate identity is stale.",
        path: ["candidateId"],
      });
    }
    const expectedSections = Object.keys(record.input.patch).sort();
    if (
      record.changedSections.length !== expectedSections.length ||
      record.changedSections.some(
        (section, index) => section !== expectedSections[index],
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "Project revision changed sections are stale.",
        path: ["changedSections"],
      });
    }
  })
  .readonly();

export type ProjectRevisionCandidateId = z.infer<
  typeof ProjectRevisionCandidateIdSchema
>;
export type ProjectRevisionInput = z.infer<typeof ProjectRevisionInputSchema>;
export type ProjectRevisionCandidateRecord = z.infer<
  typeof ProjectRevisionCandidateRecordSchema
>;

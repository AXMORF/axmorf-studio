import { z } from "zod";

import { createFingerprint } from "./fingerprint";
import {
  MeaningIdSchema,
  PositiveIntegerSchema,
  Sha256DigestSchema,
  StoryIdSchema,
} from "./primitives";
import { ResourceIdSchema } from "./resource-catalog";
import { TemplateSceneSoundCueSchema } from "./story";

export const SceneTemplateIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);

const NonEmptyTextSchema = z.string().trim().min(1).max(1600);

const SceneTemplateCopiedFileSchema = z
  .object({
    repositoryPath: z.string().min(1).max(512),
    checksum: Sha256DigestSchema,
  })
  .strict()
  .readonly();

const SceneTemplateAnchorSchema = z
  .object({
    eventId: SceneTemplateIdSchema,
    sceneLocalFrame: z.number().int().nonnegative().safe(),
    purpose: NonEmptyTextSchema,
  })
  .strict()
  .readonly();

const SceneTemplateShotSchema = z
  .object({
    shotId: SceneTemplateIdSchema,
    order: z.number().int().nonnegative().safe(),
    primaryRange: z
      .object({
        startFrame: z.number().int().nonnegative().safe(),
        endFrame: PositiveIntegerSchema,
      })
      .strict()
      .readonly(),
    purpose: NonEmptyTextSchema,
    action: NonEmptyTextSchema,
    syncAnchorIds: z.array(SceneTemplateIdSchema).readonly(),
    visualResourceIds: z.array(ResourceIdSchema).max(128).readonly(),
  })
  .strict()
  .readonly();

const SceneTemplateVisualSchema = z
  .object({
    semanticObjective: NonEmptyTextSchema,
    subject: NonEmptyTextSchema,
    primaryAction: NonEmptyTextSchema,
    causalLink: NonEmptyTextSchema,
    primaryComposition: NonEmptyTextSchema,
    styleRealization: z.array(NonEmptyTextSchema).min(1).max(32).readonly(),
    continuity: NonEmptyTextSchema,
    fallbackIntent: NonEmptyTextSchema,
    orderedShotIds: z.array(SceneTemplateIdSchema).min(1).readonly(),
    visualResourceIds: z.array(ResourceIdSchema).max(128).readonly(),
  })
  .strict()
  .readonly();

const SceneTemplateInstanceInputObject = z
  .object({
    schemaVersion: z.literal(1),
    storyId: StoryIdSchema,
    meaningId: MeaningIdSchema,
    templateId: SceneTemplateIdSchema,
    templateFingerprint: Sha256DigestSchema,
    rendererSourceGraphFingerprint: Sha256DigestSchema,
    durationInFrames: PositiveIntegerSchema,
    visualIntent: NonEmptyTextSchema,
    soundIntent: NonEmptyTextSchema,
    resourceIds: z.array(ResourceIdSchema).max(128).readonly(),
    soundCues: z.array(TemplateSceneSoundCueSchema).max(16).readonly(),
    copiedSourceFiles: z.array(SceneTemplateCopiedFileSchema).min(1).readonly(),
    copiedAssetFiles: z
      .array(SceneTemplateCopiedFileSchema)
      .max(128)
      .readonly(),
    visual: SceneTemplateVisualSchema,
    anchors: z.array(SceneTemplateAnchorSchema).max(128).readonly(),
    shots: z.array(SceneTemplateShotSchema).min(1).max(128).readonly(),
  })
  .strict()
  .superRefine((instance, context) => {
    const sortedResources = [...instance.resourceIds].sort((left, right) =>
      left.localeCompare(right),
    );
    if (
      new Set(instance.resourceIds).size !== instance.resourceIds.length ||
      JSON.stringify(instance.resourceIds) !== JSON.stringify(sortedResources)
    ) {
      context.addIssue({
        code: "custom",
        message: "Scene template resources must be unique and sorted.",
        path: ["resourceIds"],
      });
    }
    const anchorIds = new Set(instance.anchors.map(({ eventId }) => eventId));
    const shotIds = instance.shots.map(({ shotId }) => shotId);
    if (
      new Set(shotIds).size !== shotIds.length ||
      instance.shots.some(({ order }, index) => order !== index) ||
      JSON.stringify(shotIds) !== JSON.stringify(instance.visual.orderedShotIds)
    ) {
      context.addIssue({
        code: "custom",
        message: "Scene template shots must be unique and ordered.",
        path: ["shots"],
      });
    }
    instance.shots.forEach((shot, index) => {
      if (
        shot.primaryRange.endFrame <= shot.primaryRange.startFrame ||
        shot.primaryRange.endFrame > instance.durationInFrames ||
        shot.syncAnchorIds.some((anchorId) => !anchorIds.has(anchorId)) ||
        shot.visualResourceIds.some(
          (resourceId) => !instance.resourceIds.includes(resourceId),
        )
      ) {
        context.addIssue({
          code: "custom",
          message: "Scene template shot identity is invalid.",
          path: ["shots", index],
        });
      }
    });
    if (
      instance.shots.at(-1)?.primaryRange.endFrame !==
        instance.durationInFrames ||
      instance.visual.visualResourceIds.some(
        (resourceId) => !instance.resourceIds.includes(resourceId),
      ) ||
      instance.soundCues.some(
        (cue) =>
          !instance.resourceIds.includes(cue.resourceId) ||
          !anchorIds.has(cue.anchorId),
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "Scene template resources, anchors, and duration must agree.",
      });
    }
  });

export const computeSceneTemplateInstanceFingerprint = (rawInput: unknown) => {
  const record = { ...(rawInput as Record<string, unknown>) };
  delete record.instanceFingerprint;
  return createFingerprint({
    namespace: "scene-template-instance",
    version: 1,
    value: SceneTemplateInstanceInputObject.parse(record),
  });
};

export const SceneTemplateInstanceSchema =
  SceneTemplateInstanceInputObject.extend({
    instanceFingerprint: Sha256DigestSchema,
  })
    .strict()
    .superRefine((instance, context) => {
      if (
        instance.instanceFingerprint !==
        computeSceneTemplateInstanceFingerprint(instance)
      ) {
        context.addIssue({
          code: "custom",
          message: "Scene template instance fingerprint is stale.",
          path: ["instanceFingerprint"],
        });
      }
    })
    .readonly();

export const buildSceneTemplateInstance = (rawInput: unknown) => {
  const input = SceneTemplateInstanceInputObject.parse(rawInput);
  return SceneTemplateInstanceSchema.parse({
    ...input,
    instanceFingerprint: computeSceneTemplateInstanceFingerprint(input),
  });
};

export type SceneTemplateInstance = z.infer<typeof SceneTemplateInstanceSchema>;

const InstantiatedSceneSelectionSchema = z
  .object({
    templateId: SceneTemplateIdSchema,
    meaningId: MeaningIdSchema,
    templateFingerprint: Sha256DigestSchema,
    instanceFingerprint: Sha256DigestSchema,
    presetFingerprint: Sha256DigestSchema,
  })
  .strict()
  .readonly();

const ProjectSceneTemplateInstantiationInputObject = z
  .object({
    schemaVersion: z.literal(1),
    storyId: StoryIdSchema,
    selections: z
      .object({
        intro: InstantiatedSceneSelectionSchema.nullable(),
        outro: InstantiatedSceneSelectionSchema.nullable(),
      })
      .strict()
      .readonly(),
    materializedStoryFingerprint: Sha256DigestSchema,
  })
  .strict();

export const computeProjectSceneTemplateInstantiationFingerprint = (
  rawInput: unknown,
) => {
  const record = { ...(rawInput as Record<string, unknown>) };
  delete record.instantiationFingerprint;
  return createFingerprint({
    namespace: "project-scene-template-instantiation",
    version: 1,
    value: ProjectSceneTemplateInstantiationInputObject.parse(record),
  });
};

export const ProjectSceneTemplateInstantiationSchema =
  ProjectSceneTemplateInstantiationInputObject.extend({
    instantiationFingerprint: Sha256DigestSchema,
  })
    .strict()
    .superRefine((instantiation, context) => {
      if (
        instantiation.instantiationFingerprint !==
        computeProjectSceneTemplateInstantiationFingerprint(instantiation)
      ) {
        context.addIssue({
          code: "custom",
          message: "Project Scene template instantiation is stale.",
          path: ["instantiationFingerprint"],
        });
      }
    })
    .readonly();

export const buildProjectSceneTemplateInstantiation = (rawInput: unknown) => {
  const input = ProjectSceneTemplateInstantiationInputObject.parse(rawInput);
  return ProjectSceneTemplateInstantiationSchema.parse({
    ...input,
    instantiationFingerprint:
      computeProjectSceneTemplateInstantiationFingerprint(input),
  });
};

export type ProjectSceneTemplateInstantiation = z.infer<
  typeof ProjectSceneTemplateInstantiationSchema
>;

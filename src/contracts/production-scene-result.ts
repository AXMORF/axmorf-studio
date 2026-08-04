import { z } from "zod";

import { createFingerprint } from "./fingerprint";
import {
  MeaningIdSchema,
  Sha256DigestSchema,
  StoryIdSchema,
} from "./primitives";
import {
  ProductionRequirementSchema,
  type ProductionRequirementsFreeze,
} from "./production-requirements";
import { ProductionErrorSchema, ProductionRunIdSchema } from "./production-run";
import {
  ResourceCatalogSchema,
  ResourceIdSchema,
  type ResourceCatalog,
} from "./resource-catalog";
import { SceneTaskInputSchema } from "./scene-task";
import type { StorySpec } from "./story";

export const STORY_RESOURCE_POOL_VERSION = "story-resource-pool-v1" as const;
export const SCENE_PRODUCTION_BRIEF_VERSION =
  "scene-production-brief-v1" as const;
export const SCENE_ASSIGNMENT_VERSION = "scene-assignment-v1" as const;
export const SCENE_PRODUCTION_RESULT_VERSION =
  "scene-production-result-v1" as const;

const SafeProductionTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(1_600)
  .refine(
    (value) =>
      !/(?:Bearer\s|https?:\/\/|(?:^|\s)\/(?:home|data|tmp)\/|[A-Za-z]:\\|\b(?:token|secret|private[-_ ]?config|provider[-_ ]?endpoint)\b)/iu.test(
        value,
      ),
    "Production Scene text must not contain private or remote diagnostics.",
  );

const CardIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const addUniqueSortedIssues = (
  values: readonly string[],
  context: z.RefinementCtx,
  path: PropertyKey,
) => {
  const sorted = [...values].sort((left, right) => left.localeCompare(right));
  if (new Set(values).size !== values.length) {
    context.addIssue({
      code: "custom",
      message: "Production Scene allowlists must contain unique identities.",
      path: [path],
    });
  }
  values.forEach((value, index) => {
    if (value !== sorted[index]) {
      context.addIssue({
        code: "custom",
        message: "Production Scene allowlists must be canonically sorted.",
        path: [path, index],
      });
    }
  });
};

export const StoryResourcePoolSnapshotSchema = z
  .object({
    sourceId: z.literal("video-shotcraft"),
    snapshotFingerprint: Sha256DigestSchema,
    allowedCardIds: z.array(CardIdSchema).min(1).max(128).readonly(),
  })
  .strict()
  .superRefine((snapshot, context) =>
    addUniqueSortedIssues(snapshot.allowedCardIds, context, "allowedCardIds"),
  )
  .readonly();

const StoryResourcePoolInputObject = z
  .object({
    schemaVersion: z.literal(1),
    contractVersion: z.literal(STORY_RESOURCE_POOL_VERSION),
    storyId: StoryIdSchema,
    requirementsFingerprint: Sha256DigestSchema,
    resourceCatalogFingerprint: Sha256DigestSchema,
    allowedResourceIds: z.array(ResourceIdSchema).max(256).readonly(),
    allowedSnapshots: z
      .array(StoryResourcePoolSnapshotSchema)
      .max(16)
      .readonly(),
    selfAuthoredVisualsAllowed: z.literal(true),
  })
  .strict()
  .superRefine((pool, context) => {
    addUniqueSortedIssues(
      pool.allowedResourceIds,
      context,
      "allowedResourceIds",
    );
    const sources = pool.allowedSnapshots.map(({ sourceId }) => sourceId);
    if (new Set(sources).size !== sources.length) {
      context.addIssue({
        code: "custom",
        message: "Story resource pool snapshot sources must be unique.",
        path: ["allowedSnapshots"],
      });
    }
  });

export const StoryResourcePoolInputSchema =
  StoryResourcePoolInputObject.readonly();

export const computeStoryResourcePoolFingerprint = (rawInput: unknown) => {
  const record = { ...(rawInput as Record<string, unknown>) };
  delete record.poolFingerprint;
  const input = StoryResourcePoolInputSchema.parse(record);
  return createFingerprint({
    namespace: "story-resource-pool",
    version: 1,
    value: input,
  });
};

export const StoryResourcePoolSchema = StoryResourcePoolInputObject.extend({
  poolFingerprint: Sha256DigestSchema,
})
  .strict()
  .superRefine((pool, context) => {
    const { poolFingerprint, ...input } = pool;
    const parsed = StoryResourcePoolInputSchema.safeParse(input);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        context.addIssue({
          code: "custom",
          message: issue.message,
          path: issue.path,
        });
      }
      return;
    }
    if (poolFingerprint !== computeStoryResourcePoolFingerprint(parsed.data)) {
      context.addIssue({
        code: "custom",
        message: "Story resource pool fingerprint is stale.",
        path: ["poolFingerprint"],
      });
    }
  })
  .readonly();

export const buildStoryResourcePool = (rawInput: unknown) => {
  const record: Record<string, unknown> = {
    ...(rawInput as Record<string, unknown>),
    schemaVersion: 1,
    contractVersion: STORY_RESOURCE_POOL_VERSION,
  };
  delete record.poolFingerprint;
  const input = StoryResourcePoolInputSchema.parse(record);
  return StoryResourcePoolSchema.parse({
    ...input,
    poolFingerprint: computeStoryResourcePoolFingerprint(input),
  });
};

export const validateStoryResourcePool = ({
  pool: rawPool,
  catalog: rawCatalog,
  requirementsFingerprint,
}: {
  readonly pool: unknown;
  readonly catalog: unknown;
  readonly requirementsFingerprint: unknown;
}) => {
  const pool = StoryResourcePoolSchema.parse(rawPool);
  const catalog = ResourceCatalogSchema.parse(rawCatalog);
  const expectedRequirements = Sha256DigestSchema.parse(
    requirementsFingerprint,
  );
  if (
    pool.requirementsFingerprint !== expectedRequirements ||
    pool.resourceCatalogFingerprint !== catalog.catalogFingerprint
  ) {
    throw new Error("Story resource pool identity is stale.");
  }
  const catalogById = new Map(
    catalog.entries.map((entry) => [entry.descriptor.id, entry] as const),
  );
  for (const resourceId of pool.allowedResourceIds) {
    const entry = catalogById.get(resourceId);
    if (
      entry === undefined ||
      entry.descriptor.status !== "approved" ||
      entry.descriptor.allowedUse === "blocked" ||
      entry.descriptor.kind === "authoring-reference"
    ) {
      throw new Error(
        `Story resource pool contains a resource outside the current Catalog: ${resourceId}.`,
      );
    }
  }
  return pool;
};

export const SceneSnapshotCardSelectionSchema = z
  .object({
    sourceId: z.literal("video-shotcraft"),
    cardIds: z.array(CardIdSchema).min(1).max(128).readonly(),
  })
  .strict()
  .superRefine((selection, context) =>
    addUniqueSortedIssues(selection.cardIds, context, "cardIds"),
  )
  .readonly();

export const SceneProductionBriefItemSchema = z
  .object({
    meaningId: MeaningIdSchema,
    visualIntent: SafeProductionTextSchema,
    compositionIntent: SafeProductionTextSchema,
    motionIntent: SafeProductionTextSchema,
    soundIntent: SafeProductionTextSchema,
    continuityBrief: SafeProductionTextSchema,
    candidateResourceIds: z.array(ResourceIdSchema).max(128).readonly(),
    allowedSnapshotCards: z
      .array(SceneSnapshotCardSelectionSchema)
      .max(16)
      .readonly(),
  })
  .strict()
  .superRefine((scene, context) => {
    addUniqueSortedIssues(
      scene.candidateResourceIds,
      context,
      "candidateResourceIds",
    );
    const sources = scene.allowedSnapshotCards.map(({ sourceId }) => sourceId);
    if (new Set(sources).size !== sources.length) {
      context.addIssue({
        code: "custom",
        message: "Scene snapshot selection sources must be unique.",
        path: ["allowedSnapshotCards"],
      });
    }
  })
  .readonly();

const SceneProductionBriefInputObject = z
  .object({
    schemaVersion: z.literal(1),
    contractVersion: z.literal(SCENE_PRODUCTION_BRIEF_VERSION),
    storyId: StoryIdSchema,
    requirementsFingerprint: Sha256DigestSchema,
    semanticTimingFingerprint: Sha256DigestSchema,
    visualStyleFingerprint: Sha256DigestSchema,
    resourcePoolFingerprint: Sha256DigestSchema,
    sceneLocalSoundPolicy: z.enum(["allowed", "none"]),
    reviewPolicy: z.literal("mechanical-only"),
    scenes: z.array(SceneProductionBriefItemSchema).min(1).max(256).readonly(),
  })
  .strict()
  .superRefine((brief, context) => {
    const meaningIds = brief.scenes.map(({ meaningId }) => meaningId);
    if (new Set(meaningIds).size !== meaningIds.length) {
      context.addIssue({
        code: "custom",
        message: "Scene production brief meaning IDs must be unique.",
        path: ["scenes"],
      });
    }
  });

export const SceneProductionBriefInputSchema =
  SceneProductionBriefInputObject.readonly();

export const computeSceneProductionBriefFingerprint = (rawInput: unknown) => {
  const record = { ...(rawInput as Record<string, unknown>) };
  delete record.briefFingerprint;
  const input = SceneProductionBriefInputSchema.parse(record);
  return createFingerprint({
    namespace: "scene-production-brief",
    version: 1,
    value: input,
  });
};

export const SceneProductionBriefSchema =
  SceneProductionBriefInputObject.extend({
    briefFingerprint: Sha256DigestSchema,
  })
    .strict()
    .superRefine((brief, context) => {
      const { briefFingerprint, ...input } = brief;
      const parsed = SceneProductionBriefInputSchema.safeParse(input);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          context.addIssue({
            code: "custom",
            message: issue.message,
            path: issue.path,
          });
        }
        return;
      }
      if (
        briefFingerprint !== computeSceneProductionBriefFingerprint(parsed.data)
      ) {
        context.addIssue({
          code: "custom",
          message: "Scene production brief fingerprint is stale.",
          path: ["briefFingerprint"],
        });
      }
    })
    .readonly();

export const buildSceneProductionBrief = (rawInput: unknown) => {
  const record: Record<string, unknown> = {
    ...(rawInput as Record<string, unknown>),
    schemaVersion: 1,
    contractVersion: SCENE_PRODUCTION_BRIEF_VERSION,
  };
  delete record.briefFingerprint;
  const input = SceneProductionBriefInputSchema.parse(record);
  return SceneProductionBriefSchema.parse({
    ...input,
    briefFingerprint: computeSceneProductionBriefFingerprint(input),
  });
};

export const validateSceneProductionBrief = ({
  brief: rawBrief,
  story,
  requirements,
  semanticTimingFingerprint,
  visualStyleFingerprint,
  pool,
}: {
  readonly brief: unknown;
  readonly story: StorySpec;
  readonly requirements: ProductionRequirementsFreeze;
  readonly semanticTimingFingerprint: unknown;
  readonly visualStyleFingerprint: unknown;
  readonly pool: StoryResourcePool;
}) => {
  const brief = SceneProductionBriefSchema.parse(rawBrief);
  if (
    brief.storyId !== story.storyId ||
    brief.requirementsFingerprint !== requirements.requirementsFingerprint ||
    brief.semanticTimingFingerprint !==
      Sha256DigestSchema.parse(semanticTimingFingerprint) ||
    brief.visualStyleFingerprint !==
      Sha256DigestSchema.parse(visualStyleFingerprint) ||
    brief.resourcePoolFingerprint !== pool.poolFingerprint ||
    brief.sceneLocalSoundPolicy !==
      requirements.enhancementSelection.sceneLocalSound
  ) {
    throw new Error("Scene production brief identity is stale.");
  }
  if (
    brief.scenes.length !== story.beats.length ||
    brief.scenes.some(
      ({ meaningId }, index) => meaningId !== story.beats[index]?.meaningId,
    )
  ) {
    throw new Error(
      "Scene production brief must contain every StoryBeat exactly once in order.",
    );
  }
  const poolResources = new Set(pool.allowedResourceIds);
  const poolSnapshots = new Map(
    pool.allowedSnapshots.map((snapshot) => [
      snapshot.sourceId,
      new Set(snapshot.allowedCardIds),
    ]),
  );
  for (const scene of brief.scenes) {
    if (
      scene.candidateResourceIds.some(
        (resourceId) => !poolResources.has(resourceId),
      )
    ) {
      throw new Error(
        `Scene ${scene.meaningId} requests a resource outside the Story pool.`,
      );
    }
    for (const selection of scene.allowedSnapshotCards) {
      const allowedCards = poolSnapshots.get(selection.sourceId);
      if (
        allowedCards === undefined ||
        selection.cardIds.some((cardId) => !allowedCards.has(cardId))
      ) {
        throw new Error(
          `Scene ${scene.meaningId} requests a snapshot card outside the Story pool.`,
        );
      }
    }
  }
  return brief;
};

const SceneAssignmentInputObject = z
  .object({
    schemaVersion: z.literal(1),
    contractVersion: z.literal(SCENE_ASSIGNMENT_VERSION),
    runId: ProductionRunIdSchema,
    storyId: StoryIdSchema,
    meaningId: MeaningIdSchema,
    requirementsFingerprint: Sha256DigestSchema,
    sceneBriefFingerprint: Sha256DigestSchema,
    resourcePoolFingerprint: Sha256DigestSchema,
    taskInput: SceneTaskInputSchema,
    sceneBrief: SceneProductionBriefItemSchema,
    additionalRequirements: z
      .array(ProductionRequirementSchema)
      .max(256)
      .readonly(),
    deadlineAt: z.string().datetime({ offset: true }),
  })
  .strict()
  .superRefine((assignment, context) => {
    if (
      assignment.taskInput.storyId !== assignment.storyId ||
      assignment.taskInput.meaningId !== assignment.meaningId ||
      assignment.sceneBrief.meaningId !== assignment.meaningId
    ) {
      context.addIssue({
        code: "custom",
        message: "Scene assignment identities do not match.",
        path: ["meaningId"],
      });
    }
    const requirementIds = assignment.additionalRequirements.map(
      ({ requirementId }) => requirementId,
    );
    if (new Set(requirementIds).size !== requirementIds.length) {
      context.addIssue({
        code: "custom",
        message: "Scene assignment requirements must be unique.",
        path: ["additionalRequirements"],
      });
    }
    for (const requirement of assignment.additionalRequirements) {
      if (
        requirement.scope !== "all-scenes" &&
        !(
          requirement.scope === "scene" &&
          requirement.targetMeaningIds.includes(assignment.meaningId)
        )
      ) {
        context.addIssue({
          code: "custom",
          message: "Scene assignment contains an unrelated requirement.",
          path: ["additionalRequirements"],
        });
      }
    }
  });

export const SceneAssignmentInputSchema = SceneAssignmentInputObject.readonly();

export const computeSceneAssignmentFingerprint = (rawInput: unknown) => {
  const record = { ...(rawInput as Record<string, unknown>) };
  delete record.assignmentFingerprint;
  const input = SceneAssignmentInputSchema.parse(record);
  return createFingerprint({
    namespace: "scene-assignment",
    version: 1,
    value: input,
  });
};

export const SceneAssignmentSchema = SceneAssignmentInputObject.extend({
  assignmentFingerprint: Sha256DigestSchema,
})
  .strict()
  .superRefine((assignment, context) => {
    const { assignmentFingerprint, ...input } = assignment;
    const parsed = SceneAssignmentInputSchema.safeParse(input);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        context.addIssue({
          code: "custom",
          message: issue.message,
          path: issue.path,
        });
      }
      return;
    }
    if (
      assignmentFingerprint !== computeSceneAssignmentFingerprint(parsed.data)
    ) {
      context.addIssue({
        code: "custom",
        message: "Scene assignment fingerprint is stale.",
        path: ["assignmentFingerprint"],
      });
    }
  })
  .readonly();

export const buildSceneAssignment = (rawInput: unknown) => {
  const record: Record<string, unknown> = {
    ...(rawInput as Record<string, unknown>),
    schemaVersion: 1,
    contractVersion: SCENE_ASSIGNMENT_VERSION,
  };
  delete record.assignmentFingerprint;
  const input = SceneAssignmentInputSchema.parse(record);
  return SceneAssignmentSchema.parse({
    ...input,
    assignmentFingerprint: computeSceneAssignmentFingerprint(input),
  });
};

const ResultRepositoryPathSchema = z
  .string()
  .min(1)
  .max(512)
  .refine(
    (value) =>
      !value.startsWith("/") &&
      !value.includes("\\") &&
      !value.split("/").includes("..") &&
      !value.includes("://"),
    "Scene result paths must be repository-relative.",
  );

const SceneProductionResultCommonShape = {
  schemaVersion: z.literal(1),
  contractVersion: z.literal(SCENE_PRODUCTION_RESULT_VERSION),
  runId: ProductionRunIdSchema,
  storyId: StoryIdSchema,
  meaningId: MeaningIdSchema,
  assignmentFingerprint: Sha256DigestSchema,
  taskInputFingerprint: Sha256DigestSchema,
  requirementsFingerprint: Sha256DigestSchema,
  sceneBriefFingerprint: Sha256DigestSchema,
  resourcePoolFingerprint: Sha256DigestSchema,
  occurredAt: z.string().datetime({ offset: true }),
} as const;

const SceneProductionSuccessInputObject = z
  .object({
    ...SceneProductionResultCommonShape,
    status: z.literal("success"),
    scenePackage: z
      .object({
        repositoryPath: ResultRepositoryPathSchema,
        packageFingerprint: Sha256DigestSchema,
      })
      .strict()
      .readonly(),
    rendererSourceGraphFingerprint: Sha256DigestSchema,
    selectedResourcesFingerprint: Sha256DigestSchema,
    fidelityReceiptFingerprint: Sha256DigestSchema,
    mechanicalCheckFingerprint: Sha256DigestSchema,
  })
  .strict();

const SceneProductionFailureInputObject = z
  .object({
    ...SceneProductionResultCommonShape,
    status: z.literal("failure"),
    error: ProductionErrorSchema,
  })
  .strict();

const SceneProductionResultInputUnion = z.discriminatedUnion("status", [
  SceneProductionSuccessInputObject,
  SceneProductionFailureInputObject,
]);

const addSceneProductionResultIssues = (
  result: z.infer<typeof SceneProductionResultInputUnion>,
  context: z.RefinementCtx,
) => {
  if (result.status === "success") {
    const expected = `src/projects/${result.storyId}/scenes/${result.meaningId}/generated/scene-package.generated.json`;
    if (result.scenePackage.repositoryPath !== expected) {
      context.addIssue({
        code: "custom",
        message: "Scene result package path is not meaning-local.",
        path: ["scenePackage", "repositoryPath"],
      });
    }
  } else if (
    result.error.stageId !== "scenes" ||
    result.error.scope !== "scene" ||
    result.error.meaningId !== result.meaningId
  ) {
    context.addIssue({
      code: "custom",
      message: "Scene failure result error identity does not match.",
      path: ["error"],
    });
  }
};

export const SceneProductionResultInputSchema =
  SceneProductionResultInputUnion.superRefine(
    addSceneProductionResultIssues,
  ).readonly();

export const computeSceneProductionResultFingerprint = (rawInput: unknown) => {
  const record = { ...(rawInput as Record<string, unknown>) };
  delete record.resultFingerprint;
  const input = SceneProductionResultInputSchema.parse(record);
  return createFingerprint({
    namespace: "scene-production-result",
    version: 1,
    value: input,
  });
};

const withResultFingerprint = <Shape extends z.ZodRawShape>(shape: Shape) =>
  z.object({ ...shape, resultFingerprint: Sha256DigestSchema }).strict();

const SceneProductionResultUnion = z.discriminatedUnion("status", [
  withResultFingerprint(SceneProductionSuccessInputObject.shape),
  withResultFingerprint(SceneProductionFailureInputObject.shape),
]);

export const SceneProductionResultSchema =
  SceneProductionResultUnion.superRefine((result, context) => {
    const { resultFingerprint, ...input } = result;
    const parsed = SceneProductionResultInputSchema.safeParse(input);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        context.addIssue({
          code: "custom",
          message: issue.message,
          path: issue.path,
        });
      }
      return;
    }
    if (
      resultFingerprint !== computeSceneProductionResultFingerprint(parsed.data)
    ) {
      context.addIssue({
        code: "custom",
        message: "Scene production result fingerprint is stale.",
        path: ["resultFingerprint"],
      });
    }
  }).readonly();

export const buildSceneProductionResult = (rawInput: unknown) => {
  const record: Record<string, unknown> = {
    ...(rawInput as Record<string, unknown>),
    schemaVersion: 1,
    contractVersion: SCENE_PRODUCTION_RESULT_VERSION,
  };
  delete record.resultFingerprint;
  const input = SceneProductionResultInputSchema.parse(record);
  return SceneProductionResultSchema.parse({
    ...input,
    resultFingerprint: computeSceneProductionResultFingerprint(input),
  });
};

export type StoryResourcePool = z.infer<typeof StoryResourcePoolSchema>;
export type SceneProductionBrief = z.infer<typeof SceneProductionBriefSchema>;
export type SceneProductionBriefItem = z.infer<
  typeof SceneProductionBriefItemSchema
>;
export type SceneAssignment = z.infer<typeof SceneAssignmentSchema>;
export type SceneProductionResult = z.infer<typeof SceneProductionResultSchema>;
export type CurrentSceneCatalog = ResourceCatalog;

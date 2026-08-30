import { z } from "zod";

import { SceneProductionBriefItemSchema } from "./authoring-briefs";
import { VideoBriefSchema } from "./brief";
import { DeliveryBuildIdSchema } from "./delivery-build";
import { createFingerprint } from "./fingerprint";
import { ProductionRevisionIdSchema } from "./production-revision";
import {
  ProjectCreateGlobalVisualSchema,
  ProjectCreateStorySchema,
  ProjectCreateVisualStyleSchema,
} from "./project-create";
import {
  NonNegativeIntegerSchema,
  Sha256DigestSchema,
  StoryIdSchema,
} from "./primitives";
import { AuthoredPublishingIntentSchema } from "./publishing-intent";

export const PROJECT_REVISION_INPUT_VERSION =
  "project-revision-input-v1" as const;
export const PROJECT_REVISION_CANDIDATE_RECORD_VERSION =
  "project-revision-candidate-record-v1" as const;
export const PROJECT_REVISION_BASE_SNAPSHOT_VERSION =
  "project-revision-base-snapshot-v1" as const;
export const PROJECT_REVISION_CONTEXT_VERSION =
  "project-revision-context-v1" as const;
export const PROJECT_REVISION_MATERIALIZATION_VERSION =
  "project-revision-materialization-v1" as const;
export const PROJECT_REVISION_CONTINUATION_VERSION =
  "project-revision-continuation-v1" as const;

export const ProjectRevisionCandidateIdSchema = z
  .string()
  .regex(/^revision-candidate-[0-9a-f]{64}$/u)
  .brand<"ProjectRevisionCandidateId">();

export const ProjectRevisionSnapshotLogicalPathSchema = z
  .string()
  .min(1)
  .max(1_024)
  .refine(
    (value) =>
      !value.startsWith("/") &&
      !value.endsWith("/") &&
      !value.includes("\0") &&
      !value.includes("\\") &&
      value
        .split("/")
        .every(
          (segment) => segment !== "" && segment !== "." && segment !== "..",
        ),
    "Project revision snapshot paths must be contained POSIX-relative paths.",
  );

export const PROJECT_REVISION_SECTION_NAMES = [
  "brief",
  "globalVisual",
  "publishing",
  "scenes",
  "story",
  "visualStyle",
] as const;

export const ProjectRevisionSectionNameSchema = z.enum(
  PROJECT_REVISION_SECTION_NAMES,
);

const ProjectRevisionPatchObject = z
  .object({
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
  })
  .strict();

export const ProjectRevisionPatchSchema =
  ProjectRevisionPatchObject.superRefine((patch, context) => {
    if (
      PROJECT_REVISION_SECTION_NAMES.every(
        (section) => patch[section] === undefined,
      )
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Project revision patch must include at least one authored section.",
      });
    }
    const sceneMeaningIds = patch.scenes?.map(({ meaningId }) => meaningId);
    if (
      sceneMeaningIds !== undefined &&
      new Set(sceneMeaningIds).size !== sceneMeaningIds.length
    ) {
      context.addIssue({
        code: "custom",
        message: "Project revision Scene identities must be unique.",
        path: ["scenes"],
      });
    }
  }).readonly();

export const ProjectRevisionInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    contractVersion: z.literal(PROJECT_REVISION_INPUT_VERSION),
    storyId: StoryIdSchema,
    baseRevisionId: ProductionRevisionIdSchema,
    baseDeliveryBuildId: DeliveryBuildIdSchema,
    patch: ProjectRevisionPatchSchema,
  })
  .strict()
  .superRefine((input, context) => {
    const sectionStoryIds = [
      ["brief", input.patch.brief?.storyId],
      ["story", input.patch.story?.storyId],
    ] as const;
    for (const [section, sectionStoryId] of sectionStoryIds) {
      if (sectionStoryId !== undefined && sectionStoryId !== input.storyId) {
        context.addIssue({
          code: "custom",
          message:
            "Project revision sections must belong to the selected Project.",
          path: ["patch", section, "storyId"],
        });
      }
    }
  })
  .readonly();

export const ProjectRevisionEditableAuthoringSchema = z
  .object({
    brief: VideoBriefSchema,
    story: ProjectCreateStorySchema,
    visualStyle: ProjectCreateVisualStyleSchema,
    scenes: z.array(SceneProductionBriefItemSchema).min(1).max(256).readonly(),
    globalVisual: ProjectCreateGlobalVisualSchema,
    publishing: AuthoredPublishingIntentSchema,
  })
  .strict()
  .superRefine((authoring, context) => {
    if (authoring.brief.storyId !== authoring.story.storyId) {
      context.addIssue({
        code: "custom",
        message:
          "Project revision editable authoring must belong to one Story.",
        path: ["story"],
      });
    }
    const meaningIds = authoring.story.beats.map(({ meaningId }) => meaningId);
    if (
      authoring.scenes.length !== meaningIds.length ||
      authoring.scenes.some(
        ({ meaningId }, index) => meaningId !== meaningIds[index],
      )
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Project revision editable Scenes must cover narrated beats in order.",
        path: ["scenes"],
      });
    }
    if (
      authoring.publishing.chapters.length !== meaningIds.length ||
      authoring.publishing.chapters.some(
        ({ meaningId }, index) => meaningId !== meaningIds[index],
      )
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Project revision publishing chapters must cover narrated beats in order.",
        path: ["publishing", "chapters"],
      });
    }
  })
  .readonly();

export const ProjectRevisionContextSchema = z
  .object({
    schemaVersion: z.literal(1),
    contractVersion: z.literal(PROJECT_REVISION_CONTEXT_VERSION),
    status: z.literal("project-revision-context"),
    storyId: StoryIdSchema,
    baseRevisionId: ProductionRevisionIdSchema,
    baseDeliveryBuildId: DeliveryBuildIdSchema,
    editable: ProjectRevisionEditableAuthoringSchema,
    constraints: z
      .object({
        sameProject: z.literal(true),
        preserveNarratedMeaningIdsAndOrder: z.literal(true),
        preserveBoundaryScenes: z.literal(true),
        currentDeliveryRemainsUntilPromotion: z.literal(true),
      })
      .strict()
      .readonly(),
  })
  .strict()
  .superRefine((revisionContext, context) => {
    if (revisionContext.editable.story.storyId !== revisionContext.storyId) {
      context.addIssue({
        code: "custom",
        message: "Project revision context Story identity is stale.",
        path: ["editable", "story", "storyId"],
      });
    }
  })
  .readonly();

const validateCanonicalSections = (
  sections: readonly string[],
  context: z.RefinementCtx,
) => {
  const canonical = PROJECT_REVISION_SECTION_NAMES.filter((section) =>
    sections.includes(section),
  );
  if (
    canonical.length !== sections.length ||
    canonical.some((section, index) => section !== sections[index])
  ) {
    context.addIssue({
      code: "custom",
      message: "Project revision changed sections must be canonical.",
      path: ["changedSections"],
    });
  }
};

export const ProjectRevisionValidationResultSchema = z
  .object({
    schemaVersion: z.literal(1),
    contractVersion: z.literal(PROJECT_REVISION_INPUT_VERSION),
    status: z.literal("project-revision-valid"),
    storyId: StoryIdSchema,
    candidateId: ProjectRevisionCandidateIdSchema,
    baseRevisionId: ProductionRevisionIdSchema,
    baseDeliveryBuildId: DeliveryBuildIdSchema,
    changedSections: z
      .array(ProjectRevisionSectionNameSchema)
      .min(1)
      .max(PROJECT_REVISION_SECTION_NAMES.length)
      .readonly(),
  })
  .strict()
  .superRefine((result, context) =>
    validateCanonicalSections(result.changedSections, context),
  )
  .readonly();

const ProjectRevisionTupleSchema = z
  .object({
    revisionId: ProductionRevisionIdSchema,
    deliveryBuildId: DeliveryBuildIdSchema,
  })
  .strict()
  .readonly();

const ProjectRevisionProductionResultSchema = z
  .object({
    status: z.enum([
      "project-production-complete",
      "project-production-current",
    ]),
    attemptId: z.string().uuid(),
    state: z.literal("succeeded"),
    deliveryStatus: z.literal("verified"),
    revisionId: ProductionRevisionIdSchema,
    deliveryBuildId: DeliveryBuildIdSchema,
  })
  .strict()
  .readonly();

const ProjectRevisionContinuationShape = {
  schemaVersion: z.literal(1),
  contractVersion: z.literal(PROJECT_REVISION_CONTINUATION_VERSION),
  storyId: StoryIdSchema,
  candidateId: ProjectRevisionCandidateIdSchema,
  base: ProjectRevisionTupleSchema,
  expected: ProjectRevisionTupleSchema,
  production: ProjectRevisionProductionResultSchema,
} as const;

const SafeProjectRevisionPromotionFailureMessageSchema = z
  .string()
  .trim()
  .min(1)
  .max(240)
  .refine(
    (message) =>
      !/(?:\/[\w.-]+\/|Bearer\s|token|endpoint|https?:|\bstack\b|\bcause\b)/iu.test(
        message,
      ),
    "Project revision promotion failures must contain safe fixed text only.",
  );

export const buildProjectRevisionPromotionRetryCommand = ({
  storyId,
  candidateId,
  expectedRevisionId,
  expectedDeliveryBuildId,
}: {
  readonly storyId: string;
  readonly candidateId: string;
  readonly expectedRevisionId: string;
  readonly expectedDeliveryBuildId: string;
}) =>
  `npm run project:revision:promote -- --project ${StoryIdSchema.parse(storyId)} --candidate ${ProjectRevisionCandidateIdSchema.parse(candidateId)} --revision ${ProductionRevisionIdSchema.parse(expectedRevisionId)} --delivery ${DeliveryBuildIdSchema.parse(expectedDeliveryBuildId)}`;

const validateProjectRevisionContinuationBinding = (
  result: {
    readonly expected: {
      readonly revisionId: string;
      readonly deliveryBuildId: string;
    };
    readonly production: {
      readonly revisionId: string;
      readonly deliveryBuildId: string;
    };
  },
  context: z.RefinementCtx,
) => {
  if (
    result.production.revisionId !== result.expected.revisionId ||
    result.production.deliveryBuildId !== result.expected.deliveryBuildId
  ) {
    context.addIssue({
      code: "custom",
      message:
        "Project revision production result must match the expected promotion tuple.",
      path: ["production"],
    });
  }
};

export const ProjectRevisionCompleteResultSchema = z
  .object({
    ...ProjectRevisionContinuationShape,
    status: z.literal("project-revision-complete"),
    promotion: z
      .object({
        status: z.enum([
          "project-revision-promoted",
          "project-revision-current",
        ]),
      })
      .strict()
      .readonly(),
  })
  .strict()
  .superRefine(validateProjectRevisionContinuationBinding)
  .readonly();

export const ProjectRevisionPromotionPendingResultSchema = z
  .object({
    ...ProjectRevisionContinuationShape,
    status: z.literal("project-revision-promotion-pending"),
    promotion: z
      .object({
        status: z.literal("project-revision-promotion-failed"),
        failure: z
          .object({
            code: z.literal("project-revision-promotion-failed"),
            message: SafeProjectRevisionPromotionFailureMessageSchema,
          })
          .strict()
          .readonly(),
      })
      .strict()
      .readonly(),
    retryCommand: z.string().min(1).max(1_024),
  })
  .strict()
  .superRefine((result, context) => {
    validateProjectRevisionContinuationBinding(result, context);
    const expectedRetryCommand = buildProjectRevisionPromotionRetryCommand({
      storyId: result.storyId,
      candidateId: result.candidateId,
      expectedRevisionId: result.expected.revisionId,
      expectedDeliveryBuildId: result.expected.deliveryBuildId,
    });
    if (result.retryCommand !== expectedRetryCommand) {
      context.addIssue({
        code: "custom",
        message: "Project revision promotion retry command is stale.",
        path: ["retryCommand"],
      });
    }
  })
  .readonly();

export const ProjectRevisionContinuationResultSchema = z.discriminatedUnion(
  "status",
  [
    ProjectRevisionCompleteResultSchema,
    ProjectRevisionPromotionPendingResultSchema,
  ],
);

export const ProjectRevisionMaterializationRecordSchema = z
  .object({
    schemaVersion: z.literal(1),
    contractVersion: z.literal(PROJECT_REVISION_MATERIALIZATION_VERSION),
    storyId: StoryIdSchema,
    candidateId: ProjectRevisionCandidateIdSchema,
    baseRevisionId: ProductionRevisionIdSchema,
    baseDeliveryBuildId: DeliveryBuildIdSchema,
    changedSections: z
      .array(ProjectRevisionSectionNameSchema)
      .min(1)
      .max(PROJECT_REVISION_SECTION_NAMES.length)
      .readonly(),
    authoringFingerprint: Sha256DigestSchema,
    authoringFiles: z
      .array(
        z
          .object({
            logicalPath: ProjectRevisionSnapshotLogicalPathSchema,
            checksum: Sha256DigestSchema,
            sizeBytes: NonNegativeIntegerSchema,
          })
          .strict()
          .readonly(),
      )
      .min(1)
      .max(64)
      .readonly(),
  })
  .strict()
  .superRefine((record, context) => {
    validateCanonicalSections(record.changedSections, context);
    const paths = record.authoringFiles.map(({ logicalPath }) => logicalPath);
    const canonical = [...paths].sort((left, right) =>
      left.localeCompare(right),
    );
    if (
      new Set(paths).size !== paths.length ||
      paths.some((path, index) => path !== canonical[index])
    ) {
      context.addIssue({
        code: "custom",
        message: "Project revision authoring files must be sorted and unique.",
        path: ["authoringFiles"],
      });
    }
  })
  .readonly();

export const computeProjectRevisionAuthoringFingerprint = (rawInput: unknown) =>
  createFingerprint({
    namespace: "project-revision-authoring",
    version: 1,
    value: ProjectRevisionEditableAuthoringSchema.parse(rawInput),
  });

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

export const PROJECT_REVISION_BASE_SNAPSHOT_SCOPES = [
  "delivery",
  "narration",
  "public",
  "source",
] as const;

export const ProjectRevisionBaseSnapshotScopeSchema = z.enum(
  PROJECT_REVISION_BASE_SNAPSHOT_SCOPES,
);

const ProjectRevisionSnapshotDirectoryEntrySchema = z
  .object({
    logicalPath: ProjectRevisionSnapshotLogicalPathSchema,
    kind: z.literal("directory"),
  })
  .strict()
  .readonly();

const ProjectRevisionSnapshotFileEntrySchema = z
  .object({
    logicalPath: ProjectRevisionSnapshotLogicalPathSchema,
    kind: z.literal("file"),
    checksum: Sha256DigestSchema,
    sizeBytes: NonNegativeIntegerSchema,
  })
  .strict()
  .readonly();

export const ProjectRevisionSnapshotEntrySchema = z.discriminatedUnion("kind", [
  ProjectRevisionSnapshotDirectoryEntrySchema,
  ProjectRevisionSnapshotFileEntrySchema,
]);

const validateSortedUniqueLogicalPaths = (
  entries: readonly { readonly logicalPath: string }[],
  context: z.RefinementCtx,
) => {
  const paths = entries.map(({ logicalPath }) => logicalPath);
  const sorted = [...paths].sort((left, right) => left.localeCompare(right));
  if (
    new Set(paths).size !== paths.length ||
    paths.some((path, index) => path !== sorted[index])
  ) {
    context.addIssue({
      code: "custom",
      message: "Project revision snapshot entries must be sorted and unique.",
      path: ["entries"],
    });
  }
};

const ProjectRevisionBaseTreeShape = {
  scope: ProjectRevisionBaseSnapshotScopeSchema,
  entries: z.array(ProjectRevisionSnapshotEntrySchema).readonly(),
} as const;

const ProjectRevisionBaseTreeIdentitySchema = z
  .object(ProjectRevisionBaseTreeShape)
  .strict()
  .superRefine((tree, context) =>
    validateSortedUniqueLogicalPaths(tree.entries, context),
  )
  .readonly();

const computeProjectRevisionBaseTreeFingerprint = (rawTree: unknown) =>
  createFingerprint({
    namespace: "project-revision-base-tree",
    version: 1,
    value: ProjectRevisionBaseTreeIdentitySchema.parse(rawTree),
  });

export const ProjectRevisionBaseTreeSchema = z
  .object({
    ...ProjectRevisionBaseTreeShape,
    treeFingerprint: Sha256DigestSchema,
  })
  .strict()
  .superRefine((tree, context) => {
    validateSortedUniqueLogicalPaths(tree.entries, context);
    const { treeFingerprint, ...identity } = tree;
    if (
      treeFingerprint !== computeProjectRevisionBaseTreeFingerprint(identity)
    ) {
      context.addIssue({
        code: "custom",
        message: "Project revision base tree fingerprint is stale.",
        path: ["treeFingerprint"],
      });
    }
  })
  .readonly();

const ProjectRevisionBaseSnapshotShape = {
  schemaVersion: z.literal(1),
  contractVersion: z.literal(PROJECT_REVISION_BASE_SNAPSHOT_VERSION),
  storyId: StoryIdSchema,
  baseRevisionId: ProductionRevisionIdSchema,
  baseDeliveryBuildId: DeliveryBuildIdSchema,
  trees: z.array(ProjectRevisionBaseTreeSchema).length(4).readonly(),
} as const;

const validateBaseSnapshotScopes = (
  snapshot: { readonly trees: readonly { readonly scope: string }[] },
  context: z.RefinementCtx,
) => {
  const scopes = snapshot.trees.map(({ scope }) => scope);
  if (
    scopes.some(
      (scope, index) => scope !== PROJECT_REVISION_BASE_SNAPSHOT_SCOPES[index],
    )
  ) {
    context.addIssue({
      code: "custom",
      message:
        "Project revision base snapshot must contain every scope in canonical order.",
      path: ["trees"],
    });
  }
};

const ProjectRevisionBaseSnapshotIdentitySchema = z
  .object(ProjectRevisionBaseSnapshotShape)
  .strict()
  .superRefine(validateBaseSnapshotScopes)
  .readonly();

const computeProjectRevisionBaseSnapshotFingerprint = (rawSnapshot: unknown) =>
  createFingerprint({
    namespace: "project-revision-base-snapshot",
    version: 1,
    value: ProjectRevisionBaseSnapshotIdentitySchema.parse(rawSnapshot),
  });

export const ProjectRevisionBaseSnapshotSchema = z
  .object({
    ...ProjectRevisionBaseSnapshotShape,
    snapshotFingerprint: Sha256DigestSchema,
  })
  .strict()
  .superRefine((snapshot, context) => {
    validateBaseSnapshotScopes(snapshot, context);
    const { snapshotFingerprint, ...identity } = snapshot;
    if (
      snapshotFingerprint !==
      computeProjectRevisionBaseSnapshotFingerprint(identity)
    ) {
      context.addIssue({
        code: "custom",
        message: "Project revision base snapshot fingerprint is stale.",
        path: ["snapshotFingerprint"],
      });
    }
  })
  .readonly();

export const ProjectRevisionCandidateRecordSchema = z
  .object({
    schemaVersion: z.literal(1),
    contractVersion: z.literal(PROJECT_REVISION_CANDIDATE_RECORD_VERSION),
    candidateId: ProjectRevisionCandidateIdSchema,
    input: ProjectRevisionInputSchema,
    patchedSections: z
      .array(ProjectRevisionSectionNameSchema)
      .min(1)
      .max(PROJECT_REVISION_SECTION_NAMES.length)
      .readonly(),
    baseSnapshot: ProjectRevisionBaseSnapshotSchema,
  })
  .strict()
  .superRefine((record, context) => {
    if (
      record.candidateId !== computeProjectRevisionCandidateId(record.input)
    ) {
      context.addIssue({
        code: "custom",
        message: "Project revision candidate identity is stale.",
        path: ["candidateId"],
      });
    }
    const expectedSections = PROJECT_REVISION_SECTION_NAMES.filter(
      (section) => record.input.patch[section] !== undefined,
    );
    if (
      record.patchedSections.length !== expectedSections.length ||
      record.patchedSections.some(
        (section, index) => section !== expectedSections[index],
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "Project revision patched sections are stale.",
        path: ["patchedSections"],
      });
    }
    const snapshot = record.baseSnapshot;
    if (
      snapshot.storyId !== record.input.storyId ||
      snapshot.baseRevisionId !== record.input.baseRevisionId ||
      snapshot.baseDeliveryBuildId !== record.input.baseDeliveryBuildId
    ) {
      context.addIssue({
        code: "custom",
        message: "Project revision base snapshot binding is stale.",
        path: ["baseSnapshot"],
      });
    }
  })
  .readonly();

export const buildProjectRevisionCandidateRecord = ({
  input: rawInput,
  baseTrees: rawBaseTrees,
}: {
  readonly input: unknown;
  readonly baseTrees: readonly {
    readonly scope: z.infer<typeof ProjectRevisionBaseSnapshotScopeSchema>;
    readonly entries: readonly z.infer<
      typeof ProjectRevisionSnapshotEntrySchema
    >[];
  }[];
}) => {
  const input = ProjectRevisionInputSchema.parse(rawInput);
  const trees = PROJECT_REVISION_BASE_SNAPSHOT_SCOPES.map((scope) => {
    const matches = rawBaseTrees.filter((tree) => tree.scope === scope);
    if (matches.length !== 1) {
      throw new Error(
        "Project revision base snapshot requires every scope exactly once.",
      );
    }
    const identity = ProjectRevisionBaseTreeIdentitySchema.parse({
      scope,
      entries: matches[0]?.entries,
    });
    return ProjectRevisionBaseTreeSchema.parse({
      ...identity,
      treeFingerprint: computeProjectRevisionBaseTreeFingerprint(identity),
    });
  });
  const baseSnapshotIdentity = ProjectRevisionBaseSnapshotIdentitySchema.parse({
    schemaVersion: 1,
    contractVersion: PROJECT_REVISION_BASE_SNAPSHOT_VERSION,
    storyId: input.storyId,
    baseRevisionId: input.baseRevisionId,
    baseDeliveryBuildId: input.baseDeliveryBuildId,
    trees,
  });
  const baseSnapshot = ProjectRevisionBaseSnapshotSchema.parse({
    ...baseSnapshotIdentity,
    snapshotFingerprint:
      computeProjectRevisionBaseSnapshotFingerprint(baseSnapshotIdentity),
  });
  return ProjectRevisionCandidateRecordSchema.parse({
    schemaVersion: 1,
    contractVersion: PROJECT_REVISION_CANDIDATE_RECORD_VERSION,
    candidateId: computeProjectRevisionCandidateId(input),
    input,
    patchedSections: PROJECT_REVISION_SECTION_NAMES.filter(
      (section) => input.patch[section] !== undefined,
    ),
    baseSnapshot,
  });
};

export type ProjectRevisionCandidateId = z.infer<
  typeof ProjectRevisionCandidateIdSchema
>;
export type ProjectRevisionSectionName = z.infer<
  typeof ProjectRevisionSectionNameSchema
>;
export type ProjectRevisionInput = z.infer<typeof ProjectRevisionInputSchema>;
export type ProjectRevisionCandidateRecord = z.infer<
  typeof ProjectRevisionCandidateRecordSchema
>;
export type ProjectRevisionBaseSnapshot = z.infer<
  typeof ProjectRevisionBaseSnapshotSchema
>;
export type ProjectRevisionSnapshotEntry = z.infer<
  typeof ProjectRevisionSnapshotEntrySchema
>;
export type ProjectRevisionContinuationResult = z.infer<
  typeof ProjectRevisionContinuationResultSchema
>;

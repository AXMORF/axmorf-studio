import { z } from "zod";

import { createFingerprint } from "./fingerprint";
import {
  CompositionIdSchema,
  MeaningIdSchema,
  NonNegativeIntegerSchema,
  PositiveIntegerSchema,
  Sha256DigestSchema,
  StoryIdSchema,
} from "./primitives";
import { ProductionErrorSchema, ProductionRunIdSchema } from "./production-run";
import {
  ResourceIdSchema,
  SelectedResourceRefSchema,
} from "./resource-catalog";

export const GLOBAL_VISUAL_BRIEF_VERSION = "global-visual-brief-v1" as const;
export const GLOBAL_VISUAL_ASSIGNMENT_VERSION =
  "global-visual-assignment-v1" as const;
export const GLOBAL_VISUAL_PACKAGE_VERSION =
  "global-visual-package-v1" as const;
export const GLOBAL_VISUAL_PRODUCTION_RESULT_VERSION =
  "global-visual-production-result-v1" as const;

const SafeTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(1_600)
  .refine(
    (value) =>
      !/(?:Bearer\s|https?:\/\/|(?:^|\s)\/(?:home|data|tmp)\/|[A-Za-z]:\\|\b(?:token|secret|private[-_ ]?config|provider[-_ ]?endpoint)\b)/iu.test(
        value,
      ),
    "GlobalVisual text must not contain private or remote diagnostics.",
  );

const StableIntentIdSchema = z
  .string()
  .min(1)
  .max(96)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const InsetsSchema = z
  .object({
    top: NonNegativeIntegerSchema,
    right: NonNegativeIntegerSchema,
    bottom: NonNegativeIntegerSchema,
    left: NonNegativeIntegerSchema,
  })
  .strict()
  .readonly();

const GlobalVisualBriefInputObject = z
  .object({
    schemaVersion: z.literal(1),
    contractVersion: z.literal(GLOBAL_VISUAL_BRIEF_VERSION),
    storyId: StoryIdSchema,
    responsibility: z.literal(
      "project-global-background-texture-decoration-continuity-v1",
    ),
    visualIntent: z
      .array(
        z
          .object({
            intentId: StableIntentIdSchema,
            description: SafeTextSchema,
            appliesTo: z.enum(["full-composition", "frozen-frame-windows"]),
          })
          .strict()
          .readonly(),
      )
      .min(1)
      .max(64)
      .readonly(),
    constraints: z
      .object({
        captionOwner: z.literal("caption-layer"),
        sceneSemanticOwner: z.literal("scene-package"),
        visibleText: z.literal("forbidden"),
        motion: z.literal("remotion-frame-api-only"),
        runtimeExternalAccess: z.literal("forbidden"),
        genericDsl: z.literal("forbidden"),
      })
      .strict()
      .readonly(),
  })
  .strict()
  .superRefine((brief, context) => {
    const ids = brief.visualIntent.map(({ intentId }) => intentId);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        message: "GlobalVisual intent IDs must be unique.",
        path: ["visualIntent"],
      });
    }
  });

export const GlobalVisualBriefInputSchema =
  GlobalVisualBriefInputObject.readonly();

export const computeGlobalVisualBriefFingerprint = (rawInput: unknown) => {
  const record = { ...(rawInput as Record<string, unknown>) };
  delete record.briefFingerprint;
  const input = GlobalVisualBriefInputSchema.parse(record);
  return createFingerprint({
    namespace: "global-visual-brief",
    version: 1,
    value: input,
  });
};

export const GlobalVisualBriefSchema = GlobalVisualBriefInputObject.extend({
  briefFingerprint: Sha256DigestSchema,
})
  .strict()
  .superRefine((brief, context) => {
    const { briefFingerprint, ...input } = brief;
    if (briefFingerprint !== computeGlobalVisualBriefFingerprint(input)) {
      context.addIssue({
        code: "custom",
        message: "GlobalVisualBrief fingerprint is stale.",
        path: ["briefFingerprint"],
      });
    }
  })
  .readonly();

export const buildGlobalVisualBrief = (rawInput: unknown) => {
  const record: Record<string, unknown> = {
    ...(rawInput as Record<string, unknown>),
    schemaVersion: 1,
    contractVersion: GLOBAL_VISUAL_BRIEF_VERSION,
  };
  delete record.briefFingerprint;
  const input = GlobalVisualBriefInputSchema.parse(record);
  return GlobalVisualBriefSchema.parse({
    ...input,
    briefFingerprint: computeGlobalVisualBriefFingerprint(input),
  });
};

const StoryBeatWindowSchema = z
  .object({
    meaningId: MeaningIdSchema,
    startFrame: NonNegativeIntegerSchema,
    endFrame: PositiveIntegerSchema,
  })
  .strict()
  .refine((window) => window.endFrame > window.startFrame, {
    message: "GlobalVisual StoryBeat windows must be non-empty.",
  })
  .readonly();

const GlobalVisualAssignmentInputObject = z
  .object({
    schemaVersion: z.literal(1),
    contractVersion: z.literal(GLOBAL_VISUAL_ASSIGNMENT_VERSION),
    runId: ProductionRunIdSchema,
    storyId: StoryIdSchema,
    compositionId: CompositionIdSchema,
    requirementsFingerprint: Sha256DigestSchema,
    globalVisualBriefFingerprint: Sha256DigestSchema,
    storyFingerprint: Sha256DigestSchema,
    renderFingerprint: Sha256DigestSchema,
    semanticTimingFingerprint: Sha256DigestSchema,
    visualStyleFingerprint: Sha256DigestSchema,
    resourceCatalogFingerprint: Sha256DigestSchema,
    resourcePoolFingerprint: Sha256DigestSchema,
    readabilityPolicyFingerprint: Sha256DigestSchema,
    timeline: z
      .object({
        fps: PositiveIntegerSchema,
        width: PositiveIntegerSchema,
        height: PositiveIntegerSchema,
        durationInFrames: PositiveIntegerSchema,
        captionSafeArea: InsetsSchema,
        storyBeatWindows: z
          .array(StoryBeatWindowSchema)
          .min(1)
          .max(256)
          .readonly(),
      })
      .strict()
      .readonly(),
    allowedResourceIds: z.array(ResourceIdSchema).max(256).readonly(),
    exclusivePaths: z
      .object({
        plan: z.string(),
        sourceDirectory: z.string(),
        publicDirectory: z.string(),
      })
      .strict()
      .readonly(),
    deadlineAt: z.string().datetime({ offset: true }),
  })
  .strict()
  .superRefine((assignment, context) => {
    const expectedPaths = {
      plan: `src/projects/${assignment.storyId}/global-visual-plan.json`,
      sourceDirectory: `src/projects/${assignment.storyId}/global-visual`,
      publicDirectory: `public/projects/${assignment.storyId}/global-visual`,
    };
    for (const [key, expected] of Object.entries(expectedPaths)) {
      if (
        assignment.exclusivePaths[
          key as keyof typeof assignment.exclusivePaths
        ] !== expected
      ) {
        context.addIssue({
          code: "custom",
          message: "GlobalVisual assignment paths must be story-exclusive.",
          path: ["exclusivePaths", key],
        });
      }
    }
    const resourceIds = assignment.allowedResourceIds;
    if (
      new Set(resourceIds).size !== resourceIds.length ||
      resourceIds.some((value, index) =>
        index === 0 ? false : value.localeCompare(resourceIds[index - 1]!) < 0,
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "GlobalVisual allowed resources must be unique and sorted.",
        path: ["allowedResourceIds"],
      });
    }
    const windows = assignment.timeline.storyBeatWindows;
    windows.forEach((window, index) => {
      if (
        window.endFrame > assignment.timeline.durationInFrames ||
        (index > 0 && window.startFrame !== windows[index - 1]!.endFrame)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "GlobalVisual StoryBeat windows must be ordered contiguous timing summaries.",
          path: ["timeline", "storyBeatWindows", index],
        });
      }
    });
    const meaningIds = windows.map(({ meaningId }) => meaningId);
    if (new Set(meaningIds).size !== meaningIds.length) {
      context.addIssue({
        code: "custom",
        message: "GlobalVisual StoryBeat windows must have unique meaning IDs.",
        path: ["timeline", "storyBeatWindows"],
      });
    }
  });

export const GlobalVisualAssignmentInputSchema =
  GlobalVisualAssignmentInputObject.readonly();

export const computeGlobalVisualAssignmentFingerprint = (rawInput: unknown) => {
  const record = { ...(rawInput as Record<string, unknown>) };
  delete record.assignmentFingerprint;
  const input = GlobalVisualAssignmentInputSchema.parse(record);
  return createFingerprint({
    namespace: "global-visual-assignment",
    version: 1,
    value: input,
  });
};

export const GlobalVisualAssignmentSchema =
  GlobalVisualAssignmentInputObject.extend({
    assignmentFingerprint: Sha256DigestSchema,
  })
    .strict()
    .superRefine((assignment, context) => {
      const { assignmentFingerprint, ...input } = assignment;
      if (
        assignmentFingerprint !==
        computeGlobalVisualAssignmentFingerprint(input)
      ) {
        context.addIssue({
          code: "custom",
          message: "GlobalVisualAssignment fingerprint is stale.",
          path: ["assignmentFingerprint"],
        });
      }
    })
    .readonly();

export const buildGlobalVisualAssignment = (rawInput: unknown) => {
  const record: Record<string, unknown> = {
    ...(rawInput as Record<string, unknown>),
    schemaVersion: 1,
    contractVersion: GLOBAL_VISUAL_ASSIGNMENT_VERSION,
  };
  delete record.assignmentFingerprint;
  const input = GlobalVisualAssignmentInputSchema.parse(record);
  return GlobalVisualAssignmentSchema.parse({
    ...input,
    assignmentFingerprint: computeGlobalVisualAssignmentFingerprint(input),
  });
};

const GlobalVisualPackageInputObject = z
  .object({
    schemaVersion: z.literal(1),
    contractVersion: z.literal(GLOBAL_VISUAL_PACKAGE_VERSION),
    storyId: StoryIdSchema,
    compositionId: CompositionIdSchema,
    assignmentFingerprint: Sha256DigestSchema,
    requirementsFingerprint: Sha256DigestSchema,
    semanticTimingFingerprint: Sha256DigestSchema,
    visualStyleFingerprint: Sha256DigestSchema,
    readabilityPolicyFingerprint: Sha256DigestSchema,
    globalVisualPlanFingerprint: Sha256DigestSchema,
    rendererId: z.literal("project-global-visual"),
    rendererSourceGraphFingerprint: Sha256DigestSchema,
    selectedResources: z.array(SelectedResourceRefSchema).max(128).readonly(),
    selectedResourcesFingerprint: Sha256DigestSchema,
  })
  .strict();

const computeSelectedResourcesFingerprint = (resources: unknown) =>
  createFingerprint({
    namespace: "global-visual-selected-resources",
    version: 1,
    value: z.array(SelectedResourceRefSchema).max(128).parse(resources),
  });

export const GlobalVisualPackageInputSchema =
  GlobalVisualPackageInputObject.superRefine((globalVisualPackage, context) => {
    if (
      globalVisualPackage.selectedResourcesFingerprint !==
      computeSelectedResourcesFingerprint(globalVisualPackage.selectedResources)
    ) {
      context.addIssue({
        code: "custom",
        message: "GlobalVisual selected resources fingerprint is stale.",
        path: ["selectedResourcesFingerprint"],
      });
    }
  }).readonly();

export const computeGlobalVisualPackageFingerprint = (rawInput: unknown) => {
  const record = { ...(rawInput as Record<string, unknown>) };
  delete record.packageFingerprint;
  const input = GlobalVisualPackageInputSchema.parse(record);
  return createFingerprint({
    namespace: "global-visual-package",
    version: 1,
    value: input,
  });
};

export const GlobalVisualPackageSchema = GlobalVisualPackageInputObject.extend({
  packageFingerprint: Sha256DigestSchema,
})
  .strict()
  .superRefine((globalVisualPackage, context) => {
    const { packageFingerprint, ...input } = globalVisualPackage;
    const parsed = GlobalVisualPackageInputSchema.safeParse(input);
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
      packageFingerprint !== computeGlobalVisualPackageFingerprint(parsed.data)
    ) {
      context.addIssue({
        code: "custom",
        message: "GlobalVisualPackage fingerprint is stale.",
        path: ["packageFingerprint"],
      });
    }
  })
  .readonly();

export const buildGlobalVisualPackage = (rawInput: unknown) => {
  const record: Record<string, unknown> = {
    ...(rawInput as Record<string, unknown>),
    schemaVersion: 1,
    contractVersion: GLOBAL_VISUAL_PACKAGE_VERSION,
  };
  delete record.packageFingerprint;
  record.selectedResourcesFingerprint = computeSelectedResourcesFingerprint(
    record.selectedResources,
  );
  const input = GlobalVisualPackageInputSchema.parse(record);
  return GlobalVisualPackageSchema.parse({
    ...input,
    packageFingerprint: computeGlobalVisualPackageFingerprint(input),
  });
};

const GlobalVisualResultCommonShape = {
  schemaVersion: z.literal(1),
  contractVersion: z.literal(GLOBAL_VISUAL_PRODUCTION_RESULT_VERSION),
  runId: ProductionRunIdSchema,
  storyId: StoryIdSchema,
  assignmentFingerprint: Sha256DigestSchema,
  requirementsFingerprint: Sha256DigestSchema,
} as const;

const GlobalVisualSuccessInputObject = z
  .object({
    ...GlobalVisualResultCommonShape,
    status: z.literal("success"),
    globalVisualPackage: z
      .object({
        repositoryPath: z.string(),
        packageFingerprint: Sha256DigestSchema,
      })
      .strict()
      .readonly(),
    globalVisualPlanFingerprint: Sha256DigestSchema,
    rendererSourceGraphFingerprint: Sha256DigestSchema,
    selectedResourcesFingerprint: Sha256DigestSchema,
    mechanicalCheckFingerprint: Sha256DigestSchema,
  })
  .strict();

const GlobalVisualFailureInputObject = z
  .object({
    ...GlobalVisualResultCommonShape,
    status: z.literal("failure"),
    error: ProductionErrorSchema,
  })
  .strict();

const GlobalVisualProductionResultInputUnion = z
  .discriminatedUnion("status", [
    GlobalVisualSuccessInputObject,
    GlobalVisualFailureInputObject,
  ])
  .superRefine((result, context) => {
    if (result.status === "success") {
      const expected = `src/projects/${result.storyId}/global-visual/generated/global-visual-package.generated.json`;
      if (result.globalVisualPackage.repositoryPath !== expected) {
        context.addIssue({
          code: "custom",
          message: "GlobalVisual result package path is not story-local.",
          path: ["globalVisualPackage", "repositoryPath"],
        });
      }
    } else if (
      result.error.scope !== "global-visual" ||
      result.error.stageId !== "scenes" ||
      result.error.meaningId !== null
    ) {
      context.addIssue({
        code: "custom",
        message: "GlobalVisual failure must carry a GlobalVisual-scoped error.",
        path: ["error"],
      });
    }
  });

export const GlobalVisualProductionResultInputSchema =
  GlobalVisualProductionResultInputUnion.readonly();

export const computeGlobalVisualProductionResultFingerprint = (
  rawInput: unknown,
) => {
  const record = { ...(rawInput as Record<string, unknown>) };
  delete record.resultFingerprint;
  const input = GlobalVisualProductionResultInputSchema.parse(record);
  return createFingerprint({
    namespace: "global-visual-production-result",
    version: 1,
    value: input,
  });
};

export const GlobalVisualProductionResultSchema = z
  .union([
    GlobalVisualSuccessInputObject.extend({
      resultFingerprint: Sha256DigestSchema,
    }).strict(),
    GlobalVisualFailureInputObject.extend({
      resultFingerprint: Sha256DigestSchema,
    }).strict(),
  ])
  .superRefine((result, context) => {
    const { resultFingerprint, ...input } = result;
    const parsed = GlobalVisualProductionResultInputSchema.safeParse(input);
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
      resultFingerprint !==
      computeGlobalVisualProductionResultFingerprint(parsed.data)
    ) {
      context.addIssue({
        code: "custom",
        message: "GlobalVisualProductionResult fingerprint is stale.",
        path: ["resultFingerprint"],
      });
    }
  })
  .readonly();

export const buildGlobalVisualProductionResult = (rawInput: unknown) => {
  const record: Record<string, unknown> = {
    ...(rawInput as Record<string, unknown>),
    schemaVersion: 1,
    contractVersion: GLOBAL_VISUAL_PRODUCTION_RESULT_VERSION,
  };
  delete record.resultFingerprint;
  const input = GlobalVisualProductionResultInputSchema.parse(record);
  return GlobalVisualProductionResultSchema.parse({
    ...input,
    resultFingerprint: computeGlobalVisualProductionResultFingerprint(input),
  });
};

export type GlobalVisualBrief = z.infer<typeof GlobalVisualBriefSchema>;
export type GlobalVisualAssignment = z.infer<
  typeof GlobalVisualAssignmentSchema
>;
export type GlobalVisualPackage = z.infer<typeof GlobalVisualPackageSchema>;
export type GlobalVisualProductionResult = z.infer<
  typeof GlobalVisualProductionResultSchema
>;

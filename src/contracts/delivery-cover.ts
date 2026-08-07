import { z } from "zod";

import { createFingerprint } from "./fingerprint";
import { computeStoryFingerprint } from "./generation-input";
import {
  CompositionIdSchema,
  PositiveIntegerSchema,
  Sha256DigestSchema,
  StoryIdSchema,
} from "./primitives";
import { StorySpecSchema } from "./story";
import { VisualStyleSpecSchema } from "./visual-style";

export const COVER_SPEC_VERSION = "cover-spec-v1" as const;
export const DELIVERY_COVER_ASSIGNMENT_VERSION =
  "delivery-cover-assignment-v2" as const;
export const DELIVERY_COVER_PACKAGE_VERSION =
  "delivery-cover-package-v2" as const;
export const DELIVERY_COVER_RESULT_VERSION =
  "delivery-cover-result-v2" as const;

const CoverVariantSchema = z
  .object({
    variantId: z.enum(["cover-4x3", "cover-3x4"]),
    aspectRatio: z.enum(["4:3", "3:4"]),
    width: PositiveIntegerSchema,
    height: PositiveIntegerSchema,
    layoutMode: z.literal("independent-composition"),
  })
  .strict()
  .readonly();

export const CoverSpecSchema = z
  .object({
    schemaVersion: z.literal(1),
    contractVersion: z.literal(COVER_SPEC_VERSION),
    visualMode: z.literal("code-only-graphics"),
    variants: z.tuple([CoverVariantSchema, CoverVariantSchema]).readonly(),
    forbiddenInputs: z
      .tuple([
        z.literal("image"),
        z.literal("video"),
        z.literal("audio"),
        z.literal("network"),
        z.literal("remote-font"),
        z.literal("scene-output"),
        z.literal("global-visual-output"),
      ])
      .readonly(),
  })
  .strict()
  .superRefine((specification, context) => {
    const [wide, tall] = specification.variants;
    if (
      wide.variantId !== "cover-4x3" ||
      wide.aspectRatio !== "4:3" ||
      wide.width !== 1600 ||
      wide.height !== 1200 ||
      tall.variantId !== "cover-3x4" ||
      tall.aspectRatio !== "3:4" ||
      tall.width !== 1200 ||
      tall.height !== 1600
    ) {
      context.addIssue({
        code: "custom",
        message: "CoverSpec must use the fixed 4:3 and 3:4 dimensions.",
        path: ["variants"],
      });
    }
  })
  .readonly();

export const FIXED_COVER_SPEC = CoverSpecSchema.parse({
  schemaVersion: 1,
  contractVersion: COVER_SPEC_VERSION,
  visualMode: "code-only-graphics",
  variants: [
    {
      variantId: "cover-4x3",
      aspectRatio: "4:3",
      width: 1600,
      height: 1200,
      layoutMode: "independent-composition",
    },
    {
      variantId: "cover-3x4",
      aspectRatio: "3:4",
      width: 1200,
      height: 1600,
      layoutMode: "independent-composition",
    },
  ],
  forbiddenInputs: [
    "image",
    "video",
    "audio",
    "network",
    "remote-font",
    "scene-output",
    "global-visual-output",
  ],
});

export const COVER_SPEC_FINGERPRINT = createFingerprint({
  namespace: "delivery-cover-spec",
  version: 1,
  value: FIXED_COVER_SPEC,
});

export const computeCoverVisualStyleSpecFingerprint = (rawStyle: unknown) =>
  createFingerprint({
    namespace: "delivery-cover-visual-style-spec",
    version: 1,
    value: VisualStyleSpecSchema.parse(rawStyle),
  });

export const deriveCoverCompositionBaseId = (storyId: string) =>
  CompositionIdSchema.parse(
    StoryIdSchema.parse(storyId)
      .split("-")
      .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
      .join(""),
  );

const CoverAssignmentInputReferenceSchema = z
  .object({
    kind: z.enum(["story-spec", "visual-style-spec", "fixed-cover-spec"]),
    fingerprint: Sha256DigestSchema,
  })
  .strict()
  .readonly();

const CoverAssignmentInputObject = z
  .object({
    schemaVersion: z.literal(2),
    contractVersion: z.literal(DELIVERY_COVER_ASSIGNMENT_VERSION),
    storyId: StoryIdSchema,
    compositionBaseId: CompositionIdSchema,
    story: StorySpecSchema,
    visualStyle: VisualStyleSpecSchema,
    coverSpec: CoverSpecSchema,
    storyFingerprint: Sha256DigestSchema,
    visualStyleSpecFingerprint: Sha256DigestSchema,
    coverSpecFingerprint: Sha256DigestSchema,
    inputs: z
      .tuple([
        CoverAssignmentInputReferenceSchema,
        CoverAssignmentInputReferenceSchema,
        CoverAssignmentInputReferenceSchema,
      ])
      .readonly(),
    exclusivePaths: z
      .object({
        sourceDirectory: z.string(),
        resultsDirectory: z.string(),
      })
      .strict()
      .readonly(),
  })
  .strict()
  .superRefine((assignment, context) => {
    const expectedInputs = [
      { kind: "story-spec", fingerprint: assignment.storyFingerprint },
      {
        kind: "visual-style-spec",
        fingerprint: assignment.visualStyleSpecFingerprint,
      },
      { kind: "fixed-cover-spec", fingerprint: assignment.coverSpecFingerprint },
    ];
    if (JSON.stringify(assignment.inputs) !== JSON.stringify(expectedInputs)) {
      context.addIssue({
        code: "custom",
        message: "CoverAssignment creative inputs must be StorySpec, VisualStyleSpec, and CoverSpec only.",
        path: ["inputs"],
      });
    }
    if (
      assignment.story.storyId !== assignment.storyId ||
      assignment.visualStyle.storyId !== assignment.storyId ||
      assignment.storyFingerprint !== computeStoryFingerprint(assignment.story) ||
      assignment.visualStyleSpecFingerprint !==
        computeCoverVisualStyleSpecFingerprint(assignment.visualStyle) ||
      assignment.coverSpecFingerprint !== COVER_SPEC_FINGERPRINT ||
      assignment.compositionBaseId !== deriveCoverCompositionBaseId(assignment.storyId)
    ) {
      context.addIssue({
        code: "custom",
        message: "CoverAssignment source identities are stale.",
        path: ["storyFingerprint"],
      });
    }
    const expectedPaths = {
      sourceDirectory: `src/projects/${assignment.storyId}/delivery/cover`,
      resultsDirectory: `src/projects/${assignment.storyId}/delivery/cover/results`,
    };
    if (
      assignment.exclusivePaths.sourceDirectory !== expectedPaths.sourceDirectory ||
      assignment.exclusivePaths.resultsDirectory !== expectedPaths.resultsDirectory
    ) {
      context.addIssue({
        code: "custom",
        message: "CoverAssignment paths must stay in the fixed Project delivery/cover boundary.",
        path: ["exclusivePaths"],
      });
    }
  });

export const DeliveryCoverAssignmentInputSchema =
  CoverAssignmentInputObject.readonly();

export const computeDeliveryCoverAssignmentFingerprint = (rawInput: unknown) => {
  const record = { ...(rawInput as Record<string, unknown>) };
  delete record.assignmentFingerprint;
  return createFingerprint({
    namespace: "delivery-cover-assignment",
    version: 2,
    value: DeliveryCoverAssignmentInputSchema.parse(record),
  });
};

export const DeliveryCoverAssignmentSchema = CoverAssignmentInputObject.extend({
  assignmentFingerprint: Sha256DigestSchema,
})
  .strict()
  .superRefine((assignment, context) => {
    const { assignmentFingerprint, ...input } = assignment;
    if (
      assignmentFingerprint !== computeDeliveryCoverAssignmentFingerprint(input)
    ) {
      context.addIssue({
        code: "custom",
        message: "DeliveryCoverAssignment fingerprint is stale.",
        path: ["assignmentFingerprint"],
      });
    }
  })
  .readonly();

export const buildDeliveryCoverAssignment = ({
  story: rawStory,
  visualStyle: rawVisualStyle,
}: {
  readonly story: unknown;
  readonly visualStyle: unknown;
}) => {
  const story = StorySpecSchema.parse(rawStory);
  const visualStyle = VisualStyleSpecSchema.parse(rawVisualStyle);
  const storyFingerprint = computeStoryFingerprint(story);
  const visualStyleSpecFingerprint =
    computeCoverVisualStyleSpecFingerprint(visualStyle);
  const input = DeliveryCoverAssignmentInputSchema.parse({
    schemaVersion: 2,
    contractVersion: DELIVERY_COVER_ASSIGNMENT_VERSION,
    storyId: story.storyId,
    compositionBaseId: deriveCoverCompositionBaseId(story.storyId),
    story,
    visualStyle,
    coverSpec: FIXED_COVER_SPEC,
    storyFingerprint,
    visualStyleSpecFingerprint,
    coverSpecFingerprint: COVER_SPEC_FINGERPRINT,
    inputs: [
      { kind: "story-spec", fingerprint: storyFingerprint },
      { kind: "visual-style-spec", fingerprint: visualStyleSpecFingerprint },
      { kind: "fixed-cover-spec", fingerprint: COVER_SPEC_FINGERPRINT },
    ],
    exclusivePaths: {
      sourceDirectory: `src/projects/${story.storyId}/delivery/cover`,
      resultsDirectory: `src/projects/${story.storyId}/delivery/cover/results`,
    },
  });
  return DeliveryCoverAssignmentSchema.parse({
    ...input,
    assignmentFingerprint: computeDeliveryCoverAssignmentFingerprint(input),
  });
};

const CoverSourceFileSchema = z
  .object({
    relativePath: z.string().min(1).max(512),
    checksum: Sha256DigestSchema,
  })
  .strict()
  .readonly();

const CoverCompositionSchema = z
  .object({
    variantId: z.enum(["cover-4x3", "cover-3x4"]),
    compositionId: CompositionIdSchema,
    sourceFile: z.enum(["Cover4x3.tsx", "Cover3x4.tsx"]),
    width: PositiveIntegerSchema,
    height: PositiveIntegerSchema,
  })
  .strict()
  .readonly();

const CoverPackageInputObject = z
  .object({
    schemaVersion: z.literal(2),
    contractVersion: z.literal(DELIVERY_COVER_PACKAGE_VERSION),
    storyId: StoryIdSchema,
    compositionId: CompositionIdSchema,
    assignmentFingerprint: Sha256DigestSchema,
    storyFingerprint: Sha256DigestSchema,
    visualStyleSpecFingerprint: Sha256DigestSchema,
    coverSpecFingerprint: Sha256DigestSchema,
    sourceFiles: z
      .tuple([
        CoverSourceFileSchema,
        CoverSourceFileSchema,
        CoverSourceFileSchema,
        CoverSourceFileSchema,
      ])
      .readonly(),
    sourceGraphFingerprint: Sha256DigestSchema,
    compositions: z
      .tuple([CoverCompositionSchema, CoverCompositionSchema])
      .readonly(),
  })
  .strict()
  .superRefine((coverPackage, context) => {
    const root = `src/projects/${coverPackage.storyId}/delivery/cover`;
    const expectedPaths = [
      `${root}/Cover4x3.tsx`,
      `${root}/Cover3x4.tsx`,
      `${root}/Root.tsx`,
      `${root}/index.ts`,
    ];
    coverPackage.sourceFiles.forEach((file, index) => {
      if (file.relativePath !== expectedPaths[index]) {
        context.addIssue({
          code: "custom",
          message: "CoverPackage source graph must use the fixed files.",
          path: ["sourceFiles", index],
        });
      }
    });
    if (
      coverPackage.sourceFiles[0].checksum === coverPackage.sourceFiles[1].checksum
    ) {
      context.addIssue({
        code: "custom",
        message: "Cover variants must use independently authored source.",
        path: ["sourceFiles"],
      });
    }
    const [wide, tall] = coverPackage.compositions;
    if (
      wide.variantId !== "cover-4x3" ||
      wide.compositionId !== `${coverPackage.compositionId}DeliveryCover4x3V2` ||
      wide.sourceFile !== "Cover4x3.tsx" ||
      wide.width !== 1600 ||
      wide.height !== 1200 ||
      tall.variantId !== "cover-3x4" ||
      tall.compositionId !== `${coverPackage.compositionId}DeliveryCover3x4V2` ||
      tall.sourceFile !== "Cover3x4.tsx" ||
      tall.width !== 1200 ||
      tall.height !== 1600
    ) {
      context.addIssue({
        code: "custom",
        message: "CoverPackage requires two fixed independent compositions.",
        path: ["compositions"],
      });
    }
  });

export const DeliveryCoverPackageInputSchema = CoverPackageInputObject.readonly();

export const computeDeliveryCoverSourceGraphFingerprint = ({
  storyId,
  sourceFiles,
}: {
  readonly storyId: unknown;
  readonly sourceFiles: unknown;
}) =>
  createFingerprint({
    namespace: "delivery-cover-source-graph",
    version: 2,
    value: {
      storyId: StoryIdSchema.parse(storyId),
      sourceFiles: z
        .tuple([
          CoverSourceFileSchema,
          CoverSourceFileSchema,
          CoverSourceFileSchema,
          CoverSourceFileSchema,
        ])
        .parse(sourceFiles),
    },
  });

export const computeDeliveryCoverPackageFingerprint = (rawInput: unknown) => {
  const record = { ...(rawInput as Record<string, unknown>) };
  delete record.packageFingerprint;
  return createFingerprint({
    namespace: "delivery-cover-package",
    version: 2,
    value: DeliveryCoverPackageInputSchema.parse(record),
  });
};

export const DeliveryCoverPackageSchema = CoverPackageInputObject.extend({
  packageFingerprint: Sha256DigestSchema,
})
  .strict()
  .superRefine((coverPackage, context) => {
    const { packageFingerprint, ...input } = coverPackage;
    if (
      input.sourceGraphFingerprint !==
      computeDeliveryCoverSourceGraphFingerprint({
        storyId: input.storyId,
        sourceFiles: input.sourceFiles,
      })
    ) {
      context.addIssue({
        code: "custom",
        message: "CoverPackage source graph fingerprint is stale.",
        path: ["sourceGraphFingerprint"],
      });
    }
    if (packageFingerprint !== computeDeliveryCoverPackageFingerprint(input)) {
      context.addIssue({
        code: "custom",
        message: "DeliveryCoverPackage fingerprint is stale.",
        path: ["packageFingerprint"],
      });
    }
  })
  .readonly();

export const buildDeliveryCoverPackage = (rawInput: unknown) => {
  const record: Record<string, unknown> = {
    ...(rawInput as Record<string, unknown>),
    schemaVersion: 2,
    contractVersion: DELIVERY_COVER_PACKAGE_VERSION,
  };
  delete record.packageFingerprint;
  record.sourceGraphFingerprint = computeDeliveryCoverSourceGraphFingerprint({
    storyId: record.storyId,
    sourceFiles: record.sourceFiles,
  });
  const input = DeliveryCoverPackageInputSchema.parse(record);
  return DeliveryCoverPackageSchema.parse({
    ...input,
    packageFingerprint: computeDeliveryCoverPackageFingerprint(input),
  });
};

const CoverMediaSchema = z
  .object({
    variantId: z.enum(["cover-4x3", "cover-3x4"]),
    repositoryPath: z.string().min(1).max(512),
    checksum: Sha256DigestSchema,
    sizeBytes: PositiveIntegerSchema,
    width: PositiveIntegerSchema,
    height: PositiveIntegerSchema,
    decodedToEof: z.literal(true),
  })
  .strict()
  .readonly();

const ThumbnailCheckSchema = z
  .object({
    variantId: z.enum(["cover-4x3", "cover-3x4"]),
    width: PositiveIntegerSchema,
    height: PositiveIntegerSchema,
    decodedToEof: z.literal(true),
  })
  .strict()
  .readonly();

const CoverResultInputObject = z
  .object({
    schemaVersion: z.literal(2),
    contractVersion: z.literal(DELIVERY_COVER_RESULT_VERSION),
    status: z.literal("cover-ready"),
    storyId: StoryIdSchema,
    assignmentFingerprint: Sha256DigestSchema,
    packageFingerprint: Sha256DigestSchema,
    sourceGraphFingerprint: Sha256DigestSchema,
    covers: z.tuple([CoverMediaSchema, CoverMediaSchema]).readonly(),
    thumbnailChecks: z
      .tuple([ThumbnailCheckSchema, ThumbnailCheckSchema])
      .readonly(),
  })
  .strict()
  .superRefine((result, context) => {
    const [wide, tall] = result.covers;
    const [wideThumbnail, tallThumbnail] = result.thumbnailChecks;
    const resultRoot = `src/projects/${result.storyId}/delivery/cover/results/${result.assignmentFingerprint.slice(7)}`;
    if (
      wide.variantId !== "cover-4x3" ||
      wide.repositoryPath !== `${resultRoot}/cover-4x3.png` ||
      wide.width !== 1600 ||
      wide.height !== 1200 ||
      tall.variantId !== "cover-3x4" ||
      tall.repositoryPath !== `${resultRoot}/cover-3x4.png` ||
      tall.width !== 1200 ||
      tall.height !== 1600
    ) {
      context.addIssue({
        code: "custom",
        message: "CoverResult media must use both fixed ratio outputs.",
        path: ["covers"],
      });
    }
    if (
      wideThumbnail.variantId !== "cover-4x3" ||
      wideThumbnail.width !== 320 ||
      wideThumbnail.height !== 240 ||
      tallThumbnail.variantId !== "cover-3x4" ||
      tallThumbnail.width !== 240 ||
      tallThumbnail.height !== 320
    ) {
      context.addIssue({
        code: "custom",
        message: "CoverResult requires both fixed thumbnail checks.",
        path: ["thumbnailChecks"],
      });
    }
  });

export const DeliveryCoverResultInputSchema = CoverResultInputObject.readonly();

export const computeDeliveryCoverResultFingerprint = (rawInput: unknown) => {
  const record = { ...(rawInput as Record<string, unknown>) };
  delete record.resultFingerprint;
  return createFingerprint({
    namespace: "delivery-cover-result",
    version: 2,
    value: DeliveryCoverResultInputSchema.parse(record),
  });
};

export const DeliveryCoverResultSchema = CoverResultInputObject.extend({
  resultFingerprint: Sha256DigestSchema,
})
  .strict()
  .superRefine((result, context) => {
    const { resultFingerprint, ...input } = result;
    if (resultFingerprint !== computeDeliveryCoverResultFingerprint(input)) {
      context.addIssue({
        code: "custom",
        message: "DeliveryCoverResult fingerprint is stale.",
        path: ["resultFingerprint"],
      });
    }
  })
  .readonly();

export const buildDeliveryCoverResult = (rawInput: unknown) => {
  const record: Record<string, unknown> = {
    ...(rawInput as Record<string, unknown>),
    schemaVersion: 2,
    contractVersion: DELIVERY_COVER_RESULT_VERSION,
    status: "cover-ready",
  };
  delete record.resultFingerprint;
  const input = DeliveryCoverResultInputSchema.parse(record);
  return DeliveryCoverResultSchema.parse({
    ...input,
    resultFingerprint: computeDeliveryCoverResultFingerprint(input),
  });
};

export type DeliveryCoverAssignment = z.infer<
  typeof DeliveryCoverAssignmentSchema
>;
export type DeliveryCoverPackage = z.infer<typeof DeliveryCoverPackageSchema>;
export type DeliveryCoverResult = z.infer<typeof DeliveryCoverResultSchema>;

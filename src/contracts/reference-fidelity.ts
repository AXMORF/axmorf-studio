import { z } from "zod";

import { ExternalRepositoryPathSchema } from "./external-reference";
import { createFingerprint } from "./fingerprint";
import {
  NonNegativeIntegerSchema,
  PositiveIntegerSchema,
  Sha256DigestSchema,
} from "./primitives";

export const REFERENCE_FIDELITY_CHECKER_VERSION =
  "reference-fidelity-checker-v1" as const;

const EvidenceArtifactSchema = z
  .object({
    artifactPath: ExternalRepositoryPathSchema,
    checksum: Sha256DigestSchema,
  })
  .strict()
  .readonly();

const FidelityPhasePairSchema = z
  .object({
    normalizedPhase: z.number().finite().min(0).max(1),
    sourceFrame: NonNegativeIntegerSchema,
    adaptationFrame: NonNegativeIntegerSchema,
    sourceEvidence: EvidenceArtifactSchema,
    adaptationEvidence: EvidenceArtifactSchema,
  })
  .strict()
  .readonly();

const FidelityTraitReviewSchema = z
  .object({
    trait: z.string().trim().min(1).max(240),
    conclusion: z.literal("pass"),
    note: z.string().trim().min(1).max(1000),
  })
  .strict()
  .readonly();

const FidelityReviewItemObjectSchema = z
  .object({
    selectionIndex: NonNegativeIntegerSchema,
    normalizedFps: PositiveIntegerSchema,
    sourceDurationInFrames: PositiveIntegerSchema,
    adaptationDurationInFrames: PositiveIntegerSchema,
    sourcePreview: EvidenceArtifactSchema,
    adaptationPreview: EvidenceArtifactSchema,
    phasePairs: z.array(FidelityPhasePairSchema).min(2).max(12).readonly(),
    traitReviews: z.array(FidelityTraitReviewSchema).min(1).max(24).readonly(),
    recognizable: z.literal(true),
    recognizableNote: z.string().trim().min(1).max(1000),
    itemFingerprint: Sha256DigestSchema,
  })
  .strict();

type FidelityReviewItemInput = Omit<
  z.input<typeof FidelityReviewItemObjectSchema>,
  "itemFingerprint"
>;

export const computeFidelityReviewItemFingerprint = (
  rawItem: FidelityReviewItemInput & { readonly itemFingerprint?: unknown },
) => {
  const candidate = { ...rawItem } as Record<string, unknown>;
  delete candidate.itemFingerprint;
  const item = FidelityReviewItemObjectSchema.omit({
    itemFingerprint: true,
  }).parse(candidate);
  return createFingerprint({
    namespace: "reference-fidelity-review-item",
    version: 1,
    value: item,
  });
};

const FidelityReviewItemSchema = FidelityReviewItemObjectSchema.superRefine(
  (item, context) => {
    if (item.itemFingerprint !== computeFidelityReviewItemFingerprint(item)) {
      context.addIssue({
        code: "custom",
        message: "Fidelity review item fingerprint is stale.",
        path: ["itemFingerprint"],
      });
    }
    const phases = item.phasePairs.map((pair) => pair.normalizedPhase);
    if (
      phases.some((phase, index) => index > 0 && phase <= phases[index - 1])
    ) {
      context.addIssue({
        code: "custom",
        message: "Normalized phase pairs must be strictly increasing.",
        path: ["phasePairs"],
      });
    }
    for (const [index, pair] of item.phasePairs.entries()) {
      if (
        pair.sourceFrame >= item.sourceDurationInFrames ||
        pair.adaptationFrame >= item.adaptationDurationInFrames ||
        Math.abs(
          pair.sourceFrame / item.sourceDurationInFrames - pair.normalizedPhase,
        ) >
          1 / item.sourceDurationInFrames ||
        Math.abs(
          pair.adaptationFrame / item.adaptationDurationInFrames -
            pair.normalizedPhase,
        ) >
          1 / item.adaptationDurationInFrames
      ) {
        context.addIssue({
          code: "custom",
          message: "Evidence frames do not match their normalized phase.",
          path: ["phasePairs", index],
        });
      }
    }
    if (
      new Set(item.phasePairs.map((pair) => pair.sourceEvidence.checksum))
        .size < 2 ||
      new Set(item.phasePairs.map((pair) => pair.adaptationEvidence.checksum))
        .size < 2
    ) {
      context.addIssue({
        code: "custom",
        message: "At least two rendered states must be visibly byte-distinct.",
        path: ["phasePairs"],
      });
    }
    if (
      new Set(item.traitReviews.map((review) => review.trait)).size !==
      item.traitReviews.length
    ) {
      context.addIssue({
        code: "custom",
        message: "Fidelity trait reviews must be unique.",
        path: ["traitReviews"],
      });
    }
  },
).readonly();

const ReferenceFidelityReviewInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    reviewerRole: z.literal("agent"),
    selectionFingerprint: Sha256DigestSchema,
    items: z.array(FidelityReviewItemSchema).min(1).max(24).readonly(),
  })
  .strict();

export const computeReferenceFidelityReviewFingerprint = (
  rawReview: z.input<typeof ReferenceFidelityReviewInputSchema> & {
    readonly reviewFingerprint?: unknown;
  },
) => {
  const { schemaVersion, reviewerRole, selectionFingerprint, items } =
    rawReview;
  return createFingerprint({
    namespace: "reference-fidelity-review",
    version: 1,
    value: ReferenceFidelityReviewInputSchema.parse({
      schemaVersion,
      reviewerRole,
      selectionFingerprint,
      items,
    }),
  });
};

export const ReferenceFidelityReviewSchema =
  ReferenceFidelityReviewInputSchema.extend({
    reviewFingerprint: Sha256DigestSchema,
  })
    .strict()
    .superRefine((review, context) => {
      if (
        review.reviewFingerprint !==
        computeReferenceFidelityReviewFingerprint(review)
      ) {
        context.addIssue({
          code: "custom",
          message: "Reference fidelity review fingerprint is stale.",
          path: ["reviewFingerprint"],
        });
      }
      review.items.forEach((item, index) => {
        if (item.selectionIndex !== index) {
          context.addIssue({
            code: "custom",
            message: "Fidelity review items must match exact selection order.",
            path: ["items", index, "selectionIndex"],
          });
        }
      });
    })
    .readonly();

export const buildReferenceFidelityReview = (rawInput: {
  readonly selectionFingerprint: unknown;
  readonly items: readonly unknown[];
}) => {
  const items = rawInput.items.map((rawItem) => {
    const item = rawItem as FidelityReviewItemInput;
    return FidelityReviewItemSchema.parse({
      ...item,
      itemFingerprint: computeFidelityReviewItemFingerprint(item),
    });
  });
  const input = ReferenceFidelityReviewInputSchema.parse({
    schemaVersion: 1,
    reviewerRole: "agent",
    selectionFingerprint: rawInput.selectionFingerprint,
    items,
  });
  return ReferenceFidelityReviewSchema.parse({
    ...input,
    reviewFingerprint: computeReferenceFidelityReviewFingerprint(input),
  });
};

const CurrentSourceChecksumSchema = z
  .object({
    sourcePath: ExternalRepositoryPathSchema,
    checksum: Sha256DigestSchema,
  })
  .strict()
  .readonly();

export const RendererBindingEvidenceSchema = z
  .object({
    rendererPath: ExternalRepositoryPathSchema,
    rendererSourceChecksum: Sha256DigestSchema,
    adaptedShotPath: ExternalRepositoryPathSchema,
    adaptedShotSourceChecksum: Sha256DigestSchema,
    importSpecifier: z.string().min(1).max(512),
    componentIdentifier: z.string().regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/),
    sceneFrameIdentifier: z.literal("sceneFrame"),
    derivedFrameIdentifier: z.literal("shotFrame"),
    frameProp: z.literal("shotFrame"),
  })
  .strict()
  .readonly();

const ReferenceFidelityReceiptItemObjectSchema = z
  .object({
    selectionIndex: NonNegativeIntegerSchema,
    snapshotFingerprint: Sha256DigestSchema,
    cardFingerprint: Sha256DigestSchema,
    styleFingerprint: Sha256DigestSchema,
    cardDocumentChecksum: Sha256DigestSchema,
    demoSourceChecksum: Sha256DigestSchema,
    previewChecksum: Sha256DigestSchema,
    closureFingerprint: Sha256DigestSchema,
    localizationFingerprint: Sha256DigestSchema,
    localizedSourceChecksums: z
      .array(CurrentSourceChecksumSchema)
      .min(1)
      .readonly(),
    sourceLicenseEvidenceFingerprint: Sha256DigestSchema,
    previewLicenseEvidenceFingerprint: Sha256DigestSchema,
    rendererBinding: RendererBindingEvidenceSchema,
    reviewItemFingerprint: Sha256DigestSchema,
    itemFingerprint: Sha256DigestSchema,
  })
  .strict();

type ReceiptItemInput = Omit<
  z.input<typeof ReferenceFidelityReceiptItemObjectSchema>,
  "itemFingerprint"
>;

export const computeReferenceFidelityReceiptItemFingerprint = (
  rawItem: ReceiptItemInput & { readonly itemFingerprint?: unknown },
) => {
  const candidate = { ...rawItem } as Record<string, unknown>;
  delete candidate.itemFingerprint;
  const item = ReferenceFidelityReceiptItemObjectSchema.omit({
    itemFingerprint: true,
  }).parse(candidate);
  return createFingerprint({
    namespace: "reference-fidelity-receipt-item",
    version: 1,
    value: item,
  });
};

const ReferenceFidelityReceiptItemSchema =
  ReferenceFidelityReceiptItemObjectSchema.superRefine((item, context) => {
    if (
      item.itemFingerprint !==
      computeReferenceFidelityReceiptItemFingerprint(item)
    ) {
      context.addIssue({
        code: "custom",
        message: "Reference fidelity receipt item fingerprint is stale.",
        path: ["itemFingerprint"],
      });
    }
  }).readonly();

const PassReceiptInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    checkerVersion: z.literal(REFERENCE_FIDELITY_CHECKER_VERSION),
    status: z.literal("pass"),
    selectionFingerprint: Sha256DigestSchema,
    reviewFingerprint: Sha256DigestSchema,
    items: z.array(ReferenceFidelityReceiptItemSchema).min(1).readonly(),
  })
  .strict();

const NotApplicableReceiptInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    checkerVersion: z.literal(REFERENCE_FIDELITY_CHECKER_VERSION),
    status: z.literal("not-applicable"),
    selectionFingerprint: Sha256DigestSchema,
    reason: z.enum(["empty", "inspiration-only"]),
  })
  .strict();

const computeReceiptFingerprint = (rawReceipt: Record<string, unknown>) => {
  const receipt = { ...rawReceipt };
  delete receipt.receiptFingerprint;
  return createFingerprint({
    namespace: "reference-fidelity-receipt",
    version: 1,
    value: receipt,
  });
};

const ReferenceFidelityPassReceiptSchema = PassReceiptInputSchema.extend({
  receiptFingerprint: Sha256DigestSchema,
})
  .strict()
  .superRefine((receipt, context) => {
    if (receipt.receiptFingerprint !== computeReceiptFingerprint(receipt)) {
      context.addIssue({
        code: "custom",
        message: "Reference fidelity receipt fingerprint is stale.",
        path: ["receiptFingerprint"],
      });
    }
    receipt.items.forEach((item, index) => {
      if (item.selectionIndex !== index) {
        context.addIssue({
          code: "custom",
          message: "Receipt items must match exact selection order.",
          path: ["items", index, "selectionIndex"],
        });
      }
    });
  })
  .readonly();

const ReferenceFidelityNotApplicableReceiptSchema =
  NotApplicableReceiptInputSchema.extend({
    receiptFingerprint: Sha256DigestSchema,
  })
    .strict()
    .superRefine((receipt, context) => {
      if (receipt.receiptFingerprint !== computeReceiptFingerprint(receipt)) {
        context.addIssue({
          code: "custom",
          message: "Not-applicable receipt fingerprint is stale.",
          path: ["receiptFingerprint"],
        });
      }
    })
    .readonly();

export const ReferenceFidelityReceiptSchema = z.union([
  ReferenceFidelityPassReceiptSchema,
  ReferenceFidelityNotApplicableReceiptSchema,
]);

export const buildNotApplicableFidelityReceipt = (rawInput: {
  readonly selectionFingerprint: unknown;
  readonly reason: unknown;
}) => {
  const input = NotApplicableReceiptInputSchema.parse({
    schemaVersion: 1,
    checkerVersion: REFERENCE_FIDELITY_CHECKER_VERSION,
    status: "not-applicable",
    selectionFingerprint: rawInput.selectionFingerprint,
    reason: rawInput.reason,
  });
  return ReferenceFidelityNotApplicableReceiptSchema.parse({
    ...input,
    receiptFingerprint: computeReceiptFingerprint(input),
  });
};

export const buildPassFidelityReceipt = (rawInput: {
  readonly selectionFingerprint: unknown;
  readonly reviewFingerprint: unknown;
  readonly items: readonly unknown[];
}) => {
  const items = rawInput.items.map((rawItem) => {
    const item = rawItem as ReceiptItemInput;
    return ReferenceFidelityReceiptItemSchema.parse({
      ...item,
      itemFingerprint: computeReferenceFidelityReceiptItemFingerprint(item),
    });
  });
  const input = PassReceiptInputSchema.parse({
    schemaVersion: 1,
    checkerVersion: REFERENCE_FIDELITY_CHECKER_VERSION,
    status: "pass",
    selectionFingerprint: rawInput.selectionFingerprint,
    reviewFingerprint: rawInput.reviewFingerprint,
    items,
  });
  return ReferenceFidelityPassReceiptSchema.parse({
    ...input,
    receiptFingerprint: computeReceiptFingerprint(input),
  });
};

export type ReferenceFidelityReview = z.infer<
  typeof ReferenceFidelityReviewSchema
>;
export type ReferenceFidelityReceipt = z.infer<
  typeof ReferenceFidelityReceiptSchema
>;

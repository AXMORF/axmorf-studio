import { z } from "zod";

import { ExternalRepositoryPathSchema } from "./external-reference";
import { createFingerprint } from "./fingerprint";
import {
  NonNegativeIntegerSchema,
  PositiveIntegerSchema,
  Sha256DigestSchema,
} from "./primitives";

export const REFERENCE_FIDELITY_CHECKER_VERSION =
  "reference-fidelity-checker-v2" as const;
export const REFERENCE_FIDELITY_EVIDENCE_VERSION =
  "reference-fidelity-evidence-v1" as const;

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

const FidelityEvidenceItemObjectSchema = z
  .object({
    selectionIndex: NonNegativeIntegerSchema,
    normalizedFps: PositiveIntegerSchema,
    sourceDurationInFrames: PositiveIntegerSchema,
    adaptationDurationInFrames: PositiveIntegerSchema,
    sourcePreview: EvidenceArtifactSchema,
    adaptationPreview: EvidenceArtifactSchema,
    phasePairs: z.array(FidelityPhasePairSchema).min(2).max(12).readonly(),
    itemFingerprint: Sha256DigestSchema,
  })
  .strict();

type FidelityEvidenceItemInput = Omit<
  z.input<typeof FidelityEvidenceItemObjectSchema>,
  "itemFingerprint"
>;

export const computeFidelityEvidenceItemFingerprint = (
  rawItem: FidelityEvidenceItemInput & { readonly itemFingerprint?: unknown },
) => {
  const candidate = { ...rawItem } as Record<string, unknown>;
  delete candidate.itemFingerprint;
  const item = FidelityEvidenceItemObjectSchema.omit({
    itemFingerprint: true,
  }).parse(candidate);
  return createFingerprint({
    namespace: "reference-fidelity-evidence-item",
    version: 1,
    value: item,
  });
};

const FidelityEvidenceItemSchema = FidelityEvidenceItemObjectSchema.superRefine(
  (item, context) => {
    if (item.itemFingerprint !== computeFidelityEvidenceItemFingerprint(item)) {
      context.addIssue({
        code: "custom",
        message: "Fidelity evidence item fingerprint is stale.",
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
  },
).readonly();

const ReferenceFidelityEvidenceInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    evidenceVersion: z.literal(REFERENCE_FIDELITY_EVIDENCE_VERSION),
    selectionFingerprint: Sha256DigestSchema,
    items: z.array(FidelityEvidenceItemSchema).min(1).max(24).readonly(),
  })
  .strict();

export const computeReferenceFidelityEvidenceFingerprint = (
  rawEvidence: z.input<typeof ReferenceFidelityEvidenceInputSchema> & {
    readonly evidenceFingerprint?: unknown;
  },
) => {
  const { schemaVersion, evidenceVersion, selectionFingerprint, items } =
    rawEvidence;
  return createFingerprint({
    namespace: "reference-fidelity-evidence",
    version: 1,
    value: ReferenceFidelityEvidenceInputSchema.parse({
      schemaVersion,
      evidenceVersion,
      selectionFingerprint,
      items,
    }),
  });
};

export const ReferenceFidelityEvidenceSchema =
  ReferenceFidelityEvidenceInputSchema.extend({
    evidenceFingerprint: Sha256DigestSchema,
  })
    .strict()
    .superRefine((evidence, context) => {
      if (
        evidence.evidenceFingerprint !==
        computeReferenceFidelityEvidenceFingerprint(evidence)
      ) {
        context.addIssue({
          code: "custom",
          message: "Reference fidelity evidence fingerprint is stale.",
          path: ["evidenceFingerprint"],
        });
      }
      evidence.items.forEach((item, index) => {
        if (item.selectionIndex !== index) {
          context.addIssue({
            code: "custom",
            message:
              "Fidelity evidence items must match exact selection order.",
            path: ["items", index, "selectionIndex"],
          });
        }
      });
    })
    .readonly();

export const buildReferenceFidelityEvidence = (rawInput: {
  readonly selectionFingerprint: unknown;
  readonly items: readonly unknown[];
}) => {
  const items = rawInput.items.map((rawItem) => {
    const item = rawItem as FidelityEvidenceItemInput;
    return FidelityEvidenceItemSchema.parse({
      ...item,
      itemFingerprint: computeFidelityEvidenceItemFingerprint(item),
    });
  });
  const input = ReferenceFidelityEvidenceInputSchema.parse({
    schemaVersion: 1,
    evidenceVersion: REFERENCE_FIDELITY_EVIDENCE_VERSION,
    selectionFingerprint: rawInput.selectionFingerprint,
    items,
  });
  return ReferenceFidelityEvidenceSchema.parse({
    ...input,
    evidenceFingerprint: computeReferenceFidelityEvidenceFingerprint(input),
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
    evidenceItemFingerprint: Sha256DigestSchema,
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
    version: 2,
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
    evidenceFingerprint: Sha256DigestSchema,
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
    version: 2,
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
  readonly evidenceFingerprint: unknown;
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
    evidenceFingerprint: rawInput.evidenceFingerprint,
    items,
  });
  return ReferenceFidelityPassReceiptSchema.parse({
    ...input,
    receiptFingerprint: computeReceiptFingerprint(input),
  });
};

export type ReferenceFidelityEvidence = z.infer<
  typeof ReferenceFidelityEvidenceSchema
>;
export type ReferenceFidelityReceipt = z.infer<
  typeof ReferenceFidelityReceiptSchema
>;

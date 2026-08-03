import {z} from "zod";

import {createFingerprint} from "./fingerprint";
import {
  CompositionIdSchema,
  NonNegativeIntegerSchema,
  PositiveIntegerSchema,
  Sha256DigestSchema,
  StoryIdSchema,
} from "./primitives";

const RelativeOutputPathSchema = z
  .string()
  .min(1)
  .max(512)
  .refine(
    (value) =>
      value.startsWith("out/") &&
      !value.startsWith("/") &&
      !value.includes("..") &&
      !value.includes("\\"),
    "Preview media paths must be repository-relative under out/.",
  );

const MediaIdentitySchema = z
  .object({
    relativePath: RelativeOutputPathSchema,
    checksum: Sha256DigestSchema,
  })
  .strict()
  .readonly();

const EvidenceInputObject = z
  .object({
    schemaVersion: z.literal(1),
    evidenceVersion: z.literal("final-preview-evidence-v1"),
    storyId: StoryIdSchema,
    compositionId: CompositionIdSchema,
    finalAssemblyFingerprint: Sha256DigestSchema,
    resourceCatalogFingerprint: Sha256DigestSchema,
    reviewFingerprint: Sha256DigestSchema,
    media: z
      .object({
        fullPreview: MediaIdentitySchema,
        contactSheet: MediaIdentitySchema,
        representativeStills: z
          .array(
            MediaIdentitySchema.unwrap()
              .extend({frame: NonNegativeIntegerSchema})
              .strict(),
          )
          .min(1)
          .readonly(),
      })
      .strict()
      .readonly(),
    technical: z
      .object({
        videoCodec: z.literal("h264"),
        width: PositiveIntegerSchema,
        height: PositiveIntegerSchema,
        fpsNumerator: PositiveIntegerSchema,
        fpsDenominator: PositiveIntegerSchema,
        frameCount: PositiveIntegerSchema,
        durationSeconds: z.number().positive().finite(),
        audioCodec: z.string().trim().min(1).max(40),
        sampleRate: PositiveIntegerSchema,
        channelLayout: z.string().trim().min(1).max(80),
        decodedToEof: z.literal(true),
        integratedLoudnessLufs: z.number().finite(),
        truePeakDbtp: z.number().finite(),
        samplePeakDbfs: z.number().finite(),
        duckingEvidenceFingerprint: Sha256DigestSchema,
      })
      .strict()
      .readonly(),
    aggregateStatus: z.literal("ready-for-user-approval"),
  })
  .strict()
  .readonly();

export const FinalPreviewEvidenceInputSchema = EvidenceInputObject;
export const FinalPreviewEvidenceSchema = EvidenceInputObject.unwrap().extend({
  evidenceFingerprint: Sha256DigestSchema,
})
  .strict()
  .superRefine((evidence, context) => {
    const {evidenceFingerprint, ...input} = evidence;
    const expected = createFingerprint({
      namespace: "final-preview-evidence",
      version: 1,
      value: input,
    });
    if (evidenceFingerprint !== expected) {
      context.addIssue({
        code: "custom",
        message: "FinalPreviewEvidence fingerprint is stale.",
        path: ["evidenceFingerprint"],
      });
    }
  })
  .readonly();

export const createFinalPreviewEvidence = (rawInput: unknown) => {
  const input = FinalPreviewEvidenceInputSchema.parse(rawInput);
  return FinalPreviewEvidenceSchema.parse({
    ...input,
    evidenceFingerprint: createFingerprint({
      namespace: "final-preview-evidence",
      version: 1,
      value: input,
    }),
  });
};

const ApprovalInputObject = z
  .object({
    schemaVersion: z.literal(1),
    approvalVersion: z.literal("final-preview-approval-v1"),
    storyId: StoryIdSchema,
    compositionId: CompositionIdSchema,
    decision: z.literal("approved"),
    previewChecksum: Sha256DigestSchema,
    evidenceFingerprint: Sha256DigestSchema,
    finalAssemblyFingerprint: Sha256DigestSchema,
    approvalReference: z.literal("user-approved-current-preview"),
  })
  .strict()
  .readonly();

export const FinalPreviewApprovalInputSchema = ApprovalInputObject;
export const FinalPreviewApprovalSchema = ApprovalInputObject.unwrap().extend({
  approvalFingerprint: Sha256DigestSchema,
})
  .strict()
  .superRefine((approval, context) => {
    const {approvalFingerprint, ...input} = approval;
    const expected = createFingerprint({
      namespace: "final-preview-approval",
      version: 1,
      value: input,
    });
    if (approvalFingerprint !== expected) {
      context.addIssue({
        code: "custom",
        message: "FinalPreviewApproval fingerprint is stale.",
        path: ["approvalFingerprint"],
      });
    }
  })
  .readonly();

export const createFinalPreviewApproval = (rawInput: unknown) => {
  const input = FinalPreviewApprovalInputSchema.parse(rawInput);
  return FinalPreviewApprovalSchema.parse({
    ...input,
    approvalFingerprint: createFingerprint({
      namespace: "final-preview-approval",
      version: 1,
      value: input,
    }),
  });
};

export type FinalPreviewEvidence = z.infer<typeof FinalPreviewEvidenceSchema>;
export type FinalPreviewApproval = z.infer<typeof FinalPreviewApprovalSchema>;

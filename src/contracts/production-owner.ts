import { z } from "zod";

import { createFingerprint } from "./fingerprint";
import { MeaningIdSchema, Sha256DigestSchema, StoryIdSchema } from "./primitives";
import {
  ProductionFingerprintRefSchema,
  ProductionRunIdSchema,
} from "./production-run";

export const PRODUCTION_OWNER_RECEIPT_VERSION = "production-owner-receipt-v1" as const;
export const PRODUCTION_OWNER_RESULT_VERSION = "production-owner-result-v1" as const;

export const ProductionOwnerKindSchema = z.enum(["scene", "global-visual", "cover"]);
const IsoTimestampSchema = z.string().datetime({ offset: true });
const SafeRepositoryPathSchema = z.string().min(1).max(512).refine(
  (value) =>
    !value.startsWith("/") &&
    !value.includes("\\") &&
    !value.includes("://") &&
    !value.split("/").some((part) => part === "" || part === ".."),
  "Owner paths must be normalized repository-relative paths.",
);

export const ProductionOwnerOutputFileSchema = z
  .object({
    repositoryPath: SafeRepositoryPathSchema,
    checksum: Sha256DigestSchema,
    sizeBytes: z.number().int().nonnegative().safe(),
  })
  .strict()
  .readonly();

const OwnerIdentityShape = {
  schemaVersion: z.literal(1),
  contractVersion: z.literal(PRODUCTION_OWNER_RECEIPT_VERSION),
  runId: ProductionRunIdSchema,
  storyId: StoryIdSchema,
  ownerKind: ProductionOwnerKindSchema,
  meaningId: MeaningIdSchema.nullable(),
  assignmentFingerprint: Sha256DigestSchema,
  taskInputFingerprint: Sha256DigestSchema.nullable(),
  requirementsFingerprint: Sha256DigestSchema.nullable(),
  inputFingerprints: z.array(ProductionFingerprintRefSchema).min(1).max(32).readonly(),
  outputManifest: z.array(ProductionOwnerOutputFileSchema).max(2048).readonly(),
  occurredAt: IsoTimestampSchema,
} as const;

const OwnerFailureSchema = z
  .object({
    code: z.string().min(1).max(96).regex(/^[A-Z0-9]+(?:_[A-Z0-9]+)*$/u),
    description: z.string().min(1).max(500),
    redactionApplied: z.boolean(),
  })
  .strict()
  .readonly();

const ProductionOwnerReceiptInputUnion = z.discriminatedUnion("status", [
  z.object({ ...OwnerIdentityShape, status: z.literal("owner-ready") }).strict(),
  z.object({
    ...OwnerIdentityShape,
    status: z.literal("owner-failed"),
    error: OwnerFailureSchema,
  }).strict(),
]);

const refineOwnerIdentity = (
  receipt: z.infer<typeof ProductionOwnerReceiptInputUnion>,
  context: z.RefinementCtx,
) => {
  const paths = receipt.outputManifest.map(({ repositoryPath }) => repositoryPath);
  if (
    new Set(paths).size !== paths.length ||
    paths.some((value, index) => index > 0 && value.localeCompare(paths[index - 1]!) <= 0)
  ) {
    context.addIssue({
      code: "custom",
      message: "Owner output manifest paths must be unique and sorted.",
      path: ["outputManifest"],
    });
  }
  const inputIds = receipt.inputFingerprints.map(({ artifactId }) => artifactId);
  if (new Set(inputIds).size !== inputIds.length) {
    context.addIssue({
      code: "custom",
      message: "Owner receipt input identities must be unique.",
      path: ["inputFingerprints"],
    });
  }
  if (
    receipt.ownerKind === "scene"
      ? receipt.meaningId === null ||
        receipt.taskInputFingerprint === null ||
        receipt.requirementsFingerprint === null
      : receipt.meaningId !== null || receipt.taskInputFingerprint !== null
  ) {
    context.addIssue({
      code: "custom",
      message: "Owner receipt identity fields do not match the owner kind.",
      path: ["ownerKind"],
    });
  }
  if (
    (receipt.ownerKind === "global-visual" && receipt.requirementsFingerprint === null) ||
    (receipt.ownerKind === "cover" && receipt.requirementsFingerprint !== null)
  ) {
    context.addIssue({
      code: "custom",
      message: "Owner receipt requirements identity does not match the owner kind.",
      path: ["requirementsFingerprint"],
    });
  }
};

export const ProductionOwnerReceiptInputSchema =
  ProductionOwnerReceiptInputUnion.superRefine(refineOwnerIdentity).readonly();

export const computeProductionOwnerReceiptFingerprint = (rawInput: unknown) => {
  const record = { ...(rawInput as Record<string, unknown>) };
  delete record.receiptFingerprint;
  return createFingerprint({
    namespace: "production-owner-receipt",
    version: 1,
    value: ProductionOwnerReceiptInputSchema.parse(record),
  });
};

export const ProductionOwnerReceiptSchema = z
  .discriminatedUnion("status", [
    z.object({
      ...OwnerIdentityShape,
      status: z.literal("owner-ready"),
      receiptFingerprint: Sha256DigestSchema,
    }).strict(),
    z.object({
      ...OwnerIdentityShape,
      status: z.literal("owner-failed"),
      error: OwnerFailureSchema,
      receiptFingerprint: Sha256DigestSchema,
    }).strict(),
  ])
  .superRefine((receipt, context) => {
    const input: Record<string, unknown> = { ...receipt };
    delete input.receiptFingerprint;
    const parsed = ProductionOwnerReceiptInputSchema.safeParse(input);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        context.addIssue({ code: "custom", message: issue.message, path: issue.path });
      }
      return;
    }
    if (receipt.receiptFingerprint !== computeProductionOwnerReceiptFingerprint(receipt)) {
      context.addIssue({
        code: "custom",
        message: "ProductionOwnerReceipt fingerprint is stale.",
        path: ["receiptFingerprint"],
      });
    }
  })
  .readonly();

export const buildProductionOwnerReceipt = (rawInput: unknown) => {
  const record: Record<string, unknown> = {
    ...(rawInput as Record<string, unknown>),
    schemaVersion: 1,
    contractVersion: PRODUCTION_OWNER_RECEIPT_VERSION,
  };
  delete record.receiptFingerprint;
  const input = ProductionOwnerReceiptInputSchema.parse(record);
  return ProductionOwnerReceiptSchema.parse({
    ...input,
    receiptFingerprint: computeProductionOwnerReceiptFingerprint(input),
  });
};

const ProductionOwnerResultInputObject = z
  .object({
    schemaVersion: z.literal(1),
    contractVersion: z.literal(PRODUCTION_OWNER_RESULT_VERSION),
    runId: ProductionRunIdSchema,
    storyId: StoryIdSchema,
    ownerKind: ProductionOwnerKindSchema,
    meaningId: MeaningIdSchema.nullable(),
    assignmentFingerprint: Sha256DigestSchema,
    receiptFingerprint: Sha256DigestSchema,
    status: z.enum(["accepted-ready", "accepted-failed"]),
    formalResult: z
      .object({
        repositoryPath: SafeRepositoryPathSchema,
        fingerprint: Sha256DigestSchema,
      })
      .strict()
      .nullable(),
    occurredAt: IsoTimestampSchema,
  })
  .strict()
  .superRefine((result, context) => {
    if (
      (result.ownerKind === "scene") !== (result.meaningId !== null) ||
      (result.status === "accepted-ready" && result.formalResult === null) ||
      (result.status === "accepted-failed" &&
        result.ownerKind !== "cover" &&
        result.formalResult === null)
    ) {
      context.addIssue({
        code: "custom",
        message: "ProductionOwnerResult identity or formal result is invalid.",
        path: ["formalResult"],
      });
    }
  });

export const ProductionOwnerResultInputSchema = ProductionOwnerResultInputObject.readonly();
export const computeProductionOwnerResultFingerprint = (rawInput: unknown) => {
  const record = { ...(rawInput as Record<string, unknown>) };
  delete record.resultFingerprint;
  return createFingerprint({
    namespace: "production-owner-result",
    version: 1,
    value: ProductionOwnerResultInputSchema.parse(record),
  });
};
export const ProductionOwnerResultSchema = ProductionOwnerResultInputObject.extend({
  resultFingerprint: Sha256DigestSchema,
})
  .strict()
  .superRefine((result, context) => {
    if (result.resultFingerprint !== computeProductionOwnerResultFingerprint(result)) {
      context.addIssue({
        code: "custom",
        message: "ProductionOwnerResult fingerprint is stale.",
        path: ["resultFingerprint"],
      });
    }
  })
  .readonly();
export const buildProductionOwnerResult = (rawInput: unknown) => {
  const record: Record<string, unknown> = {
    ...(rawInput as Record<string, unknown>),
    schemaVersion: 1,
    contractVersion: PRODUCTION_OWNER_RESULT_VERSION,
  };
  delete record.resultFingerprint;
  const input = ProductionOwnerResultInputSchema.parse(record);
  return ProductionOwnerResultSchema.parse({
    ...input,
    resultFingerprint: computeProductionOwnerResultFingerprint(input),
  });
};

export type ProductionOwnerKind = z.infer<typeof ProductionOwnerKindSchema>;
export type ProductionOwnerOutputFile = z.infer<typeof ProductionOwnerOutputFileSchema>;
export type ProductionOwnerReceipt = z.infer<typeof ProductionOwnerReceiptSchema>;
export type ProductionOwnerResult = z.infer<typeof ProductionOwnerResultSchema>;

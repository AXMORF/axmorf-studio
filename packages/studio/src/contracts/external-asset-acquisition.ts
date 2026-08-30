import { z } from "zod";

import { createFingerprint } from "./fingerprint";
import { Sha256DigestSchema } from "./primitives";

export const EXTERNAL_ASSET_ACQUISITION_VERSION =
  "external-asset-acquisition-v1" as const;

const ProviderIdSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/u);

const ProviderAssetIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u);

const HttpsUrlSchema = z
  .url()
  .refine(
    (value) => new URL(value).protocol === "https:",
    "External asset URLs must use HTTPS.",
  );

const RelativeCandidatePathSchema = z
  .string()
  .min(1)
  .max(255)
  .refine(
    (value) =>
      !value.startsWith("/") &&
      !value.includes("\\") &&
      !value.split("/").includes(".") &&
      !value.split("/").includes(".."),
    "Candidate file path must be normalized and relative.",
  );

const PositiveSafeIntegerSchema = z
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER);

const ExternalAssetCommonShape = {
  schemaVersion: z.literal(1),
  contractVersion: z.literal(EXTERNAL_ASSET_ACQUISITION_VERSION),
  provider: ProviderIdSchema,
  providerAssetId: ProviderAssetIdSchema,
  providerReceiptId: z.string().trim().min(1).max(240),
  sourcePageUrl: HttpsUrlSchema,
  creator: z
    .object({
      name: z.string().trim().min(1).max(200),
      profileUrl: HttpsUrlSchema,
    })
    .strict()
    .readonly(),
  license: z
    .object({
      name: z.string().trim().min(1).max(200),
      url: HttpsUrlSchema,
    })
    .strict()
    .readonly(),
  attribution: z
    .object({
      required: z.boolean(),
      text: z.string().trim().min(1).max(1_000).nullable(),
    })
    .strict()
    .superRefine((attribution, context) => {
      if (attribution.required && attribution.text === null) {
        context.addIssue({
          code: "custom",
          message: "Required external asset attribution is missing.",
          path: ["text"],
        });
      }
    })
    .readonly(),
  acquiredAt: z.iso.datetime({ offset: true }),
} as const;

const ExternalFileIdentityShape = {
  relativePath: RelativeCandidatePathSchema,
  sizeBytes: PositiveSafeIntegerSchema,
  sha256: Sha256DigestSchema,
} as const;

const ExternalImageAssetAcquisitionInputObject = z
  .object({
    ...ExternalAssetCommonShape,
    assetKind: z.literal("image"),
    file: z
      .object({
        ...ExternalFileIdentityShape,
        mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
        width: PositiveSafeIntegerSchema.max(100_000),
        height: PositiveSafeIntegerSchema.max(100_000),
      })
      .strict()
      .readonly(),
  })
  .strict();

const ExternalVideoAssetAcquisitionInputObject = z
  .object({
    ...ExternalAssetCommonShape,
    assetKind: z.literal("video"),
    file: z
      .object({
        ...ExternalFileIdentityShape,
        mimeType: z.string().regex(/^video\/[a-z0-9.+-]+$/u),
        width: PositiveSafeIntegerSchema.max(100_000),
        height: PositiveSafeIntegerSchema.max(100_000),
        durationInMilliseconds: PositiveSafeIntegerSchema,
        codec: z.string().trim().min(1).max(80),
      })
      .strict()
      .readonly(),
  })
  .strict();

const ExternalAudioAssetAcquisitionInputObject = z
  .object({
    ...ExternalAssetCommonShape,
    assetKind: z.literal("audio"),
    file: z
      .object({
        ...ExternalFileIdentityShape,
        mimeType: z.string().regex(/^audio\/[a-z0-9.+-]+$/u),
        durationInMilliseconds: PositiveSafeIntegerSchema,
        codec: z.string().trim().min(1).max(80),
        sampleRate: PositiveSafeIntegerSchema.max(768_000),
        channels: PositiveSafeIntegerSchema.max(64),
      })
      .strict()
      .readonly(),
  })
  .strict();

export const ExternalAssetAcquisitionInputSchema = z
  .discriminatedUnion("assetKind", [
    ExternalImageAssetAcquisitionInputObject,
    ExternalVideoAssetAcquisitionInputObject,
    ExternalAudioAssetAcquisitionInputObject,
  ])
  .readonly();

export const computeExternalAssetProvenanceFingerprint = (
  rawInput: unknown,
) => {
  const record = { ...(rawInput as Record<string, unknown>) };
  delete record.provenanceFingerprint;
  const input = ExternalAssetAcquisitionInputSchema.parse(record);
  return createFingerprint({
    namespace: "external-asset-acquisition",
    version: 1,
    value: input,
  });
};

const withFingerprint = <Shape extends z.ZodRawShape>(shape: Shape) =>
  z.object({ ...shape, provenanceFingerprint: Sha256DigestSchema }).strict();

export const ExternalImageAssetAcquisitionSchema = withFingerprint(
  ExternalImageAssetAcquisitionInputObject.shape,
).superRefine((acquisition, context) => {
  if (
    acquisition.provenanceFingerprint !==
    computeExternalAssetProvenanceFingerprint(acquisition)
  ) {
    context.addIssue({
      code: "custom",
      message: "External image provenance fingerprint is stale.",
      path: ["provenanceFingerprint"],
    });
  }
});

const ExternalVideoAssetAcquisitionSchema = withFingerprint(
  ExternalVideoAssetAcquisitionInputObject.shape,
).superRefine((acquisition, context) => {
  if (
    acquisition.provenanceFingerprint !==
    computeExternalAssetProvenanceFingerprint(acquisition)
  ) {
    context.addIssue({
      code: "custom",
      message: "External video provenance fingerprint is stale.",
      path: ["provenanceFingerprint"],
    });
  }
});

const ExternalAudioAssetAcquisitionSchema = withFingerprint(
  ExternalAudioAssetAcquisitionInputObject.shape,
).superRefine((acquisition, context) => {
  if (
    acquisition.provenanceFingerprint !==
    computeExternalAssetProvenanceFingerprint(acquisition)
  ) {
    context.addIssue({
      code: "custom",
      message: "External audio provenance fingerprint is stale.",
      path: ["provenanceFingerprint"],
    });
  }
});

export const ExternalAssetAcquisitionSchema = z.discriminatedUnion(
  "assetKind",
  [
    ExternalImageAssetAcquisitionSchema,
    ExternalVideoAssetAcquisitionSchema,
    ExternalAudioAssetAcquisitionSchema,
  ],
);

export const buildExternalAssetAcquisition = (rawInput: unknown) => {
  const input = ExternalAssetAcquisitionInputSchema.parse({
    ...(rawInput as Record<string, unknown>),
    schemaVersion: 1,
    contractVersion: EXTERNAL_ASSET_ACQUISITION_VERSION,
  });
  return ExternalAssetAcquisitionSchema.parse({
    ...input,
    provenanceFingerprint: computeExternalAssetProvenanceFingerprint(input),
  });
};

export const assertImportableExternalAssetAcquisition = (rawInput: unknown) => {
  const acquisition = ExternalAssetAcquisitionSchema.parse(rawInput);
  if (acquisition.assetKind !== "image") {
    throw new Error(
      "Project asset import currently supports image acquisitions only.",
    );
  }
  return ExternalImageAssetAcquisitionSchema.parse(acquisition);
};

export type ExternalAssetAcquisition = z.infer<
  typeof ExternalAssetAcquisitionSchema
>;
export type ExternalImageAssetAcquisition = z.infer<
  typeof ExternalImageAssetAcquisitionSchema
>;

import { z } from "zod";

import { createFingerprint } from "./fingerprint";
import { MeaningIdSchema, Sha256DigestSchema } from "./primitives";

const ArtworkIdSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
const ArtworkOriginSchema = z
  .object({
    kind: z.enum(["image-generated", "authored-svg"]),
    creator: z.string().trim().min(1).max(160),
    creationDescription: z.string().trim().min(1).max(8_000),
    rights: z.literal("original-work"),
  })
  .strict()
  .readonly();

export const GeneratedArtworkImportInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    assetId: ArtworkIdSchema,
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(1000),
    file: z
      .string()
      .min(1)
      .max(255)
      .refine(
        (value) =>
          !value.startsWith("/") &&
          !value.includes("\\") &&
          !value.includes(":") &&
          value
            .split("/")
            .every((part) => part !== "" && part !== "." && part !== ".."),
        "Generated artwork file must be relative to its input JSON without traversal.",
      ),
    sceneMeaningIds: z
      .array(MeaningIdSchema)
      .min(1)
      .max(128)
      .refine(
        (values) => new Set(values).size === values.length,
        "Generated artwork targets must be unique.",
      )
      .readonly(),
    provenance: ArtworkOriginSchema,
  })
  .strict()
  .readonly();

const GeneratedArtworkRecordInput = z
  .object({
    schemaVersion: z.literal(1),
    assetId: ArtworkIdSchema,
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(1000),
    provenance: ArtworkOriginSchema,
    file: z
      .object({
        mimeType: z.enum([
          "image/jpeg",
          "image/png",
          "image/webp",
          "image/svg+xml",
        ]),
        width: z.number().int().positive().max(16_384),
        height: z.number().int().positive().max(16_384),
        sizeBytes: z
          .number()
          .int()
          .positive()
          .max(64 * 1024 * 1024),
        sha256: Sha256DigestSchema,
      })
      .strict()
      .readonly(),
  })
  .strict()
  .superRefine((record, context) => {
    if (
      (record.provenance.kind === "authored-svg") !==
      (record.file.mimeType === "image/svg+xml")
    )
      context.addIssue({
        code: "custom",
        message: "Artwork origin and file format do not match.",
        path: ["provenance", "kind"],
      });
    if (record.file.width * record.file.height > 100_000_000)
      context.addIssue({
        code: "custom",
        message: "Artwork dimensions exceed the pixel budget.",
        path: ["file"],
      });
  });

export const computeGeneratedArtworkFingerprint = (rawInput: unknown) => {
  const record = { ...(rawInput as Record<string, unknown>) };
  delete record.provenanceFingerprint;
  return createFingerprint({
    namespace: "generated-artwork",
    version: 1,
    value: GeneratedArtworkRecordInput.parse(record),
  });
};

export const GeneratedArtworkRecordSchema = GeneratedArtworkRecordInput.extend({
  provenanceFingerprint: Sha256DigestSchema,
})
  .superRefine((record, context) => {
    if (
      record.provenanceFingerprint !==
      computeGeneratedArtworkFingerprint(record)
    )
      context.addIssue({
        code: "custom",
        message: "Generated artwork provenance is stale.",
        path: ["provenanceFingerprint"],
      });
  })
  .readonly();

export const buildGeneratedArtworkRecord = (rawInput: unknown) => {
  const input = GeneratedArtworkRecordInput.parse(rawInput);
  return GeneratedArtworkRecordSchema.parse({
    ...input,
    provenanceFingerprint: computeGeneratedArtworkFingerprint(input),
  });
};

export const GeneratedArtworkSourceSchema = z
  .object({
    kind: z.enum(["image-generated", "authored-svg"]),
    creator: z.string().trim().min(1).max(160),
    provenanceFingerprint: Sha256DigestSchema,
  })
  .strict()
  .readonly();

export type GeneratedArtworkImportInput = z.infer<
  typeof GeneratedArtworkImportInputSchema
>;
export type GeneratedArtworkRecord = z.infer<
  typeof GeneratedArtworkRecordSchema
>;

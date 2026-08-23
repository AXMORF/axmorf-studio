import { z } from "zod";

const trimmed = (maximum: number) => z.string().trim().min(1).max(maximum);

const httpsUrl = z
  .url()
  .refine(
    (value) => new URL(value).protocol === "https:",
    "Pexels receipt URLs must use HTTPS.",
  );

export const PexelsAcquisitionReceiptV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    acquisitionId: z.string().regex(/^pexels:[1-9][0-9]{0,15}$/u),
    provider: z.literal("pexels"),
    providerAssetId: z.string().regex(/^[1-9][0-9]{0,15}$/u),
    sourcePageUrl: httpsUrl,
    creator: z.object({ name: trimmed(200), profileUrl: httpsUrl }).strict(),
    license: z
      .object({
        name: z.literal("Pexels License"),
        url: z.literal("https://www.pexels.com/license/"),
      })
      .strict(),
    providerPolicy: z
      .object({
        attributionRequired: z.literal(true),
        attributionText: trimmed(300),
      })
      .strict(),
    searchContext: z
      .object({
        query: trimmed(200).optional(),
        orientation: z.enum(["landscape", "portrait", "square"]).optional(),
        selectionNote: trimmed(500).optional(),
      })
      .strict()
      .optional(),
    file: z
      .object({
        relativePath: z.string().regex(/^original\.(?:jpg|png|webp)$/u),
        mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
        width: z.number().int().positive().max(100_000),
        height: z.number().int().positive().max(100_000),
        sizeInBytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
        sha256: z.string().regex(/^[a-f0-9]{64}$/u),
      })
      .strict(),
    acquiredAt: z.iso.datetime({ offset: true }),
  })
  .strict()
  .superRefine((receipt, context) => {
    if (receipt.acquisitionId !== `pexels:${receipt.providerAssetId}`) {
      context.addIssue({
        code: "custom",
        message: "Pexels acquisition receipt identity is stale.",
        path: ["acquisitionId"],
      });
    }
  });

export type PexelsAcquisitionReceiptV1 = z.infer<
  typeof PexelsAcquisitionReceiptV1Schema
>;

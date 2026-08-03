import { z } from "zod";

import { createFingerprint } from "./fingerprint";
import { LicenseRecordSchema } from "./resource-catalog";
import { Sha256DigestSchema } from "./primitives";

export const EXTERNAL_REFERENCE_SNAPSHOT_FINGERPRINT_VERSION = 1 as const;
export const VIDEO_SHOTCRAFT_SOURCE_ID = "video-shotcraft" as const;
export const VIDEO_SHOTCRAFT_OFFICIAL_REPOSITORY =
  "https://github.com/Vincentwei1021/video-shotcraft.git" as const;

export const GitCommitSchema = z
  .string()
  .regex(/^[0-9a-f]{40}$/, "Revision must be a full lowercase Git commit.")
  .brand<"GitCommit">();

export const ExternalRepositoryPathSchema = z
  .string()
  .min(1)
  .max(512)
  .refine(
    (value) =>
      !value.startsWith("/") &&
      !value.includes("\\") &&
      !value.split("/").some((part) => part === "." || part === ".."),
    "External paths must be normalized repository-relative POSIX paths.",
  );

export const ExternalReferenceFileSchema = z
  .object({
    sourcePath: ExternalRepositoryPathSchema,
    fixturePath: ExternalRepositoryPathSchema,
    role: z.enum([
      "source-license",
      "canonical-card-index",
      "card-document",
      "demo-source",
      "demo-dependency",
      "preview-media",
    ]),
    checksum: Sha256DigestSchema,
  })
  .strict()
  .readonly();

const ExternalReferenceCardObjectSchema = z
  .object({
    cardId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    styleKey: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    title: z.string().trim().min(1).max(240),
    summary: z.string().trim().min(1).max(2000),
    category: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    tags: z.array(z.string().trim().min(1)).min(1).readonly(),
    cardDocumentPath: ExternalRepositoryPathSchema,
    demoSourcePath: ExternalRepositoryPathSchema,
    previewPath: ExternalRepositoryPathSchema,
    closureRoot: ExternalRepositoryPathSchema,
    exactDemoDeclared: z.literal(true),
    cardDocumentChecksum: Sha256DigestSchema,
    demoSourceChecksum: Sha256DigestSchema,
    previewChecksum: Sha256DigestSchema,
    cardFingerprint: Sha256DigestSchema,
    styleFingerprint: Sha256DigestSchema,
  })
  .strict();

type ExternalReferenceCardFingerprintInput = Omit<
  z.input<typeof ExternalReferenceCardObjectSchema>,
  "cardFingerprint" | "styleFingerprint"
>;

export const computeExternalReferenceCardFingerprint = (
  card: ExternalReferenceCardFingerprintInput,
) =>
  createFingerprint({
    namespace: "external-reference-card",
    version: 1,
    value: card,
  });

export const computeExternalReferenceStyleFingerprint = ({
  cardId,
  styleKey,
  previewPath,
  previewChecksum,
}: Pick<
  ExternalReferenceCardFingerprintInput,
  "cardId" | "styleKey" | "previewPath" | "previewChecksum"
>) =>
  createFingerprint({
    namespace: "external-reference-style",
    version: 1,
    value: { cardId, styleKey, previewPath, previewChecksum },
  });

export const ExternalReferenceCardSchema =
  ExternalReferenceCardObjectSchema.superRefine((card, context) => {
    const { cardFingerprint, styleFingerprint, ...input } = card;
    if (cardFingerprint !== computeExternalReferenceCardFingerprint(input)) {
      context.addIssue({
        code: "custom",
        message: "External reference card fingerprint is stale.",
        path: ["cardFingerprint"],
      });
    }
    if (styleFingerprint !== computeExternalReferenceStyleFingerprint(input)) {
      context.addIssue({
        code: "custom",
        message: "External reference style fingerprint is stale.",
        path: ["styleFingerprint"],
      });
    }
  }).readonly();

export const ExternalReferenceIndexSchema = z
  .object({
    cards: z.array(ExternalReferenceCardSchema).min(1).readonly(),
  })
  .strict()
  .readonly();

const ExternalReferenceSnapshotInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    sourceId: z.literal(VIDEO_SHOTCRAFT_SOURCE_ID),
    repository: z.literal(VIDEO_SHOTCRAFT_OFFICIAL_REPOSITORY),
    revision: GitCommitSchema,
    index: ExternalReferenceIndexSchema,
    sourceLicense: LicenseRecordSchema,
    previewMediaLicense: LicenseRecordSchema,
    files: z.array(ExternalReferenceFileSchema).min(1).readonly(),
  })
  .strict();

export type ExternalReferenceSnapshotInput = z.infer<
  typeof ExternalReferenceSnapshotInputSchema
>;

export const computeExternalReferenceSnapshotFingerprint = (
  rawSnapshot:
    | ExternalReferenceSnapshotInput
    | (ExternalReferenceSnapshotInput & {
        readonly snapshotFingerprint: unknown;
      }),
) => {
  const {
    schemaVersion,
    sourceId,
    repository,
    revision,
    index,
    sourceLicense,
    previewMediaLicense,
    files,
  } = rawSnapshot;
  const input = ExternalReferenceSnapshotInputSchema.parse({
    schemaVersion,
    sourceId,
    repository,
    revision,
    index,
    sourceLicense,
    previewMediaLicense,
    files,
  });
  return createFingerprint({
    namespace: "external-reference-snapshot",
    version: EXTERNAL_REFERENCE_SNAPSHOT_FINGERPRINT_VERSION,
    value: input,
  });
};

export const ExternalReferenceSnapshotSchema =
  ExternalReferenceSnapshotInputSchema.extend({
    snapshotFingerprint: Sha256DigestSchema,
  })
    .strict()
    .superRefine((snapshot, context) => {
      if (
        snapshot.snapshotFingerprint !==
        computeExternalReferenceSnapshotFingerprint(snapshot)
      ) {
        context.addIssue({
          code: "custom",
          message: "External reference snapshot fingerprint is stale.",
          path: ["snapshotFingerprint"],
        });
      }
      const identities = new Set<string>();
      for (const [index, card] of snapshot.index.cards.entries()) {
        const identity = `${card.cardId}:${card.styleKey}`;
        if (identities.has(identity)) {
          context.addIssue({
            code: "custom",
            message: "External reference card/style identity must be unique.",
            path: ["index", "cards", index],
          });
        }
        identities.add(identity);
      }
    })
    .readonly();

export type ExternalReferenceSnapshot = z.infer<
  typeof ExternalReferenceSnapshotSchema
>;

export type ExternalReferenceCard = z.infer<typeof ExternalReferenceCardSchema>;

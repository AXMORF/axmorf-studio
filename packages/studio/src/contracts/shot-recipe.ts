import { z } from "zod";

import { createFingerprint } from "./fingerprint";
import { ExternalRepositoryPathSchema } from "./external-reference";
import { Sha256DigestSchema, StoryIdSchema } from "./primitives";

const RecipeIdSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const RecipeProvenanceShape = {
  sourceId: z.literal("video-shotcraft"),
  snapshotFingerprint: Sha256DigestSchema,
  cardId: RecipeIdSchema,
  styleKey: RecipeIdSchema,
  cardFingerprint: Sha256DigestSchema,
  styleFingerprint: Sha256DigestSchema,
  selectionReason: z.string().trim().min(1).max(1000),
} as const;

export const InspirationOnlyShotRecipeSchema = z
  .object({
    mode: z.literal("inspiration-only"),
    ...RecipeProvenanceShape,
  })
  .strict()
  .readonly();

export const ExactDemoLocalizedShotRecipeSchema = z
  .object({
    mode: z.literal("exact-demo-localized"),
    ...RecipeProvenanceShape,
    cardDocumentChecksum: Sha256DigestSchema,
    demoSourceChecksum: Sha256DigestSchema,
    previewChecksum: Sha256DigestSchema,
    closureFingerprint: Sha256DigestSchema,
    localizationFingerprint: Sha256DigestSchema,
    adaptationMode: z.enum(["exact-copy", "adapted"]),
    requiredTraits: z
      .array(z.string().trim().min(1).max(240))
      .min(1)
      .max(24)
      .superRefine((traits, context) => {
        if (new Set(traits).size !== traits.length) {
          context.addIssue({
            code: "custom",
            message: "Required fidelity traits must be unique.",
          });
        }
      })
      .readonly(),
  })
  .strict()
  .readonly();

export const ShotRecipeEntrySchema = z.discriminatedUnion("mode", [
  InspirationOnlyShotRecipeSchema,
  ExactDemoLocalizedShotRecipeSchema,
]);

const ShotRecipeSelectionInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    taskInputFingerprint: Sha256DigestSchema,
    selections: z.array(ShotRecipeEntrySchema).max(24).readonly(),
  })
  .strict();

export type ShotRecipeSelectionInput = z.infer<
  typeof ShotRecipeSelectionInputSchema
>;

export const computeShotRecipeSelectionFingerprint = (
  rawInput: ShotRecipeSelectionInput & {
    readonly selectionFingerprint?: unknown;
  },
) => {
  const { schemaVersion, taskInputFingerprint, selections } = rawInput;
  return createFingerprint({
    namespace: "shot-recipe-selection",
    version: 1,
    value: ShotRecipeSelectionInputSchema.parse({
      schemaVersion,
      taskInputFingerprint,
      selections,
    }),
  });
};

export const ShotRecipeSelectionSchema = ShotRecipeSelectionInputSchema.extend({
  selectionFingerprint: Sha256DigestSchema,
})
  .strict()
  .superRefine((selection, context) => {
    if (
      selection.selectionFingerprint !==
      computeShotRecipeSelectionFingerprint(selection)
    ) {
      context.addIssue({
        code: "custom",
        message: "Shot recipe selection fingerprint is stale.",
        path: ["selectionFingerprint"],
      });
    }
  })
  .readonly();

export const buildShotRecipeSelection = (rawInput: {
  readonly taskInputFingerprint: unknown;
  readonly selections: readonly unknown[];
}) => {
  const input = ShotRecipeSelectionInputSchema.parse({
    schemaVersion: 1,
    taskInputFingerprint: rawInput.taskInputFingerprint,
    selections: rawInput.selections,
  });
  return ShotRecipeSelectionSchema.parse({
    ...input,
    selectionFingerprint: computeShotRecipeSelectionFingerprint(input),
  });
};

const ExactPackageDependencySchema = z
  .object({
    packageName: z.enum([
      "@react-three/fiber",
      "@remotion/motion-blur",
      "react",
      "remotion",
      "three",
    ]),
    exactVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  })
  .strict()
  .readonly();

const ExactPackageDependenciesSchema = z
  .array(ExactPackageDependencySchema)
  .max(5)
  .readonly();

export const DependencyAllowlistSchema = z
  .object({
    schemaVersion: z.literal(1),
    packageLockChecksum: Sha256DigestSchema,
    packages: ExactPackageDependenciesSchema,
  })
  .strict()
  .readonly();

export const DependencyClosureFileSchema = z
  .object({
    sourcePath: ExternalRepositoryPathSchema,
    checksum: Sha256DigestSchema,
    dependencyReason: z.enum(["entry", "static-relative-import"]),
  })
  .strict()
  .readonly();

const DependencyClosureInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    entryPath: ExternalRepositoryPathSchema,
    packageLockChecksum: Sha256DigestSchema,
    bareImports: ExactPackageDependenciesSchema,
    files: z.array(DependencyClosureFileSchema).min(1).readonly(),
  })
  .strict();

export const computeDependencyClosureFingerprint = (
  rawInput: z.input<typeof DependencyClosureInputSchema> & {
    readonly closureFingerprint?: unknown;
  },
) => {
  const { schemaVersion, entryPath, packageLockChecksum, bareImports, files } =
    rawInput;
  return createFingerprint({
    namespace: "shot-recipe-dependency-closure",
    version: 1,
    value: DependencyClosureInputSchema.parse({
      schemaVersion,
      entryPath,
      packageLockChecksum,
      bareImports,
      files,
    }),
  });
};

export const DependencyClosureManifestSchema =
  DependencyClosureInputSchema.extend({
    closureFingerprint: Sha256DigestSchema,
  })
    .strict()
    .superRefine((closure, context) => {
      if (
        closure.closureFingerprint !==
        computeDependencyClosureFingerprint(closure)
      ) {
        context.addIssue({
          code: "custom",
          message: "Dependency closure fingerprint is stale.",
          path: ["closureFingerprint"],
        });
      }
    })
    .readonly();

const LocalizationFileSchema = z
  .object({
    kind: z.enum(["source", "license"]),
    sourcePath: ExternalRepositoryPathSchema,
    sourceChecksum: Sha256DigestSchema,
    destinationPath: ExternalRepositoryPathSchema,
    localizedChecksum: Sha256DigestSchema,
    dependencyReason: z.enum(["entry", "static-relative-import", "license"]),
  })
  .strict()
  .readonly();

const LocalizationManifestInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    projectId: StoryIdSchema,
    meaningId: StoryIdSchema,
    cardId: RecipeIdSchema,
    snapshotFingerprint: Sha256DigestSchema,
    closureFingerprint: Sha256DigestSchema,
    packageLockChecksum: Sha256DigestSchema,
    targetRoot: ExternalRepositoryPathSchema,
    licenseId: z.string().trim().min(1),
    attributionText: z.string().trim().min(1),
    files: z.array(LocalizationFileSchema).min(2).readonly(),
  })
  .strict();

export const computeLocalizationFingerprint = (
  rawInput: z.input<typeof LocalizationManifestInputSchema> & {
    readonly localizationFingerprint?: unknown;
  },
) => {
  const {
    schemaVersion,
    projectId,
    meaningId,
    cardId,
    snapshotFingerprint,
    closureFingerprint,
    packageLockChecksum,
    targetRoot,
    licenseId,
    attributionText,
    files,
  } = rawInput;
  return createFingerprint({
    namespace: "shot-recipe-localization",
    version: 1,
    value: LocalizationManifestInputSchema.parse({
      schemaVersion,
      projectId,
      meaningId,
      cardId,
      snapshotFingerprint,
      closureFingerprint,
      packageLockChecksum,
      targetRoot,
      licenseId,
      attributionText,
      files,
    }),
  });
};

export const LocalizationManifestSchema =
  LocalizationManifestInputSchema.extend({
    localizationFingerprint: Sha256DigestSchema,
  })
    .strict()
    .superRefine((manifest, context) => {
      if (
        manifest.localizationFingerprint !==
        computeLocalizationFingerprint(manifest)
      ) {
        context.addIssue({
          code: "custom",
          message: "Localization fingerprint is stale.",
          path: ["localizationFingerprint"],
        });
      }
    })
    .readonly();

export type DependencyAllowlist = z.infer<typeof DependencyAllowlistSchema>;
export type DependencyClosureManifest = z.infer<
  typeof DependencyClosureManifestSchema
>;
export type LocalizationManifest = z.infer<typeof LocalizationManifestSchema>;
export type ShotRecipeSelection = z.infer<typeof ShotRecipeSelectionSchema>;

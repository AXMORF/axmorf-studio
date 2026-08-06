import { z } from "zod";

import { createFingerprint } from "./fingerprint";
import {
  CompositionIdSchema,
  MeaningIdSchema,
  NonNegativeIntegerSchema,
  PositiveIntegerSchema,
  Sha256DigestSchema,
  StoryIdSchema,
} from "./primitives";

export const PRODUCTION_PREVIEW_ASSEMBLY_VERSION =
  "production-preview-assembly-v1" as const;
export const PRODUCTION_PREVIEW_ASSEMBLY_VERSION_V2 =
  "production-preview-assembly-v2" as const;
export const PRODUCTION_PREVIEW_ASSEMBLY_VERSION_V3 =
  "production-preview-assembly-v3" as const;
export const PRODUCTION_PREVIEW_EVIDENCE_VERSION =
  "production-preview-evidence-v1" as const;
export const PRODUCTION_PREVIEW_EVIDENCE_VERSION_V2 =
  "production-preview-evidence-v2" as const;
export const PRODUCTION_PREVIEW_MECHANICAL_CHECK_VERSION =
  "production-preview-mechanical-check-v1" as const;
export const PRODUCTION_PREVIEW_MECHANICAL_CHECK_VERSION_V2 =
  "production-preview-mechanical-check-v2" as const;

const RelativeOutputPathSchema = z
  .string()
  .min(1)
  .max(512)
  .refine(
    (value) =>
      value.startsWith("out/") &&
      !value.startsWith("/") &&
      !value.includes("..") &&
      !value.includes("\\") &&
      !value.includes("://"),
    "Production preview media must use a repository-relative out/ path.",
  );

const ScenePackageIdentitySchema = z
  .object({
    meaningId: MeaningIdSchema,
    packageFingerprint: Sha256DigestSchema,
  })
  .strict()
  .readonly();

const SceneLocalSoundSelectionSchema = z.discriminatedUnion("selection", [
  z
    .object({
      selection: z.literal("present"),
      soundDesignProjectionFingerprint: Sha256DigestSchema,
    })
    .strict(),
  z
    .object({
      selection: z.literal("none"),
      reason: z.literal("no-scene-local-audio"),
    })
    .strict(),
]);

const GlobalVisualPreviewIdentitySchema = z
  .object({
    assignmentFingerprint: Sha256DigestSchema,
    packageFingerprint: Sha256DigestSchema,
    resultFingerprint: Sha256DigestSchema,
    planFingerprint: Sha256DigestSchema,
    projectionFingerprint: Sha256DigestSchema,
    rendererSourceGraphFingerprint: Sha256DigestSchema,
  })
  .strict()
  .readonly();

const PreviewAssemblyInputObject = z
  .object({
    schemaVersion: z.literal(1),
    contractVersion: z.literal(PRODUCTION_PREVIEW_ASSEMBLY_VERSION),
    storyId: StoryIdSchema,
    compositionId: CompositionIdSchema,
    requirementsFingerprint: Sha256DigestSchema,
    narrativeAutoCheckFingerprint: Sha256DigestSchema,
    sealedNarrationFingerprint: Sha256DigestSchema,
    semanticTimingFingerprint: Sha256DigestSchema,
    captionCuesFingerprint: Sha256DigestSchema,
    sceneCoverageFingerprint: Sha256DigestSchema,
    scenePackages: z
      .array(ScenePackageIdentitySchema)
      .min(1)
      .max(256)
      .readonly(),
    rendererRegistryFingerprint: Sha256DigestSchema,
    storyVisualProjectionFingerprint: Sha256DigestSchema,
    sceneLocalSound: SceneLocalSoundSelectionSchema,
    compositionSourceChecksum: Sha256DigestSchema,
    remotionVersion: z.literal("4.0.489"),
    enhancements: z
      .object({
        narrativeCore: z.literal("required"),
        storyVisualTrack: z.literal("present"),
        globalSoundPlan: z.literal("absent"),
        bgm: z.literal("absent"),
        crossSceneAmbience: z.literal("absent"),
        ducking: z.literal("absent"),
        globalVisualLayers: z.literal("absent"),
      })
      .strict()
      .readonly(),
    layerOrder: z
      .tuple([
        z.literal("story-visual"),
        z.literal("narrative-core"),
        z.literal("scene-local-sound"),
      ])
      .readonly(),
    mixOrder: z
      .tuple([z.literal("narration"), z.literal("scene-local-sound")])
      .readonly(),
    reviewPolicy: z.literal("mechanical-only"),
  })
  .strict()
  .superRefine((assembly, context) => {
    const meaningIds = assembly.scenePackages.map(({ meaningId }) => meaningId);
    if (new Set(meaningIds).size !== meaningIds.length) {
      context.addIssue({
        code: "custom",
        message: "PreviewAssembly ScenePackage identities must be unique.",
        path: ["scenePackages"],
      });
    }
  });

const PreviewAssemblyV2InputObject = z
  .object({
    ...PreviewAssemblyInputObject.shape,
    schemaVersion: z.literal(2),
    contractVersion: z.literal(PRODUCTION_PREVIEW_ASSEMBLY_VERSION_V2),
    sceneCompositionBoundaryVersion: z.literal("scene-composition-boundary-v1"),
    layerOrder: z
      .tuple([
        z.literal("story-visual"),
        z.literal("narrative-core"),
        z.literal("scene-local-sound"),
      ])
      .readonly(),
  })
  .strict()
  .superRefine((assembly, context) => {
    const meaningIds = assembly.scenePackages.map(({ meaningId }) => meaningId);
    if (new Set(meaningIds).size !== meaningIds.length) {
      context.addIssue({
        code: "custom",
        message: "PreviewAssembly ScenePackage identities must be unique.",
        path: ["scenePackages"],
      });
    }
  });

const PreviewAssemblyV3InputObject = z
  .object({
    ...PreviewAssemblyInputObject.shape,
    schemaVersion: z.literal(3),
    contractVersion: z.literal(PRODUCTION_PREVIEW_ASSEMBLY_VERSION_V3),
    sceneCompositionBoundaryVersion: z.literal("scene-composition-boundary-v1"),
    globalVisual: GlobalVisualPreviewIdentitySchema,
    enhancements: z
      .object({
        narrativeCore: z.literal("required"),
        storyVisualTrack: z.literal("present"),
        globalSoundPlan: z.literal("absent"),
        bgm: z.literal("absent"),
        crossSceneAmbience: z.literal("absent"),
        ducking: z.literal("absent"),
        globalVisualLayers: z.literal("present"),
      })
      .strict()
      .readonly(),
    layerOrder: z.union([
      z
        .tuple([
          z.literal("story-visual"),
          z.literal("global-visual"),
          z.literal("narrative-core"),
          z.literal("scene-local-sound"),
        ])
        .readonly(),
      z
        .tuple([
          z.literal("global-visual"),
          z.literal("story-visual"),
          z.literal("narrative-core"),
          z.literal("scene-local-sound"),
        ])
        .readonly(),
    ]),
  })
  .strict()
  .superRefine((assembly, context) => {
    const meaningIds = assembly.scenePackages.map(({ meaningId }) => meaningId);
    if (new Set(meaningIds).size !== meaningIds.length) {
      context.addIssue({
        code: "custom",
        message: "PreviewAssembly ScenePackage identities must be unique.",
        path: ["scenePackages"],
      });
    }
  });

export const ProductionPreviewAssemblyInputSchema = z.union([
  PreviewAssemblyInputObject.readonly(),
  PreviewAssemblyV2InputObject.readonly(),
  PreviewAssemblyV3InputObject.readonly(),
]);

export const computeProductionPreviewAssemblyFingerprint = (
  rawInput: unknown,
) => {
  const record = { ...(rawInput as Record<string, unknown>) };
  delete record.assemblyFingerprint;
  const input = ProductionPreviewAssemblyInputSchema.parse(record);
  return createFingerprint({
    namespace: "production-preview-assembly",
    version: input.schemaVersion,
    value: input,
  });
};

export const ProductionPreviewAssemblySchema = z
  .union([
    PreviewAssemblyInputObject.extend({
      assemblyFingerprint: Sha256DigestSchema,
    }).strict(),
    PreviewAssemblyV2InputObject.extend({
      assemblyFingerprint: Sha256DigestSchema,
    }).strict(),
    PreviewAssemblyV3InputObject.extend({
      assemblyFingerprint: Sha256DigestSchema,
    }).strict(),
  ])
  .superRefine((assembly, context) => {
    const { assemblyFingerprint, ...input } = assembly;
    if (
      assemblyFingerprint !== computeProductionPreviewAssemblyFingerprint(input)
    ) {
      context.addIssue({
        code: "custom",
        message: "Production PreviewAssembly fingerprint is stale.",
        path: ["assemblyFingerprint"],
      });
    }
  })
  .readonly();

export const buildProductionPreviewAssembly = (rawInput: unknown) => {
  const isV3 =
    rawInput !== null &&
    typeof rawInput === "object" &&
    "globalVisual" in rawInput;
  const isV2 =
    rawInput !== null &&
    typeof rawInput === "object" &&
    "sceneCompositionBoundaryVersion" in rawInput;
  const record: Record<string, unknown> = {
    ...(rawInput as Record<string, unknown>),
    schemaVersion: isV3 ? 3 : isV2 ? 2 : 1,
    contractVersion: isV3
      ? PRODUCTION_PREVIEW_ASSEMBLY_VERSION_V3
      : isV2
        ? PRODUCTION_PREVIEW_ASSEMBLY_VERSION_V2
        : PRODUCTION_PREVIEW_ASSEMBLY_VERSION,
  };
  delete record.assemblyFingerprint;
  const input = ProductionPreviewAssemblyInputSchema.parse(record);
  return ProductionPreviewAssemblySchema.parse({
    ...input,
    assemblyFingerprint: computeProductionPreviewAssemblyFingerprint(input),
  });
};

const MediaIdentitySchema = z
  .object({
    relativePath: RelativeOutputPathSchema,
    checksum: Sha256DigestSchema,
  })
  .strict()
  .readonly();

const TechnicalExpectationSchema = z
  .object({
    width: PositiveIntegerSchema,
    height: PositiveIntegerSchema,
    fps: PositiveIntegerSchema,
    frameCount: PositiveIntegerSchema,
    audio: z.literal("narration-plus-optional-scene-local"),
  })
  .strict()
  .readonly();

const TechnicalActualSchema = z
  .object({
    width: PositiveIntegerSchema,
    height: PositiveIntegerSchema,
    fpsNumerator: PositiveIntegerSchema,
    fpsDenominator: PositiveIntegerSchema,
    frameCount: PositiveIntegerSchema,
    durationSeconds: z.number().positive().finite(),
    videoStreamCount: z.literal(1),
    videoCodec: z.literal("h264"),
    audioStreamCount: z.literal(1),
    audioCodec: z.literal("aac"),
    decodedToEof: z.literal(true),
  })
  .strict()
  .readonly();

const PreviewEvidenceInputObject = z
  .object({
    schemaVersion: z.literal(1),
    evidenceVersion: z.literal(PRODUCTION_PREVIEW_EVIDENCE_VERSION),
    storyId: StoryIdSchema,
    compositionId: CompositionIdSchema,
    requirementsFingerprint: Sha256DigestSchema,
    previewAssemblyFingerprint: Sha256DigestSchema,
    sceneCoverageFingerprint: Sha256DigestSchema,
    rendererRegistryFingerprint: Sha256DigestSchema,
    storyVisualProjectionFingerprint: Sha256DigestSchema,
    media: z
      .object({
        fullPreview: MediaIdentitySchema,
        representativeStills: z
          .array(
            MediaIdentitySchema.unwrap()
              .extend({ frame: NonNegativeIntegerSchema })
              .strict(),
          )
          .min(1)
          .max(32)
          .readonly(),
        contactSheet: MediaIdentitySchema,
      })
      .strict()
      .readonly(),
    technical: z
      .object({
        expected: TechnicalExpectationSchema,
        actual: TechnicalActualSchema,
      })
      .strict()
      .readonly(),
    currentChecks: z
      .object({
        coverage: z.literal("current-all-ready"),
        rendererRegistry: z.literal("current"),
        projections: z.literal("current"),
        assembly: z.literal("current"),
        mediaIdentity: z.literal("current"),
      })
      .strict()
      .readonly(),
    absentEnhancements: z
      .object({
        globalSoundPlan: z.literal(true),
        bgm: z.literal(true),
        crossSceneAmbience: z.literal(true),
        ducking: z.literal(true),
        globalVisualLayers: z.literal(true),
      })
      .strict()
      .readonly(),
    aggregateStatus: z.literal("mechanically-ready"),
    handoff: z.literal("awaiting explicit user preview decision"),
  })
  .strict()
  .superRefine((evidence, context) => {
    const { expected, actual } = evidence.technical;
    const actualFps = actual.fpsNumerator / actual.fpsDenominator;
    const expectedDuration = expected.frameCount / expected.fps;
    if (
      actual.width !== expected.width ||
      actual.height !== expected.height ||
      actualFps !== expected.fps ||
      actual.frameCount !== expected.frameCount ||
      Math.abs(actual.durationSeconds - expectedDuration) > 1 / expected.fps
    ) {
      context.addIssue({
        code: "custom",
        message: "Production preview technical media identity is stale.",
        path: ["technical", "actual"],
      });
    }
    const mediaPaths = [
      evidence.media.fullPreview.relativePath,
      evidence.media.contactSheet.relativePath,
      ...evidence.media.representativeStills.map(
        ({ relativePath }) => relativePath,
      ),
    ];
    if (new Set(mediaPaths).size !== mediaPaths.length) {
      context.addIssue({
        code: "custom",
        message: "Production preview media paths must be unique.",
        path: ["media"],
      });
    }
  });

const PreviewEvidenceV2InputObject = z
  .object({
    ...PreviewEvidenceInputObject.shape,
    schemaVersion: z.literal(2),
    evidenceVersion: z.literal(PRODUCTION_PREVIEW_EVIDENCE_VERSION_V2),
    globalVisual: GlobalVisualPreviewIdentitySchema,
    currentChecks: z
      .object({
        coverage: z.literal("current-all-ready"),
        rendererRegistry: z.literal("current"),
        projections: z.literal("current"),
        globalVisual: z.literal("current"),
        assembly: z.literal("current"),
        mediaIdentity: z.literal("current"),
      })
      .strict()
      .readonly(),
    absentEnhancements: z
      .object({
        globalSoundPlan: z.literal(true),
        bgm: z.literal(true),
        crossSceneAmbience: z.literal(true),
        ducking: z.literal(true),
      })
      .strict()
      .readonly(),
    presentEnhancements: z
      .object({ globalVisualLayers: z.literal(true) })
      .strict()
      .readonly(),
  })
  .strict()
  .superRefine((evidence, context) => {
    const { expected, actual } = evidence.technical;
    const actualFps = actual.fpsNumerator / actual.fpsDenominator;
    const expectedDuration = expected.frameCount / expected.fps;
    if (
      actual.width !== expected.width ||
      actual.height !== expected.height ||
      actualFps !== expected.fps ||
      actual.frameCount !== expected.frameCount ||
      Math.abs(actual.durationSeconds - expectedDuration) > 1 / expected.fps
    ) {
      context.addIssue({
        code: "custom",
        message: "Production preview technical media identity is stale.",
        path: ["technical", "actual"],
      });
    }
    const mediaPaths = [
      evidence.media.fullPreview.relativePath,
      evidence.media.contactSheet.relativePath,
      ...evidence.media.representativeStills.map(
        ({ relativePath }) => relativePath,
      ),
    ];
    if (new Set(mediaPaths).size !== mediaPaths.length) {
      context.addIssue({
        code: "custom",
        message: "Production preview media paths must be unique.",
        path: ["media"],
      });
    }
  });

export const ProductionPreviewEvidenceInputSchema = z
  .union([
    PreviewEvidenceInputObject.readonly(),
    PreviewEvidenceV2InputObject.readonly(),
  ])
  .readonly();

export const computeProductionPreviewEvidenceFingerprint = (
  rawInput: unknown,
) => {
  const record = { ...(rawInput as Record<string, unknown>) };
  delete record.evidenceFingerprint;
  const input = ProductionPreviewEvidenceInputSchema.parse(record);
  return createFingerprint({
    namespace: "production-preview-evidence",
    version: input.schemaVersion,
    value: input,
  });
};

export const ProductionPreviewEvidenceSchema = z
  .union([
    PreviewEvidenceInputObject.extend({
      evidenceFingerprint: Sha256DigestSchema,
    }).strict(),
    PreviewEvidenceV2InputObject.extend({
      evidenceFingerprint: Sha256DigestSchema,
    }).strict(),
  ])
  .superRefine((evidence, context) => {
    const { evidenceFingerprint, ...input } = evidence;
    if (
      evidenceFingerprint !== computeProductionPreviewEvidenceFingerprint(input)
    ) {
      context.addIssue({
        code: "custom",
        message: "ProductionPreviewEvidence fingerprint is stale.",
        path: ["evidenceFingerprint"],
      });
    }
  })
  .readonly();

export const buildProductionPreviewEvidence = (rawInput: unknown) => {
  const isV2 =
    rawInput !== null &&
    typeof rawInput === "object" &&
    !Array.isArray(rawInput) &&
    "globalVisual" in rawInput;
  const record: Record<string, unknown> = {
    ...(rawInput as Record<string, unknown>),
    schemaVersion: isV2 ? 2 : 1,
    evidenceVersion: isV2
      ? PRODUCTION_PREVIEW_EVIDENCE_VERSION_V2
      : PRODUCTION_PREVIEW_EVIDENCE_VERSION,
  };
  delete record.evidenceFingerprint;
  const input = ProductionPreviewEvidenceInputSchema.parse(record);
  return ProductionPreviewEvidenceSchema.parse({
    ...input,
    evidenceFingerprint: computeProductionPreviewEvidenceFingerprint(input),
  });
};

const PreviewMechanicalCheckInputObject = z
  .object({
    schemaVersion: z.literal(1),
    checkVersion: z.literal(PRODUCTION_PREVIEW_MECHANICAL_CHECK_VERSION),
    storyId: StoryIdSchema,
    requirementsFingerprint: Sha256DigestSchema,
    previewAssemblyFingerprint: Sha256DigestSchema,
    evidenceFingerprint: Sha256DigestSchema,
    checks: z
      .object({
        contracts: z.literal("pass"),
        sceneCoverage: z.literal("pass"),
        rendererRegistry: z.literal("pass"),
        projections: z.literal("pass"),
        composition: z.literal("pass"),
        media: z.literal("pass"),
        completeDecode: z.literal("pass"),
        enhancementAbsence: z.literal("pass"),
      })
      .strict()
      .readonly(),
    aggregateStatus: z.literal("mechanically-ready"),
    handoff: z.literal("awaiting explicit user preview decision"),
  })
  .strict();

const PreviewMechanicalCheckV2InputObject = z
  .object({
    ...PreviewMechanicalCheckInputObject.shape,
    schemaVersion: z.literal(2),
    checkVersion: z.literal(PRODUCTION_PREVIEW_MECHANICAL_CHECK_VERSION_V2),
    checks: z
      .object({
        contracts: z.literal("pass"),
        sceneCoverage: z.literal("pass"),
        rendererRegistry: z.literal("pass"),
        projections: z.literal("pass"),
        globalVisual: z.literal("pass"),
        composition: z.literal("pass"),
        media: z.literal("pass"),
        completeDecode: z.literal("pass"),
        enhancementPolicy: z.literal("pass"),
      })
      .strict()
      .readonly(),
  })
  .strict();

export const ProductionPreviewMechanicalCheckInputSchema = z
  .union([
    PreviewMechanicalCheckInputObject.readonly(),
    PreviewMechanicalCheckV2InputObject.readonly(),
  ])
  .readonly();

export const computeProductionPreviewMechanicalCheckFingerprint = (
  rawInput: unknown,
) => {
  const record = { ...(rawInput as Record<string, unknown>) };
  delete record.checkFingerprint;
  const input = ProductionPreviewMechanicalCheckInputSchema.parse(record);
  return createFingerprint({
    namespace: "production-preview-mechanical-check",
    version: input.schemaVersion,
    value: input,
  });
};

export const ProductionPreviewMechanicalCheckSchema = z
  .union([
    PreviewMechanicalCheckInputObject.extend({
      checkFingerprint: Sha256DigestSchema,
    }).strict(),
    PreviewMechanicalCheckV2InputObject.extend({
      checkFingerprint: Sha256DigestSchema,
    }).strict(),
  ])
  .superRefine((check, context) => {
    const { checkFingerprint, ...input } = check;
    if (
      checkFingerprint !==
      computeProductionPreviewMechanicalCheckFingerprint(input)
    ) {
      context.addIssue({
        code: "custom",
        message: "Production preview mechanical check fingerprint is stale.",
        path: ["checkFingerprint"],
      });
    }
  })
  .readonly();

export const buildProductionPreviewMechanicalCheck = (rawInput: unknown) => {
  const isV2 =
    rawInput !== null &&
    typeof rawInput === "object" &&
    !Array.isArray(rawInput) &&
    "checks" in rawInput &&
    (rawInput as { readonly checks?: unknown }).checks !== null &&
    typeof (rawInput as { readonly checks?: unknown }).checks === "object" &&
    "globalVisual" in
      ((rawInput as { readonly checks: Record<string, unknown> }).checks ?? {});
  const record: Record<string, unknown> = {
    ...(rawInput as Record<string, unknown>),
    schemaVersion: isV2 ? 2 : 1,
    checkVersion: isV2
      ? PRODUCTION_PREVIEW_MECHANICAL_CHECK_VERSION_V2
      : PRODUCTION_PREVIEW_MECHANICAL_CHECK_VERSION,
  };
  delete record.checkFingerprint;
  const input = ProductionPreviewMechanicalCheckInputSchema.parse(record);
  return ProductionPreviewMechanicalCheckSchema.parse({
    ...input,
    checkFingerprint: computeProductionPreviewMechanicalCheckFingerprint(input),
  });
};

export type ProductionPreviewAssembly = z.infer<
  typeof ProductionPreviewAssemblySchema
>;
export type ProductionPreviewEvidence = z.infer<
  typeof ProductionPreviewEvidenceSchema
>;
export type ProductionPreviewMechanicalCheck = z.infer<
  typeof ProductionPreviewMechanicalCheckSchema
>;

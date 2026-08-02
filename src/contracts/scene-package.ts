import { z } from "zod";

import { createFingerprint } from "./fingerprint";
import {
  MeaningIdSchema,
  NonNegativeIntegerSchema,
  PositiveIntegerSchema,
  Sha256DigestSchema,
  StoryIdSchema,
} from "./primitives";
import { SelectedResourceRefSchema } from "./resource-catalog";
import { SceneRendererIdSchema } from "./scene-primitives";

export const STORY_VISUAL_RUNTIME_VERSION = "story-visual-runtime-v1" as const;
export const SCENE_AUDIO_RUNTIME_VERSION = "scene-audio-runtime-v1" as const;

export const SceneRendererBindingSchema = z
  .object({
    rendererId: SceneRendererIdSchema,
    rendererSourceFingerprint: Sha256DigestSchema,
  })
  .strict()
  .readonly();

const AbsoluteBeatFrameRangeSchema = z
  .object({
    startFrame: NonNegativeIntegerSchema,
    endFrame: PositiveIntegerSchema,
  })
  .strict()
  .refine((range) => range.endFrame > range.startFrame, {
    message: "Scene package Beat range must be non-empty.",
    path: ["endFrame"],
  })
  .readonly();

const ScenePackageInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    storyId: StoryIdSchema,
    meaningId: MeaningIdSchema,
    beatFrameRange: AbsoluteBeatFrameRangeSchema,
    taskInputFingerprint: Sha256DigestSchema,
    semanticTimingFingerprint: Sha256DigestSchema,
    visualStyleFingerprint: Sha256DigestSchema,
    resourceCatalogFingerprint: Sha256DigestSchema,
    externalSnapshotFingerprints: z.array(Sha256DigestSchema).max(8).readonly(),
    selectionFingerprint: Sha256DigestSchema,
    fidelityReceiptFingerprint: Sha256DigestSchema,
    visualPlanFingerprint: Sha256DigestSchema,
    shotPlanFingerprint: Sha256DigestSchema,
    syncAnchorFingerprint: Sha256DigestSchema,
    soundPlanFingerprint: Sha256DigestSchema,
    rendererBinding: SceneRendererBindingSchema,
    selectedResources: z.array(SelectedResourceRefSchema).max(128).readonly(),
    visualRuntimeVersion: z.literal(STORY_VISUAL_RUNTIME_VERSION),
    sceneAudioRuntimeVersion: z.literal(SCENE_AUDIO_RUNTIME_VERSION),
    sceneVisualFingerprint: Sha256DigestSchema,
    sceneSoundFingerprint: Sha256DigestSchema,
  })
  .strict();

export type ScenePackageInput = z.infer<typeof ScenePackageInputSchema>;

export const computeSceneVisualFingerprint = (
  input: Pick<
    ScenePackageInput,
    | "taskInputFingerprint"
    | "visualStyleFingerprint"
    | "resourceCatalogFingerprint"
    | "externalSnapshotFingerprints"
    | "selectionFingerprint"
    | "fidelityReceiptFingerprint"
    | "visualPlanFingerprint"
    | "shotPlanFingerprint"
    | "syncAnchorFingerprint"
    | "rendererBinding"
    | "selectedResources"
    | "visualRuntimeVersion"
  >,
) =>
  createFingerprint({
    namespace: "scene-visual-projection-input",
    version: 1,
    value: input,
  });

export const computeSceneSoundFingerprint = (
  input: Pick<
    ScenePackageInput,
    | "taskInputFingerprint"
    | "resourceCatalogFingerprint"
    | "syncAnchorFingerprint"
    | "soundPlanFingerprint"
    | "selectedResources"
    | "sceneAudioRuntimeVersion"
  >,
) =>
  createFingerprint({
    namespace: "scene-sound-projection-input",
    version: 1,
    value: input,
  });

export const computeScenePackageFingerprint = (
  rawPackage: ScenePackageInput & { readonly packageFingerprint?: unknown },
) => {
  const input = { ...rawPackage } as Record<string, unknown>;
  delete input.packageFingerprint;
  return createFingerprint({
    namespace: "scene-package",
    version: 1,
    value: input,
  });
};

export const ScenePackageSchema = ScenePackageInputSchema.extend({
  packageFingerprint: Sha256DigestSchema,
})
  .strict()
  .superRefine((scenePackage, context) => {
    if (
      new Set(
        scenePackage.selectedResources.map((resource) => resource.resourceId),
      ).size !== scenePackage.selectedResources.length ||
      new Set(scenePackage.externalSnapshotFingerprints).size !==
        scenePackage.externalSnapshotFingerprints.length ||
      scenePackage.packageFingerprint !==
        computeScenePackageFingerprint(scenePackage)
    ) {
      context.addIssue({
        code: "custom",
        message: "Scene package identities or fingerprint are invalid.",
        path: ["packageFingerprint"],
      });
    }
  })
  .readonly();

const SceneFallbackInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    taskInputFingerprint: Sha256DigestSchema,
    meaningId: MeaningIdSchema,
    status: z.literal("approved"),
    reason: z.string().trim().min(1).max(1000),
  })
  .strict();

export const SceneFallbackDeclarationSchema = SceneFallbackInputSchema.extend({
  fallbackFingerprint: Sha256DigestSchema,
})
  .strict()
  .superRefine((fallback, context) => {
    const input = { ...fallback } as Record<string, unknown>;
    delete input.fallbackFingerprint;
    const expected = createFingerprint({
      namespace: "scene-fallback-declaration",
      version: 1,
      value: input,
    });
    if (fallback.fallbackFingerprint !== expected) {
      context.addIssue({
        code: "custom",
        message: "Scene fallback fingerprint is stale.",
        path: ["fallbackFingerprint"],
      });
    }
  })
  .readonly();

export const buildSceneFallbackDeclaration = (rawInput: {
  readonly taskInputFingerprint: unknown;
  readonly meaningId: unknown;
  readonly reason: unknown;
}) => {
  const input = SceneFallbackInputSchema.parse({
    schemaVersion: 1,
    taskInputFingerprint: rawInput.taskInputFingerprint,
    meaningId: rawInput.meaningId,
    status: "approved",
    reason: rawInput.reason,
  });
  return SceneFallbackDeclarationSchema.parse({
    ...input,
    fallbackFingerprint: createFingerprint({
      namespace: "scene-fallback-declaration",
      version: 1,
      value: input,
    }),
  });
};

export const SceneCoverageDriftLayerSchema = z.enum([
  "task-input",
  "visual-style",
  "semantic-timing",
  "resource-catalog",
  "external-reference",
  "recipe-selection",
  "reference-fidelity",
  "visual-plan",
  "shot-plan",
  "sync-anchor",
  "sound-plan",
  "selected-resource",
  "renderer-source",
  "runtime-version",
]);

const CoverageEntrySchema = z.discriminatedUnion("status", [
  z
    .object({
      meaningId: MeaningIdSchema,
      status: z.literal("ready"),
      packageFingerprint: Sha256DigestSchema,
      rendererId: SceneRendererIdSchema,
    })
    .strict()
    .readonly(),
  z
    .object({
      meaningId: MeaningIdSchema,
      status: z.literal("fallback"),
      fallbackFingerprint: Sha256DigestSchema,
    })
    .strict()
    .readonly(),
  z
    .object({
      meaningId: MeaningIdSchema,
      status: z.literal("missing"),
    })
    .strict()
    .readonly(),
  z
    .object({
      meaningId: MeaningIdSchema,
      status: z.literal("stale"),
      stalePackageFingerprint: Sha256DigestSchema,
      driftLayer: SceneCoverageDriftLayerSchema,
    })
    .strict()
    .readonly(),
]);

const SceneCoverageInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    storyId: StoryIdSchema,
    storyBeatOrder: z.array(MeaningIdSchema).min(1).readonly(),
    entries: z.array(CoverageEntrySchema).min(1).readonly(),
  })
  .strict();

export const computeSceneCoverageFingerprint = (
  rawCoverage: z.input<typeof SceneCoverageInputSchema> & {
    readonly coverageFingerprint?: unknown;
  },
) => {
  const input = { ...rawCoverage } as Record<string, unknown>;
  delete input.coverageFingerprint;
  return createFingerprint({
    namespace: "scene-coverage-map",
    version: 1,
    value: input,
  });
};

export const SceneCoverageMapSchema = SceneCoverageInputSchema.extend({
  coverageFingerprint: Sha256DigestSchema,
})
  .strict()
  .superRefine((coverage, context) => {
    if (
      new Set(coverage.storyBeatOrder).size !==
        coverage.storyBeatOrder.length ||
      coverage.entries.length !== coverage.storyBeatOrder.length ||
      coverage.entries.some(
        (entry, index) => entry.meaningId !== coverage.storyBeatOrder[index],
      ) ||
      coverage.coverageFingerprint !== computeSceneCoverageFingerprint(coverage)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Scene coverage must match unique StoryBeat order and current fingerprint.",
        path: ["coverageFingerprint"],
      });
    }
  })
  .readonly();

export const buildSceneCoverageMap = (rawInput: {
  readonly storyId: unknown;
  readonly storyBeatOrder: readonly unknown[];
  readonly packages: readonly unknown[];
  readonly fallbacks: readonly unknown[];
  readonly stalePackages: readonly {
    readonly meaningId: unknown;
    readonly packageFingerprint: unknown;
    readonly driftLayer: unknown;
  }[];
}) => {
  const storyId = StoryIdSchema.parse(rawInput.storyId);
  const storyBeatOrder = z
    .array(MeaningIdSchema)
    .min(1)
    .parse(rawInput.storyBeatOrder);
  if (new Set(storyBeatOrder).size !== storyBeatOrder.length) {
    throw new Error("Scene coverage StoryBeat order must be unique.");
  }
  const packages = rawInput.packages.map((value) =>
    ScenePackageSchema.parse(value),
  );
  const fallbacks = rawInput.fallbacks.map((value) =>
    SceneFallbackDeclarationSchema.parse(value),
  );
  const stalePackages = rawInput.stalePackages.map((stale) => ({
    meaningId: MeaningIdSchema.parse(stale.meaningId),
    packageFingerprint: Sha256DigestSchema.parse(stale.packageFingerprint),
    driftLayer: SceneCoverageDriftLayerSchema.parse(stale.driftLayer),
  }));
  const allowed = new Set(storyBeatOrder);
  const allClaims = [
    ...packages.map((scenePackage) => scenePackage.meaningId),
    ...fallbacks.map((fallback) => fallback.meaningId),
    ...stalePackages.map((stale) => stale.meaningId),
  ];
  if (
    allClaims.some((meaningId) => !allowed.has(meaningId)) ||
    new Set(allClaims).size !== allClaims.length ||
    packages.some((scenePackage) => scenePackage.storyId !== storyId)
  ) {
    throw new Error(
      "Scene coverage claims are unknown duplicate or conflicting.",
    );
  }
  const packageByMeaning = new Map(
    packages.map((scenePackage) => [scenePackage.meaningId, scenePackage]),
  );
  const fallbackByMeaning = new Map(
    fallbacks.map((fallback) => [fallback.meaningId, fallback]),
  );
  const staleByMeaning = new Map(
    stalePackages.map((stale) => [stale.meaningId, stale]),
  );
  const entries = storyBeatOrder.map((meaningId) => {
    const scenePackage = packageByMeaning.get(meaningId);
    if (scenePackage) {
      return {
        meaningId,
        status: "ready" as const,
        packageFingerprint: scenePackage.packageFingerprint,
        rendererId: scenePackage.rendererBinding.rendererId,
      };
    }
    const fallback = fallbackByMeaning.get(meaningId);
    if (fallback) {
      return {
        meaningId,
        status: "fallback" as const,
        fallbackFingerprint: fallback.fallbackFingerprint,
      };
    }
    const stale = staleByMeaning.get(meaningId);
    if (stale) {
      return {
        meaningId,
        status: "stale" as const,
        stalePackageFingerprint: stale.packageFingerprint,
        driftLayer: stale.driftLayer,
      };
    }
    return { meaningId, status: "missing" as const };
  });
  const input = SceneCoverageInputSchema.parse({
    schemaVersion: 1,
    storyId,
    storyBeatOrder,
    entries,
  });
  return SceneCoverageMapSchema.parse({
    ...input,
    coverageFingerprint: computeSceneCoverageFingerprint(input),
  });
};

export type ScenePackage = z.infer<typeof ScenePackageSchema>;
export type SceneCoverageMap = z.infer<typeof SceneCoverageMapSchema>;

import { z } from "zod";

import { createFingerprint } from "./fingerprint";
import {
  CompositionIdSchema,
  MeaningIdSchema,
  PositiveIntegerSchema,
  Sha256DigestSchema,
  StoryIdSchema,
} from "./primitives";
import { ProductionRunIdSchema } from "./production-run";
import {
  STORY_COMPOSITION_TIMELINE_VERSION,
  getStoryCompositionDurationInFrames,
} from "./story-composition";

export const PRODUCTION_RENDER_PLAN_VERSION =
  "production-render-plan-v4" as const;
export const PRODUCTION_RENDER_READY_VERSION =
  "production-render-ready-v4" as const;
export const PRODUCTION_RENDER_POLICY_VERSION =
  "remotion-detached-h264-aac-v1" as const;

const ScenePackageIdentitySchema = z
  .object({
    meaningId: MeaningIdSchema,
    packageFingerprint: Sha256DigestSchema,
  })
  .strict()
  .readonly();

export const ProductionGlobalVisualRenderIdentitySchema = z
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

export const ProductionRenderPolicySchema = z
  .object({
    policyVersion: z.literal(PRODUCTION_RENDER_POLICY_VERSION),
    codec: z.literal("h264"),
    audioCodec: z.literal("aac"),
    pixelFormat: z.literal("yuv420p"),
    entryPoint: z.literal("src/index.ts"),
    launchMode: z.literal("detached-spawn-acknowledgement"),
  })
  .strict()
  .readonly();

const RenderPlanInputObject = z
  .object({
    schemaVersion: z.literal(1),
    contractVersion: z.literal(PRODUCTION_RENDER_PLAN_VERSION),
    runId: ProductionRunIdSchema,
    storyId: StoryIdSchema,
    requirementsFingerprint: Sha256DigestSchema,
    storyFingerprint: Sha256DigestSchema,
    sealedNarrationFingerprint: Sha256DigestSchema,
    masteredNarrationFingerprint: Sha256DigestSchema,
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
    sceneSoundProjectionFingerprint: Sha256DigestSchema,
    globalVisual: ProductionGlobalVisualRenderIdentitySchema,
    compositionId: CompositionIdSchema,
    compositionSourceChecksum: Sha256DigestSchema,
    width: PositiveIntegerSchema,
    height: PositiveIntegerSchema,
    fps: PositiveIntegerSchema.max(120),
    timelinePolicyVersion: z.literal(STORY_COMPOSITION_TIMELINE_VERSION),
    sourceReferencesFingerprint: Sha256DigestSchema,
    semanticTimingFrameCount: PositiveIntegerSchema,
    frameCount: PositiveIntegerSchema,
    layerOrder: z
      .tuple([
        z.literal("global-visual"),
        z.literal("story-visual"),
        z.literal("narrative-core"),
      ])
      .readonly(),
    mixOrder: z
      .tuple([z.literal("narration"), z.literal("scene-local-sound")])
      .readonly(),
    remotionVersion: z.string().regex(/^\d+\.\d+\.\d+$/u),
    renderPolicy: ProductionRenderPolicySchema,
  })
  .strict()
  .superRefine((plan, context) => {
    const ids = plan.scenePackages.map(({ meaningId }) => meaningId);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        message: "Production render plan Scene identities must be unique.",
        path: ["scenePackages"],
      });
    }
    if (
      plan.frameCount !==
      getStoryCompositionDurationInFrames(plan.semanticTimingFrameCount)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Production render frameCount must equal the resolved SemanticTiming duration.",
        path: ["frameCount"],
      });
    }
  });

export const ProductionRenderPlanInputSchema = RenderPlanInputObject.readonly();

export const computeProductionRenderPlanFingerprint = (rawInput: unknown) => {
  const record = { ...(rawInput as Record<string, unknown>) };
  delete record.renderPlanFingerprint;
  const input = ProductionRenderPlanInputSchema.parse(record);
  return createFingerprint({
    namespace: "production-render-plan",
    version: 1,
    value: input,
  });
};

export const ProductionRenderPlanSchema = RenderPlanInputObject.extend({
  renderPlanFingerprint: Sha256DigestSchema,
})
  .strict()
  .superRefine((plan, context) => {
    const { renderPlanFingerprint, ...input } = plan;
    if (
      renderPlanFingerprint !== computeProductionRenderPlanFingerprint(input)
    ) {
      context.addIssue({
        code: "custom",
        message: "Production render plan fingerprint is stale.",
        path: ["renderPlanFingerprint"],
      });
    }
  })
  .readonly();

export const buildProductionRenderPlan = (rawInput: unknown) => {
  const input = ProductionRenderPlanInputSchema.parse({
    ...(rawInput as Record<string, unknown>),
    schemaVersion: 1,
    contractVersion: PRODUCTION_RENDER_PLAN_VERSION,
    renderPolicy: {
      policyVersion: PRODUCTION_RENDER_POLICY_VERSION,
      codec: "h264",
      audioCodec: "aac",
      pixelFormat: "yuv420p",
      entryPoint: "src/index.ts",
      launchMode: "detached-spawn-acknowledgement",
    },
  });
  return ProductionRenderPlanSchema.parse({
    ...input,
    renderPlanFingerprint: computeProductionRenderPlanFingerprint(input),
  });
};

const RenderReadyInputObject = z
  .object({
    schemaVersion: z.literal(1),
    contractVersion: z.literal(PRODUCTION_RENDER_READY_VERSION),
    runId: ProductionRunIdSchema,
    storyId: StoryIdSchema,
    requirementsFingerprint: Sha256DigestSchema,
    renderPlanFingerprint: Sha256DigestSchema,
    status: z.literal("render-ready"),
    handoff: z.literal("awaiting-automatic-delivery"),
  })
  .strict();

export const ProductionRenderReadyInputSchema =
  RenderReadyInputObject.readonly();

export const computeProductionRenderReadyFingerprint = (rawInput: unknown) => {
  const record = { ...(rawInput as Record<string, unknown>) };
  delete record.renderReadyFingerprint;
  const input = ProductionRenderReadyInputSchema.parse(record);
  return createFingerprint({
    namespace: "production-render-ready",
    version: 1,
    value: input,
  });
};

export const ProductionRenderReadySchema = RenderReadyInputObject.extend({
  renderReadyFingerprint: Sha256DigestSchema,
})
  .strict()
  .superRefine((ready, context) => {
    const { renderReadyFingerprint, ...input } = ready;
    if (
      renderReadyFingerprint !== computeProductionRenderReadyFingerprint(input)
    ) {
      context.addIssue({
        code: "custom",
        message: "Production render-ready fingerprint is stale.",
        path: ["renderReadyFingerprint"],
      });
    }
  })
  .readonly();

export const buildProductionRenderReady = ({
  plan: rawPlan,
}: {
  readonly plan: unknown;
}) => {
  const plan = ProductionRenderPlanSchema.parse(rawPlan);
  const input = ProductionRenderReadyInputSchema.parse({
    schemaVersion: 1,
    contractVersion: PRODUCTION_RENDER_READY_VERSION,
    runId: plan.runId,
    storyId: plan.storyId,
    requirementsFingerprint: plan.requirementsFingerprint,
    renderPlanFingerprint: plan.renderPlanFingerprint,
    status: "render-ready",
    handoff: "awaiting-automatic-delivery",
  });
  return ProductionRenderReadySchema.parse({
    ...input,
    renderReadyFingerprint: computeProductionRenderReadyFingerprint(input),
  });
};

export type ProductionRenderPlan = z.infer<typeof ProductionRenderPlanSchema>;
export type ProductionRenderReady = z.infer<typeof ProductionRenderReadySchema>;

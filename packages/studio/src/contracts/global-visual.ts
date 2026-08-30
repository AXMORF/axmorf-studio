import { z } from "zod";

import { createFingerprint } from "./fingerprint";
import {
  CompositionIdSchema,
  NonNegativeIntegerSchema,
  PositiveIntegerSchema,
  Sha256DigestSchema,
  StoryIdSchema,
} from "./primitives";

export const GLOBAL_VISUAL_PLAN_VERSION = "global-visual-plan-v1" as const;
export const GLOBAL_VISUAL_PROJECTION_VERSION =
  "global-visual-projection-v1" as const;
export const GLOBAL_VISUAL_PROJECTION_VERSION_V2 =
  "global-visual-projection-v2" as const;

const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const UnitIntervalSchema = z.number().finite().min(0).max(1);
const InsetSchema = z
  .object({
    top: NonNegativeIntegerSchema,
    right: NonNegativeIntegerSchema,
    bottom: NonNegativeIntegerSchema,
    left: NonNegativeIntegerSchema,
  })
  .strict()
  .readonly();

const MotifWindowSchema = z
  .object({
    startFrame: NonNegativeIntegerSchema,
    endFrame: PositiveIntegerSchema,
    axis: z.enum(["x", "y"]),
    direction: z.union([z.literal(-1), z.literal(1)]),
  })
  .strict()
  .superRefine((window, context) => {
    if (window.endFrame <= window.startFrame) {
      context.addIssue({
        code: "custom",
        message: "Continuity motif windows must be non-empty.",
      });
    }
  })
  .readonly();

const GlobalVisualInputObject = z
  .object({
    schemaVersion: z.literal(1),
    planVersion: z.literal(GLOBAL_VISUAL_PLAN_VERSION),
    storyId: StoryIdSchema,
    compositionId: CompositionIdSchema,
    width: PositiveIntegerSchema,
    height: PositiveIntegerSchema,
    fps: PositiveIntegerSchema,
    durationInFrames: PositiveIntegerSchema,
    captionSafeArea: InsetSchema,
    catalogFingerprint: Sha256DigestSchema,
    frameTreatment: z
      .object({
        inset: NonNegativeIntegerSchema,
        borderWidth: NonNegativeIntegerSchema,
        borderColor: HexColorSchema,
        borderOpacity: UnitIntervalSchema,
        vignetteOpacity: UnitIntervalSchema,
        grainOpacity: UnitIntervalSchema,
      })
      .strict()
      .readonly(),
    continuityMotif: z
      .object({
        color: HexColorSchema,
        strokeWidth: PositiveIntegerSchema,
        opacity: UnitIntervalSchema,
        motionPolicy: z.literal("linear-frame-progress-v1"),
        windows: z.array(MotifWindowSchema).max(64).readonly(),
      })
      .strict()
      .readonly(),
  })
  .strict()
  .superRefine((plan, context) => {
    if (
      plan.captionSafeArea.left + plan.captionSafeArea.right >= plan.width ||
      plan.captionSafeArea.top + plan.captionSafeArea.bottom >= plan.height
    ) {
      context.addIssue({
        code: "custom",
        message: "Caption safe area must leave a visible interior.",
        path: ["captionSafeArea"],
      });
    }
    plan.continuityMotif.windows.forEach((window, index) => {
      if (window.endFrame > plan.durationInFrames) {
        context.addIssue({
          code: "custom",
          message: "Continuity motif window exceeds the composition.",
          path: ["continuityMotif", "windows", index],
        });
      }
      if (
        index > 0 &&
        window.startFrame < plan.continuityMotif.windows[index - 1].endFrame
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Continuity motif windows must be sorted and non-overlapping.",
          path: ["continuityMotif", "windows", index],
        });
      }
    });
  })
  .readonly();

export const GlobalVisualPlanInputSchema = GlobalVisualInputObject;

export const computeGlobalVisualPlanFingerprint = (rawInput: unknown) =>
  createFingerprint({
    namespace: "global-visual-plan",
    version: 1,
    value: GlobalVisualPlanInputSchema.parse(rawInput),
  });

export const GlobalVisualPlanSchema = GlobalVisualInputObject.unwrap()
  .safeExtend({
    planFingerprint: Sha256DigestSchema,
  })
  .strict()
  .superRefine((plan, context) => {
    const { planFingerprint, ...input } = plan;
    if (planFingerprint !== computeGlobalVisualPlanFingerprint(input)) {
      context.addIssue({
        code: "custom",
        message: "GlobalVisualPlan fingerprint is stale.",
        path: ["planFingerprint"],
      });
    }
  })
  .readonly();

export const createGlobalVisualPlan = (rawInput: unknown) => {
  const input = GlobalVisualPlanInputSchema.parse(rawInput);
  return GlobalVisualPlanSchema.parse({
    ...input,
    planFingerprint: computeGlobalVisualPlanFingerprint(input),
  });
};

const GlobalVisualProjectionV1InputObject = z
  .object({
    schemaVersion: z.literal(1),
    projectionVersion: z.literal(GLOBAL_VISUAL_PROJECTION_VERSION),
    storyId: StoryIdSchema,
    compositionId: CompositionIdSchema,
    durationInFrames: PositiveIntegerSchema,
    globalVisualPlanFingerprint: Sha256DigestSchema,
    sourceChecksum: Sha256DigestSchema,
  })
  .strict();

const GlobalVisualProjectionV2InputObject = z
  .object({
    schemaVersion: z.literal(2),
    projectionVersion: z.literal(GLOBAL_VISUAL_PROJECTION_VERSION_V2),
    storyId: StoryIdSchema,
    compositionId: CompositionIdSchema,
    durationInFrames: PositiveIntegerSchema,
    requirementsFingerprint: Sha256DigestSchema,
    assignmentFingerprint: Sha256DigestSchema,
    packageFingerprint: Sha256DigestSchema,
    globalVisualPlanFingerprint: Sha256DigestSchema,
    rendererSourceGraphFingerprint: Sha256DigestSchema,
    selectedResourcesFingerprint: Sha256DigestSchema,
    productionResultFingerprint: Sha256DigestSchema,
  })
  .strict();

export const GlobalVisualProjectionInputSchema = z
  .union([
    GlobalVisualProjectionV1InputObject.readonly(),
    GlobalVisualProjectionV2InputObject.readonly(),
  ])
  .readonly();

export const computeGlobalVisualProjectionFingerprint = (rawInput: unknown) => {
  const record = { ...(rawInput as Record<string, unknown>) };
  delete record.projectionFingerprint;
  const input = GlobalVisualProjectionInputSchema.parse(record);
  return createFingerprint({
    namespace: "global-visual-projection",
    version: input.schemaVersion,
    value: input,
  });
};

export const GlobalVisualProjectionSchema = z
  .union([
    GlobalVisualProjectionV1InputObject.extend({
      projectionFingerprint: Sha256DigestSchema,
    }).strict(),
    GlobalVisualProjectionV2InputObject.extend({
      projectionFingerprint: Sha256DigestSchema,
    }).strict(),
  ])
  .superRefine((projection, context) => {
    const { projectionFingerprint, ...input } = projection;
    if (
      projectionFingerprint !== computeGlobalVisualProjectionFingerprint(input)
    ) {
      context.addIssue({
        code: "custom",
        message: "GlobalVisualProjection fingerprint is stale.",
        path: ["projectionFingerprint"],
      });
    }
  })
  .readonly();

export const createGlobalVisualProjection = (rawInput: unknown) => {
  const isV2 =
    rawInput !== null &&
    typeof rawInput === "object" &&
    !Array.isArray(rawInput) &&
    "requirementsFingerprint" in rawInput;
  const record: Record<string, unknown> = {
    ...(rawInput as Record<string, unknown>),
    schemaVersion: isV2 ? 2 : 1,
    projectionVersion: isV2
      ? GLOBAL_VISUAL_PROJECTION_VERSION_V2
      : GLOBAL_VISUAL_PROJECTION_VERSION,
  };
  delete record.projectionFingerprint;
  const input = GlobalVisualProjectionInputSchema.parse(record);
  return GlobalVisualProjectionSchema.parse({
    ...input,
    projectionFingerprint: computeGlobalVisualProjectionFingerprint(input),
  });
};

export type GlobalVisualPlan = z.infer<typeof GlobalVisualPlanSchema>;
export type GlobalVisualProjection = z.infer<
  typeof GlobalVisualProjectionSchema
>;

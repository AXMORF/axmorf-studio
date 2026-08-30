import { z } from "zod";

import { createFingerprint } from "./fingerprint";
import {
  CompositionIdSchema,
  PositiveIntegerSchema,
  Sha256DigestSchema,
  StoryIdSchema,
} from "./primitives";

export const FINAL_ASSEMBLY_PLAN_VERSION = "final-assembly-plan-v1" as const;
export const FINAL_ASSEMBLY_Z_ORDER_VERSION =
  "scene-global-visual-caption-v1" as const;
export const FINAL_ASSEMBLY_MIX_ORDER_VERSION =
  "narration-sound-contributions-v1" as const;

const FinalAssemblyInputObject = z
  .object({
    schemaVersion: z.literal(1),
    planVersion: z.literal(FINAL_ASSEMBLY_PLAN_VERSION),
    storyId: StoryIdSchema,
    compositionId: CompositionIdSchema,
    fps: PositiveIntegerSchema,
    width: PositiveIntegerSchema,
    height: PositiveIntegerSchema,
    durationInFrames: PositiveIntegerSchema,
    remotionVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    narrativeReportFingerprint: Sha256DigestSchema,
    sealedNarrationChecksum: Sha256DigestSchema,
    sealedNarrationFingerprint: Sha256DigestSchema,
    semanticTimingFingerprint: Sha256DigestSchema,
    captionCuesFingerprint: Sha256DigestSchema,
    resourceCatalogFingerprint: Sha256DigestSchema,
    sceneCoverageFingerprint: Sha256DigestSchema,
    scenePackageFingerprints: z
      .array(Sha256DigestSchema)
      .min(1)
      .max(256)
      .readonly(),
    rendererRegistryFingerprint: Sha256DigestSchema,
    storyVisualProjectionFingerprint: Sha256DigestSchema,
    soundDesignProjectionFingerprint: Sha256DigestSchema,
    globalVisualPlanFingerprint: Sha256DigestSchema,
    globalVisualProjectionFingerprint: Sha256DigestSchema,
    compositionSourceChecksum: Sha256DigestSchema,
    zOrderVersion: z.literal(FINAL_ASSEMBLY_Z_ORDER_VERSION),
    mixOrderVersion: z.literal(FINAL_ASSEMBLY_MIX_ORDER_VERSION),
  })
  .strict()
  .superRefine((plan, context) => {
    const sorted = [...plan.scenePackageFingerprints].sort();
    plan.scenePackageFingerprints.forEach((fingerprint, index) => {
      if (fingerprint !== sorted[index]) {
        context.addIssue({
          code: "custom",
          message: "Scene package identities must be canonically ordered.",
          path: ["scenePackageFingerprints", index],
        });
      }
    });
    if (
      new Set(plan.scenePackageFingerprints).size !==
      plan.scenePackageFingerprints.length
    ) {
      context.addIssue({
        code: "custom",
        message: "Scene package identities must not contain duplicates.",
        path: ["scenePackageFingerprints"],
      });
    }
  })
  .readonly();

export const FinalAssemblyPlanInputSchema = FinalAssemblyInputObject;

export const createFinalAssemblyFingerprint = (rawInput: unknown) =>
  createFingerprint({
    namespace: "final-assembly-plan",
    version: 1,
    value: FinalAssemblyPlanInputSchema.parse(rawInput),
  });

export const FinalAssemblyPlanSchema = FinalAssemblyInputObject.unwrap()
  .safeExtend({
    aggregateStatus: z.literal("pass").default("pass"),
    finalAssemblyFingerprint: Sha256DigestSchema,
  })
  .strict()
  .superRefine((plan, context) => {
    const finalAssemblyFingerprint = plan.finalAssemblyFingerprint;
    const input = FinalAssemblyPlanInputSchema.parse(
      Object.fromEntries(
        Object.entries(plan).filter(
          ([key]) =>
            key !== "aggregateStatus" && key !== "finalAssemblyFingerprint",
        ),
      ),
    );
    if (finalAssemblyFingerprint !== createFinalAssemblyFingerprint(input)) {
      context.addIssue({
        code: "custom",
        message: "FinalAssembly fingerprint is stale.",
        path: ["finalAssemblyFingerprint"],
      });
    }
  })
  .readonly();

export const createFinalAssemblyPlan = (rawInput: unknown) => {
  const input = FinalAssemblyPlanInputSchema.parse(rawInput);
  return FinalAssemblyPlanSchema.parse({
    ...input,
    aggregateStatus: "pass",
    finalAssemblyFingerprint: createFinalAssemblyFingerprint(input),
  });
};

export type FinalAssemblyPlan = z.infer<typeof FinalAssemblyPlanSchema>;

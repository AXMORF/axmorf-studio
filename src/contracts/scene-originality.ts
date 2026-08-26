import { z } from "zod";

import { createFingerprint } from "./fingerprint";
import { Sha256DigestSchema, StoryIdSchema } from "./primitives";

export const SCENE_ORIGINALITY_BASELINE_VERSION =
  "scene-originality-baseline-v1" as const;

const SceneOriginalityIdentitySchema = z
  .strictObject({
    storyId: StoryIdSchema,
    rendererFingerprints: z.array(Sha256DigestSchema).readonly(),
  })
  .superRefine(({ rendererFingerprints }, context) => {
    const sorted = [...rendererFingerprints].sort((left, right) =>
      left.localeCompare(right),
    );
    if (
      new Set(rendererFingerprints).size !== rendererFingerprints.length ||
      rendererFingerprints.some(
        (fingerprint, index) => fingerprint !== sorted[index],
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "Scene originality fingerprints must be sorted and unique.",
        path: ["rendererFingerprints"],
      });
    }
  })
  .readonly();

const baselineFingerprint = (
  identity: z.infer<typeof SceneOriginalityIdentitySchema>,
) =>
  createFingerprint({
    namespace: "scene-originality-baseline",
    version: 1,
    value: identity,
  });

export const SceneOriginalityBaselineSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    contractVersion: z.literal(SCENE_ORIGINALITY_BASELINE_VERSION),
    storyId: StoryIdSchema,
    rendererFingerprints: z.array(Sha256DigestSchema).readonly(),
    baselineFingerprint: Sha256DigestSchema,
  })
  .superRefine((baseline, context) => {
    const identity = SceneOriginalityIdentitySchema.safeParse({
      storyId: baseline.storyId,
      rendererFingerprints: baseline.rendererFingerprints,
    });
    if (
      identity.success &&
      baseline.baselineFingerprint !== baselineFingerprint(identity.data)
    ) {
      context.addIssue({
        code: "custom",
        message: "Scene originality baseline fingerprint is stale.",
        path: ["baselineFingerprint"],
      });
    }
  })
  .readonly();

export const buildSceneOriginalityBaseline = (rawInput: unknown) => {
  const identity = SceneOriginalityIdentitySchema.parse(rawInput);
  return SceneOriginalityBaselineSchema.parse({
    schemaVersion: 1,
    contractVersion: SCENE_ORIGINALITY_BASELINE_VERSION,
    ...identity,
    baselineFingerprint: baselineFingerprint(identity),
  });
};

export type SceneOriginalityBaseline = z.infer<
  typeof SceneOriginalityBaselineSchema
>;

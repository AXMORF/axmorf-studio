import {z} from "zod";

import {createFingerprint} from "./fingerprint";
import {
  CompositionIdSchema,
  PositiveIntegerSchema,
  Sha256DigestSchema,
  StoryIdSchema,
} from "./primitives";
import {ResourceIdSchema} from "./resource-catalog";

export const GLOBAL_SOUND_PLAN_VERSION = "global-sound-plan-v1" as const;
export const DUCKING_POLICY_ID = "semantic-spoken-min-envelope-v1" as const;
export const MASTERING_POLICY_ID = "deterministic-gain-stage-v1" as const;
export const FINAL_SOUND_PROJECTION_VERSION =
  "final-sound-projection-v1" as const;

const LinearGainSchema = z.number().finite().min(0).max(1);
const PublicAudioPathSchema = z
  .string()
  .min(1)
  .max(512)
  .refine(
    (value) =>
      value.startsWith("public/") &&
      !value.startsWith("/") &&
      !value.includes("..") &&
      !value.includes("\\") &&
      !/^https?:/i.test(value),
    "Global audio must use a normalized public/ path.",
  );

export const GlobalSoundAssetRefSchema = z
  .object({
    resourceId: ResourceIdSchema,
    role: z.enum(["cross-scene-ambience", "global-bgm"]),
    publicPath: PublicAudioPathSchema,
    checksum: Sha256DigestSchema,
    descriptorFingerprint: Sha256DigestSchema,
    licenseFingerprint: Sha256DigestSchema,
    startFrame: z.literal(0),
    endFrame: PositiveIntegerSchema,
  })
  .strict()
  .readonly();

const DuckingPolicySchema = z
  .object({
    policyId: z.literal(DUCKING_POLICY_ID),
    attackFrames: PositiveIntegerSchema,
    releaseFrames: PositiveIntegerSchema,
    spokenGain: LinearGainSchema,
    unspokenGain: LinearGainSchema,
  })
  .strict()
  .superRefine((policy, context) => {
    if (policy.spokenGain >= policy.unspokenGain) {
      context.addIssue({
        code: "custom",
        message: "Spoken duck gain must be lower than unspoken gain.",
        path: ["spokenGain"],
      });
    }
  })
  .readonly();

const MasteringPolicySchema = z
  .object({
    policyId: z.literal(MASTERING_POLICY_ID),
    narrationGain: z.literal(1),
    sceneBusGain: LinearGainSchema,
    ambienceGain: LinearGainSchema,
    bgmGain: LinearGainSchema,
    integratedLoudnessMinLufs: z.number().finite().min(-40).max(0),
    integratedLoudnessMaxLufs: z.number().finite().min(-40).max(0),
    truePeakCeilingDbtp: z.number().finite().min(-20).max(0),
  })
  .strict()
  .superRefine((policy, context) => {
    if (
      policy.integratedLoudnessMinLufs >= policy.integratedLoudnessMaxLufs
    ) {
      context.addIssue({
        code: "custom",
        message: "Integrated loudness range must be increasing.",
        path: ["integratedLoudnessMaxLufs"],
      });
    }
  })
  .readonly();

const GlobalSoundPlanInputObject = z
  .object({
    schemaVersion: z.literal(1),
    planVersion: z.literal(GLOBAL_SOUND_PLAN_VERSION),
    storyId: StoryIdSchema,
    compositionId: CompositionIdSchema,
    fps: PositiveIntegerSchema,
    durationInFrames: PositiveIntegerSchema,
    semanticTimingFingerprint: Sha256DigestSchema,
    catalogFingerprint: Sha256DigestSchema,
    assets: z.array(GlobalSoundAssetRefSchema).length(2).readonly(),
    duckingPolicy: DuckingPolicySchema,
    masteringPolicy: MasteringPolicySchema,
  })
  .strict()
  .superRefine((plan, context) => {
    const expectedRoles = ["cross-scene-ambience", "global-bgm"];
    plan.assets.forEach((asset, index) => {
      if (asset.role !== expectedRoles[index]) {
        context.addIssue({
          code: "custom",
          message: "Global audio assets must use canonical role order.",
          path: ["assets", index, "role"],
        });
      }
      if (asset.endFrame !== plan.durationInFrames) {
        context.addIssue({
          code: "custom",
          message: "Global audio assets must cover the full composition.",
          path: ["assets", index, "endFrame"],
        });
      }
    });
    if (new Set(plan.assets.map((asset) => asset.resourceId)).size !== 2) {
      context.addIssue({
        code: "custom",
        message: "Global audio resources must be distinct.",
        path: ["assets"],
      });
    }
  })
  .readonly();

export const GlobalSoundPlanInputSchema = GlobalSoundPlanInputObject;

export const computeGlobalSoundPlanFingerprint = (rawInput: unknown) => {
  const input = GlobalSoundPlanInputSchema.parse(rawInput);
  return createFingerprint({
    namespace: "global-sound-plan",
    version: 1,
    value: input,
  });
};

export const GlobalSoundPlanSchema = GlobalSoundPlanInputObject.unwrap().safeExtend({
  planFingerprint: Sha256DigestSchema,
})
  .strict()
  .superRefine((plan, context) => {
    const {planFingerprint, ...input} = plan;
    if (planFingerprint !== computeGlobalSoundPlanFingerprint(input)) {
      context.addIssue({
        code: "custom",
        message: "GlobalSoundPlan fingerprint is stale.",
        path: ["planFingerprint"],
      });
    }
  })
  .readonly();

export const createGlobalSoundPlan = (rawInput: unknown) => {
  const raw = z.record(z.string(), z.unknown()).parse(rawInput);
  const assets = [...z.array(z.unknown()).parse(raw.assets)].sort((left, right) => {
    const leftRole = z.object({role: z.string()}).passthrough().parse(left).role;
    const rightRole = z.object({role: z.string()}).passthrough().parse(right).role;
    return leftRole.localeCompare(rightRole);
  });
  const input = GlobalSoundPlanInputSchema.parse({...raw, assets});
  return GlobalSoundPlanSchema.parse({
    ...input,
    planFingerprint: computeGlobalSoundPlanFingerprint(input),
  });
};

export const FinalSoundProjectionInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    projectionVersion: z.literal(FINAL_SOUND_PROJECTION_VERSION),
    storyId: StoryIdSchema,
    compositionId: CompositionIdSchema,
    fps: PositiveIntegerSchema,
    durationInFrames: PositiveIntegerSchema,
    soundDesignProjectionFingerprint: Sha256DigestSchema,
    globalSoundPlanFingerprint: Sha256DigestSchema,
    catalogFingerprint: Sha256DigestSchema,
    assetChecksums: z.array(Sha256DigestSchema).length(2).readonly(),
    duckEnvelopeFingerprint: Sha256DigestSchema,
    masteringPolicyFingerprint: Sha256DigestSchema,
  })
  .strict()
  .readonly();

export const computeFinalSoundProjectionFingerprint = (rawInput: unknown) =>
  createFingerprint({
    namespace: "final-sound-projection",
    version: 1,
    value: FinalSoundProjectionInputSchema.parse(rawInput),
  });

export const FinalSoundProjectionSchema = FinalSoundProjectionInputSchema.unwrap().extend(
  {projectionFingerprint: Sha256DigestSchema},
)
  .strict()
  .superRefine((projection, context) => {
    const {projectionFingerprint, ...input} = projection;
    if (
      projectionFingerprint !== computeFinalSoundProjectionFingerprint(input)
    ) {
      context.addIssue({
        code: "custom",
        message: "FinalSoundProjection fingerprint is stale.",
        path: ["projectionFingerprint"],
      });
    }
  })
  .readonly();

export type GlobalSoundPlan = z.infer<typeof GlobalSoundPlanSchema>;
export type FinalSoundProjection = z.infer<
  typeof FinalSoundProjectionSchema
>;

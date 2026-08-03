import {
  FinalSoundProjectionSchema,
  GlobalSoundPlanSchema,
  computeFinalSoundProjectionFingerprint,
  type GlobalSoundPlan,
} from "../../../contracts/global-sound";
import {createFingerprint} from "../../../contracts/fingerprint";
import {SemanticTimingSchema} from "../../../contracts/semantic-timing";
import {
  createDuckEnvelopeFingerprint,
  createSpokenFrameRanges,
} from "./ducking";

export const resolveGlobalSound = ({
  rawPlan,
  rawTiming,
  soundDesignProjectionFingerprint,
}: {
  readonly rawPlan: unknown;
  readonly rawTiming: unknown;
  readonly soundDesignProjectionFingerprint: string;
}) => {
  const plan = GlobalSoundPlanSchema.parse(rawPlan);
  const timing = SemanticTimingSchema.parse(rawTiming);
  if (
    plan.storyId !== timing.storyId ||
    plan.fps !== timing.fps ||
    plan.durationInFrames !== timing.durationInFrames ||
    plan.semanticTimingFingerprint !== timing.fingerprint
  ) {
    throw new Error("GlobalSoundPlan does not match SemanticTiming.");
  }
  const spokenRanges = createSpokenFrameRanges(
    timing.segments,
    timing.durationInFrames,
  );
  const duckEnvelopeFingerprint = createDuckEnvelopeFingerprint({
    ranges: spokenRanges,
    durationInFrames: plan.durationInFrames,
    attackFrames: plan.duckingPolicy.attackFrames,
    releaseFrames: plan.duckingPolicy.releaseFrames,
    spokenGain: plan.duckingPolicy.spokenGain,
    unspokenGain: plan.duckingPolicy.unspokenGain,
  });
  const masteringPolicyFingerprint = createFingerprint({
    namespace: "deterministic-gain-stage",
    version: 1,
    value: plan.masteringPolicy,
  });
  const input = {
    schemaVersion: 1 as const,
    projectionVersion: "final-sound-projection-v1" as const,
    storyId: plan.storyId,
    compositionId: plan.compositionId,
    fps: plan.fps,
    durationInFrames: plan.durationInFrames,
    soundDesignProjectionFingerprint,
    globalSoundPlanFingerprint: plan.planFingerprint,
    catalogFingerprint: plan.catalogFingerprint,
    assetChecksums: plan.assets.map((asset) => asset.checksum),
    duckEnvelopeFingerprint,
    masteringPolicyFingerprint,
  };
  return {
    plan,
    spokenRanges,
    projection: FinalSoundProjectionSchema.parse({
      ...input,
      projectionFingerprint: computeFinalSoundProjectionFingerprint(input),
    }),
  } as const;
};

export type ResolvedGlobalSound = ReturnType<typeof resolveGlobalSound>;
export type {GlobalSoundPlan};

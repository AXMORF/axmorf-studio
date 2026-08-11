import { z } from "zod";

import { createFingerprint, serializeCanonicalJson } from "./fingerprint";
import { PcmFormatSchema } from "./sealed-narration";
import {
  PublicProjectPathSchema,
  Sha256DigestSchema,
  StoryIdSchema,
} from "./primitives";

export const MASTERED_NARRATION_VERSION = "mastered-narration-v2" as const;
export const NARRATION_MASTERING_ALGORITHM_ID =
  "ffmpeg-loudnorm-two-pass-v1" as const;

export const buildNarrationMasteringPolicy = (
  targetIntegratedLoudnessLufs: number,
) => ({
  policyId: "narration-speech-master-v2" as const,
  algorithmId: NARRATION_MASTERING_ALGORITHM_ID,
  targetIntegratedLoudnessLufs: z
    .number()
    .finite()
    .min(-30)
    .max(-8)
    .parse(targetIntegratedLoudnessLufs),
  targetTruePeakDbtp: -1.5,
  targetLoudnessRangeLu: 11,
  acceptedIntegratedLoudnessMinLufs: targetIntegratedLoudnessLufs - 0.5,
  acceptedIntegratedLoudnessMaxLufs: targetIntegratedLoudnessLufs + 0.5,
  truePeakCeilingDbtp: -1.4,
});

export const NARRATION_MASTERING_POLICY = buildNarrationMasteringPolicy(-16);

const MasteredNarrationAudioSchema = z
  .object({
    localPath: PublicProjectPathSchema,
    checksum: Sha256DigestSchema,
    pcm: PcmFormatSchema,
    sampleFrameCount: z.number().int().positive().safe(),
  })
  .strict()
  .readonly();

const NarrationMasteringPolicySchema = z
  .object({
    policyId: z.literal("narration-speech-master-v2"),
    algorithmId: z.literal(NARRATION_MASTERING_ALGORITHM_ID),
    targetIntegratedLoudnessLufs: z.number().finite().min(-30).max(-8),
    targetTruePeakDbtp: z.literal(-1.5),
    targetLoudnessRangeLu: z.literal(11),
    acceptedIntegratedLoudnessMinLufs: z.number().finite().min(-30.5).max(-8.5),
    acceptedIntegratedLoudnessMaxLufs: z.number().finite().min(-29.5).max(-7.5),
    truePeakCeilingDbtp: z.literal(-1.4),
  })
  .strict()
  .superRefine((policy, context) => {
    const expected = buildNarrationMasteringPolicy(
      policy.targetIntegratedLoudnessLufs,
    );
    if (
      policy.acceptedIntegratedLoudnessMinLufs !==
        expected.acceptedIntegratedLoudnessMinLufs ||
      policy.acceptedIntegratedLoudnessMaxLufs !==
        expected.acceptedIntegratedLoudnessMaxLufs
    ) {
      context.addIssue({
        code: "custom",
        message: "Narration mastering acceptance window is stale.",
        path: ["targetIntegratedLoudnessLufs"],
      });
    }
  })
  .readonly();

export const NarrationLoudnessMeasurementSchema = z
  .object({
    integratedLoudnessLufs: z.number().finite().min(-70).max(0),
    truePeakDbtp: z.number().finite().min(-70).max(10),
    loudnessRangeLu: z.number().finite().min(0).max(70),
    thresholdLufs: z.number().finite().min(-99).max(0),
  })
  .strict()
  .readonly();

const MasteredNarrationFingerprintInputObject = z
  .object({
    schemaVersion: z.literal(1),
    contractVersion: z.literal(MASTERED_NARRATION_VERSION),
    storyId: StoryIdSchema,
    sealedNarrationFingerprint: Sha256DigestSchema,
    sourceAudio: MasteredNarrationAudioSchema,
    masteringPolicy: NarrationMasteringPolicySchema,
    outputAudio: MasteredNarrationAudioSchema,
    measurements: NarrationLoudnessMeasurementSchema,
  })
  .strict();

export const MasteredNarrationFingerprintInputSchema =
  MasteredNarrationFingerprintInputObject.readonly();

export const computeMasteredNarrationFingerprint = (rawInput: unknown) => {
  const input = MasteredNarrationFingerprintInputSchema.parse(rawInput);
  return createFingerprint({
    namespace: "mastered-narration",
    version: 1,
    value: {
      storyId: input.storyId,
      sealedNarrationFingerprint: input.sealedNarrationFingerprint,
      sourceAudio: {
        checksum: input.sourceAudio.checksum,
        pcm: input.sourceAudio.pcm,
        sampleFrameCount: input.sourceAudio.sampleFrameCount,
      },
      masteringPolicy: input.masteringPolicy,
      outputAudio: {
        checksum: input.outputAudio.checksum,
        pcm: input.outputAudio.pcm,
        sampleFrameCount: input.outputAudio.sampleFrameCount,
      },
      measurements: input.measurements,
    },
  });
};

const expectedOutputPath = ({
  storyId,
  sealedNarrationFingerprint,
  masteredNarrationFingerprint,
}: {
  readonly storyId: string;
  readonly sealedNarrationFingerprint: string;
  readonly masteredNarrationFingerprint: string;
}) =>
  `public/projects/${storyId}/narration-mastered/${sealedNarrationFingerprint.slice("sha256:".length)}/${masteredNarrationFingerprint.slice("sha256:".length)}/complete.wav`;

export const MasteredNarrationManifestSchema =
  MasteredNarrationFingerprintInputObject.extend({
    masteredNarrationFingerprint: Sha256DigestSchema,
  })
    .strict()
    .superRefine((manifest, context) => {
      if (
        manifest.sourceAudio.sampleFrameCount !==
        manifest.outputAudio.sampleFrameCount
      ) {
        context.addIssue({
          code: "custom",
          message: "Mastered narration must preserve the sealed sample count.",
          path: ["outputAudio", "sampleFrameCount"],
        });
      }
      if (
        serializeCanonicalJson(manifest.sourceAudio.pcm) !==
        serializeCanonicalJson(manifest.outputAudio.pcm)
      ) {
        context.addIssue({
          code: "custom",
          message: "Mastered narration must preserve the sealed PCM format.",
          path: ["outputAudio", "pcm"],
        });
      }
      if (
        manifest.measurements.integratedLoudnessLufs <
          manifest.masteringPolicy.acceptedIntegratedLoudnessMinLufs ||
        manifest.measurements.integratedLoudnessLufs >
          manifest.masteringPolicy.acceptedIntegratedLoudnessMaxLufs
      ) {
        context.addIssue({
          code: "custom",
          message: "Mastered narration integrated loudness is outside policy.",
          path: ["measurements", "integratedLoudnessLufs"],
        });
      }
      if (
        manifest.measurements.truePeakDbtp >
        manifest.masteringPolicy.truePeakCeilingDbtp
      ) {
        context.addIssue({
          code: "custom",
          message: "Mastered narration true peak exceeds policy.",
          path: ["measurements", "truePeakDbtp"],
        });
      }
      const { masteredNarrationFingerprint, ...input } = manifest;
      if (
        computeMasteredNarrationFingerprint(input) !==
        masteredNarrationFingerprint
      ) {
        context.addIssue({
          code: "custom",
          message: "masteredNarrationFingerprint is stale.",
          path: ["masteredNarrationFingerprint"],
        });
      }
      if (
        manifest.outputAudio.localPath !==
        expectedOutputPath({
          storyId: manifest.storyId,
          sealedNarrationFingerprint: manifest.sealedNarrationFingerprint,
          masteredNarrationFingerprint,
        })
      ) {
        context.addIssue({
          code: "custom",
          message: "Mastered narration output path is not content-addressed.",
          path: ["outputAudio", "localPath"],
        });
      }
    })
    .readonly();

export const buildMasteredNarrationManifest = (rawInput: unknown) => {
  const raw = z.record(z.string(), z.unknown()).parse(rawInput);
  const masteringPolicy =
    raw.masteringPolicy === undefined
      ? NARRATION_MASTERING_POLICY
      : NarrationMasteringPolicySchema.parse(raw.masteringPolicy);
  const provisional = MasteredNarrationFingerprintInputSchema.parse({
    ...raw,
    schemaVersion: 1,
    contractVersion: MASTERED_NARRATION_VERSION,
    masteringPolicy,
  });
  const masteredNarrationFingerprint =
    computeMasteredNarrationFingerprint(provisional);
  return MasteredNarrationManifestSchema.parse({
    ...provisional,
    outputAudio: {
      ...provisional.outputAudio,
      localPath: expectedOutputPath({
        storyId: provisional.storyId,
        sealedNarrationFingerprint: provisional.sealedNarrationFingerprint,
        masteredNarrationFingerprint,
      }),
    },
    masteredNarrationFingerprint,
  });
};

export type NarrationLoudnessMeasurement = z.infer<
  typeof NarrationLoudnessMeasurementSchema
>;
export type MasteredNarrationManifest = z.infer<
  typeof MasteredNarrationManifestSchema
>;

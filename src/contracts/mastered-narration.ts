import { z } from "zod";

import { createFingerprint, serializeCanonicalJson } from "./fingerprint";
import { PcmFormatSchema } from "./sealed-narration";
import {
  PublicProjectPathSchema,
  Sha256DigestSchema,
  StoryIdSchema,
} from "./primitives";

export const MASTERED_NARRATION_VERSION = "mastered-narration-v1" as const;
export const NARRATION_MASTERING_ALGORITHM_ID =
  "ffmpeg-loudnorm-two-pass-v1" as const;

export const NARRATION_MASTERING_POLICY = {
  policyId: "narration-speech-master-v1",
  algorithmId: NARRATION_MASTERING_ALGORITHM_ID,
  targetIntegratedLoudnessLufs: -16,
  targetTruePeakDbtp: -1.5,
  targetLoudnessRangeLu: 11,
  acceptedIntegratedLoudnessMinLufs: -16.5,
  acceptedIntegratedLoudnessMaxLufs: -15.5,
  truePeakCeilingDbtp: -1.4,
} as const;

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
    policyId: z.literal(NARRATION_MASTERING_POLICY.policyId),
    algorithmId: z.literal(NARRATION_MASTERING_ALGORITHM_ID),
    targetIntegratedLoudnessLufs: z.literal(
      NARRATION_MASTERING_POLICY.targetIntegratedLoudnessLufs,
    ),
    targetTruePeakDbtp: z.literal(
      NARRATION_MASTERING_POLICY.targetTruePeakDbtp,
    ),
    targetLoudnessRangeLu: z.literal(
      NARRATION_MASTERING_POLICY.targetLoudnessRangeLu,
    ),
    acceptedIntegratedLoudnessMinLufs: z.literal(
      NARRATION_MASTERING_POLICY.acceptedIntegratedLoudnessMinLufs,
    ),
    acceptedIntegratedLoudnessMaxLufs: z.literal(
      NARRATION_MASTERING_POLICY.acceptedIntegratedLoudnessMaxLufs,
    ),
    truePeakCeilingDbtp: z.literal(
      NARRATION_MASTERING_POLICY.truePeakCeilingDbtp,
    ),
  })
  .strict()
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
  `public/projects/${storyId}/narration/${sealedNarrationFingerprint.slice("sha256:".length)}/mastered/${masteredNarrationFingerprint.slice("sha256:".length)}/complete.wav`;

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
  const provisional = MasteredNarrationFingerprintInputSchema.parse({
    ...raw,
    schemaVersion: 1,
    contractVersion: MASTERED_NARRATION_VERSION,
    masteringPolicy: NARRATION_MASTERING_POLICY,
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

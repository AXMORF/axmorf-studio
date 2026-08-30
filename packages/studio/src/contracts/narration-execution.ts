import { z } from "zod";

import { createFingerprint } from "./fingerprint";
import {
  NarrationMasteringPolicySchema,
  buildNarrationMasteringPolicy,
} from "./mastered-narration";
import { ProducerConfigIdSchema } from "./producer-config";
import { Sha256DigestSchema, VoiceProfileIdSchema } from "./primitives";
import { SPEECH_SDK_VENDORS } from "./tts-provider-registry";

export const NARRATION_EXECUTION_VERSION =
  "narration-execution-snapshot-v3" as const;

const SpeechSdkVendorSchema = z.enum(SPEECH_SDK_VENDORS);

const NarrationExecutionSnapshotInputObject = z
  .object({
    schemaVersion: z.literal(3),
    contractVersion: z.literal(NARRATION_EXECUTION_VERSION),
    providerId: ProducerConfigIdSchema,
    providerKind: z.enum(["voxcpm", "speech-sdk", "edge-tts"]),
    providerVendor: z
      .union([
        SpeechSdkVendorSchema,
        z.literal("microsoft-edge-read-aloud"),
      ])
      .nullable(),
    voiceProfileId: VoiceProfileIdSchema,
    speechRate: z.number().finite().min(0.5).max(2),
    providerAttemptFingerprint: Sha256DigestSchema,
    masteringPolicy: NarrationMasteringPolicySchema,
  })
  .strict()
  .superRefine((snapshot, context) => {
    if (
      (snapshot.providerKind === "voxcpm" &&
        snapshot.providerVendor !== null) ||
      (snapshot.providerKind === "speech-sdk" &&
        (snapshot.providerVendor === null ||
          snapshot.providerVendor === "microsoft-edge-read-aloud")) ||
      (snapshot.providerKind === "edge-tts" &&
        snapshot.providerVendor !== "microsoft-edge-read-aloud")
    ) {
      context.addIssue({
        code: "custom",
        message: "Narration provider kind and vendor are inconsistent.",
        path: ["providerVendor"],
      });
    }
  });

const computeNarrationExecutionFingerprint = (rawInput: unknown) =>
  createFingerprint({
    namespace: "narration-execution-snapshot",
    version: 3,
    value: NarrationExecutionSnapshotInputObject.parse(rawInput),
  });

export const NarrationExecutionSnapshotSchema =
  NarrationExecutionSnapshotInputObject.safeExtend({
    executionFingerprint: Sha256DigestSchema,
  })
    .strict()
    .superRefine((snapshot, context) => {
      const { executionFingerprint, ...input } = snapshot;
      if (
        executionFingerprint !== computeNarrationExecutionFingerprint(input)
      ) {
        context.addIssue({
          code: "custom",
          message: "Narration execution fingerprint is stale.",
          path: ["executionFingerprint"],
        });
      }
    })
    .readonly();

export const buildNarrationExecutionSnapshot = ({
  providerId,
  providerKind = "voxcpm",
  providerVendor = null,
  voiceProfileId,
  speechRate,
  providerAttemptFingerprint,
  targetLoudnessLufs,
}: {
  readonly providerId: unknown;
  readonly providerKind?: "voxcpm" | "speech-sdk" | "edge-tts";
  readonly providerVendor?:
    | (typeof SPEECH_SDK_VENDORS)[number]
    | "microsoft-edge-read-aloud"
    | null;
  readonly voiceProfileId: unknown;
  readonly speechRate: unknown;
  readonly providerAttemptFingerprint: unknown;
  readonly targetLoudnessLufs: number;
}) => {
  const input = NarrationExecutionSnapshotInputObject.parse({
    schemaVersion: 3,
    contractVersion: NARRATION_EXECUTION_VERSION,
    providerId,
    providerKind,
    providerVendor,
    voiceProfileId,
    speechRate,
    providerAttemptFingerprint,
    masteringPolicy: buildNarrationMasteringPolicy(targetLoudnessLufs),
  });
  return NarrationExecutionSnapshotSchema.parse({
    ...input,
    executionFingerprint: computeNarrationExecutionFingerprint(input),
  });
};

export type NarrationExecutionSnapshot = z.infer<
  typeof NarrationExecutionSnapshotSchema
>;

import { z } from "zod";

import { createFingerprint } from "./fingerprint";
import {
  NarrationMasteringPolicySchema,
  buildNarrationMasteringPolicy,
} from "./mastered-narration";
import { ProducerConfigIdSchema } from "./producer-config";
import { Sha256DigestSchema, VoiceProfileIdSchema } from "./primitives";

export const NARRATION_EXECUTION_VERSION =
  "narration-execution-snapshot-v2" as const;

const NarrationExecutionSnapshotInputObject = z
  .object({
    schemaVersion: z.literal(2),
    contractVersion: z.literal(NARRATION_EXECUTION_VERSION),
    providerId: ProducerConfigIdSchema,
    providerKind: z.enum(["voxcpm", "speech-sdk"]),
    providerVendor: z.literal("openai").nullable(),
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
        snapshot.providerVendor !== "openai")
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
    version: 2,
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
  readonly providerKind?: "voxcpm" | "speech-sdk";
  readonly providerVendor?: "openai" | null;
  readonly voiceProfileId: unknown;
  readonly speechRate: unknown;
  readonly providerAttemptFingerprint: unknown;
  readonly targetLoudnessLufs: number;
}) => {
  const input = NarrationExecutionSnapshotInputObject.parse({
    schemaVersion: 2,
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

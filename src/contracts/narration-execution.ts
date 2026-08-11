import { z } from "zod";

import { createFingerprint } from "./fingerprint";
import {
  NarrationMasteringPolicySchema,
  buildNarrationMasteringPolicy,
} from "./mastered-narration";
import { ProducerConfigIdSchema } from "./producer-config";
import { Sha256DigestSchema, VoiceProfileIdSchema } from "./primitives";

export const NARRATION_EXECUTION_VERSION =
  "narration-execution-snapshot-v1" as const;

const NarrationExecutionSnapshotInputObject = z
  .object({
    schemaVersion: z.literal(1),
    contractVersion: z.literal(NARRATION_EXECUTION_VERSION),
    providerId: ProducerConfigIdSchema,
    voiceProfileId: VoiceProfileIdSchema,
    speechRate: z.number().finite().min(0.5).max(2),
    providerAttemptFingerprint: Sha256DigestSchema,
    masteringPolicy: NarrationMasteringPolicySchema,
  })
  .strict();

const computeNarrationExecutionFingerprint = (rawInput: unknown) =>
  createFingerprint({
    namespace: "narration-execution-snapshot",
    version: 1,
    value: NarrationExecutionSnapshotInputObject.parse(rawInput),
  });

export const NarrationExecutionSnapshotSchema =
  NarrationExecutionSnapshotInputObject.extend({
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
  voiceProfileId,
  speechRate,
  providerAttemptFingerprint,
  targetLoudnessLufs,
}: {
  readonly providerId: unknown;
  readonly voiceProfileId: unknown;
  readonly speechRate: unknown;
  readonly providerAttemptFingerprint: unknown;
  readonly targetLoudnessLufs: number;
}) => {
  const input = NarrationExecutionSnapshotInputObject.parse({
    schemaVersion: 1,
    contractVersion: NARRATION_EXECUTION_VERSION,
    providerId,
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

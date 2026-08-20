import { z } from "zod";

import { NarrationMasteringPolicySchema } from "./mastered-narration";
import { Sha256DigestSchema, StoryIdSchema } from "./primitives";

export const NARRATION_PREPARATION_VERSION =
  "narration-preparation-v1" as const;

/**
 * Safe, source-local authority linking the active sealed bytes to the exact
 * provider attempt selected by the explicit prepare operation. It contains no
 * provider configuration, private path, prompt text, or voice material.
 */
export const NarrationPreparationReceiptSchema = z
  .object({
    schemaVersion: z.literal(1),
    contractVersion: z.literal(NARRATION_PREPARATION_VERSION),
    storyId: StoryIdSchema,
    generationInputFingerprint: Sha256DigestSchema,
    providerAttemptFingerprint: Sha256DigestSchema,
    sealedNarrationFingerprint: Sha256DigestSchema,
    masteringPolicy: NarrationMasteringPolicySchema,
  })
  .strict()
  .readonly();

export type NarrationPreparationReceipt = z.infer<
  typeof NarrationPreparationReceiptSchema
>;

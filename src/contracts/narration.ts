import { z } from "zod";

import { NonNegativeIntegerSchema, VoiceProfileIdSchema } from "./primitives";

export const NarrationSpecSchema = z
  .object({
    schemaVersion: z.literal(1),
    voiceProfileId: VoiceProfileIdSchema,
    mode: z.literal("voice-clone"),
    seed: NonNegativeIntegerSchema.max(2_147_483_647).optional(),
  })
  .strict()
  .readonly();

export type NarrationSpec = z.infer<typeof NarrationSpecSchema>;

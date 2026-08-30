import { z } from "zod";

import { VoiceProfileIdSchema } from "./primitives";

export const NarrationSpecSchema = z
  .object({
    schemaVersion: z.literal(2),
    voiceProfileId: VoiceProfileIdSchema,
    mode: z.literal("voice-clone"),
  })
  .strict()
  .readonly();

export type NarrationSpec = z.infer<typeof NarrationSpecSchema>;

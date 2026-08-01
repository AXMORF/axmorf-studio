import { z } from "zod";

import { createFingerprint } from "./fingerprint";
import { NarrationSpecSchema, type NarrationSpec } from "./narration";
import { MeaningIdSchema, TtsChunkIdSchema } from "./primitives";
import { flattenTtsChunks, type StorySpec } from "./story";

export const GenerationChunkSchema = z
  .object({
    chunkId: TtsChunkIdSchema,
    meaningId: MeaningIdSchema,
    ttsText: z.string().trim().min(1),
  })
  .strict()
  .readonly();

export const GenerationInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    chunks: z.array(GenerationChunkSchema).min(1).readonly(),
    narration: NarrationSpecSchema,
  })
  .strict()
  .readonly();

export type GenerationInput = z.infer<typeof GenerationInputSchema>;

export const buildGenerationInput = (
  story: StorySpec,
  narration: NarrationSpec,
): GenerationInput =>
  GenerationInputSchema.parse({
    schemaVersion: 1,
    chunks: flattenTtsChunks(story),
    narration,
  });

export const computeStoryFingerprint = (story: StorySpec) =>
  createFingerprint({ namespace: "story-spec", version: 1, value: story });

export const computeGenerationInputFingerprint = (
  story: StorySpec,
  narration: NarrationSpec,
) =>
  createFingerprint({
    namespace: "narration-generation-input",
    version: 1,
    value: buildGenerationInput(story, narration),
  });

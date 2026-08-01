import { z } from "zod";

import {
  MeaningIdSchema,
  NonNegativeIntegerSchema,
  StoryIdSchema,
  TtsChunkIdSchema,
} from "./primitives";

const NonEmptyTextSchema = z.string().trim().min(1);

export const TTSChunkSchema = z
  .object({
    chunkId: TtsChunkIdSchema,
    ttsText: NonEmptyTextSchema,
  })
  .strict()
  .readonly();

export const ExplicitPauseSchema = z
  .object({
    afterChunkId: TtsChunkIdSchema,
    pauseMs: NonNegativeIntegerSchema,
  })
  .strict()
  .readonly();

export const StoryBeatSchema = z
  .object({
    meaningId: MeaningIdSchema,
    narrativePurpose: NonEmptyTextSchema,
    ttsChunks: z.array(TTSChunkSchema).min(1).readonly(),
    explicitPauses: z.array(ExplicitPauseSchema).readonly(),
  })
  .strict()
  .superRefine((beat, context) => {
    const chunkOrder = new Map(
      beat.ttsChunks.map((chunk, index) => [chunk.chunkId, index]),
    );
    const ownedChunks = new Set(chunkOrder.keys());
    const pausedChunks = new Set<string>();
    let previousPauseChunkIndex = -1;

    beat.explicitPauses.forEach((pause, index) => {
      if (!ownedChunks.has(pause.afterChunkId)) {
        context.addIssue({
          code: "custom",
          message:
            "Explicit pause must follow a chunk owned by the same StoryBeat.",
          path: ["explicitPauses", index, "afterChunkId"],
        });
      }
      if (pausedChunks.has(pause.afterChunkId)) {
        context.addIssue({
          code: "custom",
          message: "A TTSChunk can have at most one explicit pause after it.",
          path: ["explicitPauses", index, "afterChunkId"],
        });
      }
      pausedChunks.add(pause.afterChunkId);
      const currentChunkIndex = chunkOrder.get(pause.afterChunkId);
      if (
        currentChunkIndex !== undefined &&
        currentChunkIndex <= previousPauseChunkIndex
      ) {
        context.addIssue({
          code: "custom",
          message: "Explicit pauses must follow TTSChunk order.",
          path: ["explicitPauses", index, "afterChunkId"],
        });
      }
      if (currentChunkIndex !== undefined)
        previousPauseChunkIndex = currentChunkIndex;
    });
  })
  .readonly();

export const StorySpecSchema = z
  .object({
    schemaVersion: z.literal(1),
    storyId: StoryIdSchema,
    title: NonEmptyTextSchema,
    beats: z.array(StoryBeatSchema).min(1).readonly(),
  })
  .strict()
  .superRefine((story, context) => {
    const meaningIds = new Set<string>();
    const chunkIds = new Set<string>();

    story.beats.forEach((beat, beatIndex) => {
      if (meaningIds.has(beat.meaningId)) {
        context.addIssue({
          code: "custom",
          message: "meaningId must be globally unique within StorySpec.",
          path: ["beats", beatIndex, "meaningId"],
        });
      }
      meaningIds.add(beat.meaningId);

      beat.ttsChunks.forEach((chunk, chunkIndex) => {
        if (chunkIds.has(chunk.chunkId)) {
          context.addIssue({
            code: "custom",
            message: "chunkId must be globally unique within StorySpec.",
            path: ["beats", beatIndex, "ttsChunks", chunkIndex, "chunkId"],
          });
        }
        chunkIds.add(chunk.chunkId);
      });
    });
  })
  .readonly();

export type TTSChunk = z.infer<typeof TTSChunkSchema>;
export type ExplicitPause = z.infer<typeof ExplicitPauseSchema>;
export type StoryBeat = z.infer<typeof StoryBeatSchema>;
export type StorySpec = z.infer<typeof StorySpecSchema>;

export const flattenTtsChunks = (story: StorySpec) =>
  story.beats.flatMap((beat) =>
    beat.ttsChunks.map((chunk) => ({
      chunkId: chunk.chunkId,
      meaningId: beat.meaningId,
      ttsText: chunk.ttsText,
    })),
  );

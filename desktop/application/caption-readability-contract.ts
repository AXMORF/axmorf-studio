import { validateCaptionDisplayBudget } from "../../src/contracts/scene-readability";
import { StorySpecSchema } from "../../src/contracts/story";
import type { RspFieldIssue } from "../contracts/issues";

export const rspCaptionReadabilityIssues = ({
  story: rawStory,
  pathPrefix,
}: {
  readonly story: unknown;
  readonly pathPrefix: string;
}): readonly RspFieldIssue[] => {
  const story = StorySpecSchema.parse(rawStory);
  return story.beats.flatMap((beat, beatIndex) =>
    beat.kind === "narrated-scene"
      ? beat.ttsChunks.flatMap((chunk, chunkIndex) => {
          try {
            validateCaptionDisplayBudget(chunk);
            return [];
          } catch (error) {
            return [
              {
                path: `${pathPrefix}.beats[${beatIndex}].ttsChunks[${chunkIndex}].ttsText`,
                code: "rsp-caption-display-budget-exceeded",
                message:
                  error instanceof Error
                    ? error.message
                    : "TTS chunk exceeds the caption display budget.",
                ownerAction:
                  "Split this text into adjacent ttsChunks while preserving narration order, then validate the same raw input again.",
              },
            ];
          }
        })
      : [],
  );
};

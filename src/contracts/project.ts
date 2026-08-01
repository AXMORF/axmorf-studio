import { z } from "zod";

import { VideoBriefSchema } from "./brief";
import { NarrationSpecSchema } from "./narration";
import { StoryIdSchema } from "./primitives";
import { RenderSpecSchema } from "./render";
import { StorySpecSchema } from "./story";

export const NARRATIVE_PROJECT_FILES = {
  brief: "brief.json",
  story: "story.json",
  narration: "narration.json",
  render: "render.json",
  storyCheck: "reviews/story-check.json",
  sealedNarration: "generated/sealed-narration.generated.json",
  semanticTiming: "generated/semantic-timing.generated.json",
} as const;

export const StoryCompositionPropsSchema = z
  .object({ projectId: StoryIdSchema })
  .strict()
  .readonly();

export const NarrativeProjectSourceSchema = z
  .object({
    brief: VideoBriefSchema,
    story: StorySpecSchema,
    narration: NarrationSpecSchema,
    render: RenderSpecSchema,
  })
  .strict()
  .superRefine((project, context) => {
    if (project.brief.storyId !== project.story.storyId) {
      context.addIssue({
        code: "custom",
        message: "VideoBrief.storyId must match StorySpec.storyId.",
        path: ["brief", "storyId"],
      });
    }
  })
  .readonly();

export type StoryCompositionProps = z.infer<typeof StoryCompositionPropsSchema>;
export type NarrativeProjectSource = z.infer<
  typeof NarrativeProjectSourceSchema
>;

export const parseNarrativeProjectSource = (
  input: unknown,
): NarrativeProjectSource => NarrativeProjectSourceSchema.parse(input);

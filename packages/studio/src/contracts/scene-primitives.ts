import { z } from "zod";

import { NonNegativeIntegerSchema, StoryIdSchema } from "./primitives";

const sceneStableIdSchema = StoryIdSchema;

export const ShotIdSchema = sceneStableIdSchema.brand<"ShotId">();
export const SceneEventIdSchema = sceneStableIdSchema.brand<"SceneEventId">();
export const StyleProfileIdSchema =
  sceneStableIdSchema.brand<"StyleProfileId">();

export const SceneLocalFrameSchema =
  NonNegativeIntegerSchema.brand<"SceneLocalFrame">();

export const SceneLocalFrameRangeSchema = z
  .object({
    startFrame: SceneLocalFrameSchema,
    endFrame: SceneLocalFrameSchema,
  })
  .strict()
  .superRefine((range, context) => {
    if (range.endFrame <= range.startFrame) {
      context.addIssue({
        code: "custom",
        message: "Scene-local frame ranges must be non-empty and increasing.",
        path: ["endFrame"],
      });
    }
  })
  .readonly();

export type ShotId = z.infer<typeof ShotIdSchema>;
export type SceneEventId = z.infer<typeof SceneEventIdSchema>;
export type StyleProfileId = z.infer<typeof StyleProfileIdSchema>;
export type SceneLocalFrame = z.infer<typeof SceneLocalFrameSchema>;
export type SceneLocalFrameRange = z.infer<typeof SceneLocalFrameRangeSchema>;

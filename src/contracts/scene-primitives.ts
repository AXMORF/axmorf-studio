import { z } from "zod";

import {
  NonNegativeIntegerSchema,
  PositiveIntegerSchema,
  StoryIdSchema,
} from "./primitives";

const sceneStableIdSchema = StoryIdSchema;

export const SceneRendererIdSchema = sceneStableIdSchema.brand<"SceneRendererId">();
export const ShotIdSchema = sceneStableIdSchema.brand<"ShotId">();
export const SceneEventIdSchema = sceneStableIdSchema.brand<"SceneEventId">();
export const StyleProfileIdSchema = sceneStableIdSchema.brand<"StyleProfileId">();

export const SceneLocalFrameSchema = NonNegativeIntegerSchema.brand<"SceneLocalFrame">();

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

export type SceneRendererId = z.infer<typeof SceneRendererIdSchema>;
export type ShotId = z.infer<typeof ShotIdSchema>;
export type SceneEventId = z.infer<typeof SceneEventIdSchema>;
export type StyleProfileId = z.infer<typeof StyleProfileIdSchema>;
export type SceneLocalFrame = z.infer<typeof SceneLocalFrameSchema>;
export type SceneLocalFrameRange = z.infer<typeof SceneLocalFrameRangeSchema>;

export const assertSceneLocalRangeWithinDuration = (
  rawRange: unknown,
  rawDurationInFrames: unknown,
): SceneLocalFrameRange => {
  const range = SceneLocalFrameRangeSchema.parse(rawRange);
  const durationInFrames = PositiveIntegerSchema.parse(rawDurationInFrames);
  if (range.endFrame > durationInFrames) {
    throw new Error("Scene-local frame range exceeds the fixed Beat duration.");
  }
  return range;
};

const toLocalFrame = (
  rawFrame: unknown,
  rawRange: unknown,
  label: "Scene" | "Shot",
): SceneLocalFrame => {
  const frame = NonNegativeIntegerSchema.parse(rawFrame);
  const range = SceneLocalFrameRangeSchema.parse(rawRange);
  if (frame < range.startFrame || frame >= range.endFrame) {
    throw new Error(`${label} frame is outside its fixed half-open range.`);
  }
  return SceneLocalFrameSchema.parse(frame - range.startFrame);
};

export const toSceneLocalFrame = (
  compositionFrame: unknown,
  beatFrameRange: unknown,
): SceneLocalFrame => toLocalFrame(compositionFrame, beatFrameRange, "Scene");

export const toShotLocalFrame = (
  sceneFrame: unknown,
  shotFrameRange: unknown,
): SceneLocalFrame => toLocalFrame(sceneFrame, shotFrameRange, "Shot");

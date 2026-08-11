import { z } from "zod";

import {
  CompositionIdSchema,
  NonNegativeIntegerSchema,
  PositiveIntegerSchema,
} from "./primitives";

const CanonicalLocaleSchema = z.string().refine((value) => {
  try {
    return Intl.getCanonicalLocales(value)[0] === value;
  } catch {
    return false;
  }
}, "locale must be a canonical BCP 47 language tag");

export const CaptionSafeAreaSchema = z
  .object({
    top: NonNegativeIntegerSchema,
    right: NonNegativeIntegerSchema,
    bottom: NonNegativeIntegerSchema,
    left: NonNegativeIntegerSchema,
  })
  .strict()
  .readonly();

export const RenderOutputSchema = z
  .object({
    container: z.literal("mp4"),
    videoCodec: z.literal("h264"),
    audioCodec: z.literal("aac"),
    audioChannels: z.union([z.literal(1), z.literal(2)]),
  })
  .strict()
  .readonly();

export const RenderSpecSchema = z
  .object({
    schemaVersion: z.literal(1),
    compositionId: CompositionIdSchema,
    fps: PositiveIntegerSchema.max(120),
    width: PositiveIntegerSchema,
    height: PositiveIntegerSchema,
    locale: CanonicalLocaleSchema,
    leadInFrames: NonNegativeIntegerSchema,
    tailFrames: NonNegativeIntegerSchema,
    output: RenderOutputSchema,
  })
  .strict()
  .superRefine((render, context) => {
    if (render.width % 2 !== 0 || render.height % 2 !== 0) {
      context.addIssue({
        code: "custom",
        message: "H.264 v1 width and height must be even integers.",
        path: [render.width % 2 !== 0 ? "width" : "height"],
      });
    }
  })
  .readonly();

export type RenderSpec = z.infer<typeof RenderSpecSchema>;
export type CaptionSafeArea = z.infer<typeof CaptionSafeAreaSchema>;

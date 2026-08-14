import { z } from "zod";

import { createFingerprint } from "./fingerprint";
import { PositiveIntegerSchema, StoryIdSchema } from "./primitives";

const NonEmptyTextSchema = z.string().trim().min(1);

const isPublicHttpUrl = (value: string) => {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
};

export const VideoSourceReferenceSchema = z
  .object({
    title: NonEmptyTextSchema.max(160),
    url: z
      .string()
      .trim()
      .max(240)
      .url()
      .refine(isPublicHttpUrl, "Source reference URL must use HTTP or HTTPS."),
  })
  .strict()
  .readonly();

export const VideoSourceReferencesSchema = z
  .array(VideoSourceReferenceSchema)
  .max(8)
  .readonly();

export const computeVideoSourceReferencesFingerprint = (rawInput: unknown) =>
  createFingerprint({
    namespace: "video-source-references",
    version: 1,
    value: VideoSourceReferencesSchema.parse(rawInput),
  });

export const VideoBriefSchema = z
  .object({
    schemaVersion: z.literal(1),
    storyId: StoryIdSchema,
    title: NonEmptyTextSchema,
    sourceMaterial: NonEmptyTextSchema,
    sourceReferences: VideoSourceReferencesSchema.default([]),
    audience: NonEmptyTextSchema,
    targetDurationSeconds: PositiveIntegerSchema.max(3600),
    deliveryConstraints: z.array(NonEmptyTextSchema).max(32).readonly(),
  })
  .strict()
  .readonly();

export type VideoBrief = z.infer<typeof VideoBriefSchema>;
export type VideoSourceReference = z.infer<typeof VideoSourceReferenceSchema>;

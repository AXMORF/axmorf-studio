import { z } from "zod";

import { PositiveIntegerSchema, StoryIdSchema } from "./primitives";

const NonEmptyTextSchema = z.string().trim().min(1);

export const VideoBriefSchema = z
  .object({
    schemaVersion: z.literal(1),
    storyId: StoryIdSchema,
    title: NonEmptyTextSchema,
    sourceMaterial: NonEmptyTextSchema,
    audience: NonEmptyTextSchema,
    targetDurationSeconds: PositiveIntegerSchema.max(3600),
    deliveryConstraints: z.array(NonEmptyTextSchema).max(32).readonly(),
  })
  .strict()
  .readonly();

export type VideoBrief = z.infer<typeof VideoBriefSchema>;

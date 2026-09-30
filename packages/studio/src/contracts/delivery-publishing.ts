import { z } from "zod";

import { DELIVERY_FILES } from "./delivery-layout";
import { PublishingTopicSchema } from "./publishing-intent";
import { MeaningIdSchema, PositiveIntegerSchema, StoryIdSchema } from "./primitives";

export const DELIVERY_PUBLISHING_VERSION = "delivery-publishing-v3" as const;
const ChapterSchema = z.object({
  meaningId: MeaningIdSchema, name: z.string().trim().min(1).max(64),
  startFrame: z.number().int().nonnegative().safe(), timecode: z.string().regex(/^\d{2,}:[0-5]\d:[0-5]\d$/u),
}).strict().readonly();

export const formatDeliveryTimecode = (startFrame: number, fps: number) => {
  const totalSeconds = Math.floor(startFrame / fps);
  return `${Math.floor(totalSeconds / 3600).toString().padStart(2, "0")}:${Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, "0")}:${(totalSeconds % 60).toString().padStart(2, "0")}`;
};

export const DeliveryPublishingSchema = z.object({
  schemaVersion: z.literal(3), contractVersion: z.literal(DELIVERY_PUBLISHING_VERSION), storyId: StoryIdSchema,
  title: z.string().trim().min(1), description: z.string().trim().min(1).max(2000), topics: z.array(PublishingTopicSchema).min(6).max(7).readonly(),
  collection: z.string().trim().min(1).max(96), outputFileName: z.literal(DELIVERY_FILES.video),
  coverFileNames: z.object({ cover4x3: z.literal(DELIVERY_FILES.cover4x3), cover3x4: z.literal(DELIVERY_FILES.cover3x4) }).strict().readonly(),
  fps: PositiveIntegerSchema.max(120), frameCount: PositiveIntegerSchema, plannedDurationSeconds: z.number().positive().finite(), chapters: z.array(ChapterSchema).min(1).max(256).readonly(),
}).strict().superRefine((publishing, context) => {
  if (publishing.plannedDurationSeconds !== publishing.frameCount / publishing.fps) context.addIssue({ code: "custom", message: "Publishing duration is stale.", path: ["plannedDurationSeconds"] });
  publishing.chapters.forEach((chapter, index) => { if (chapter.timecode !== formatDeliveryTimecode(chapter.startFrame, publishing.fps)) context.addIssue({ code: "custom", message: "Publishing chapter timecode is stale.", path: ["chapters", index, "timecode"] }); });
}).readonly();
export const buildDeliveryPublishing = (raw: unknown) => DeliveryPublishingSchema.parse({ ...(raw as Record<string, unknown>), schemaVersion: 3, contractVersion: DELIVERY_PUBLISHING_VERSION });

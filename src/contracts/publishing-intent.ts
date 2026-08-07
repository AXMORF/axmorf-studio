import { z } from "zod";

import { createFingerprint } from "./fingerprint";
import { computeStoryFingerprint } from "./generation-input";
import {
  MeaningIdSchema,
  Sha256DigestSchema,
  StoryIdSchema,
} from "./primitives";
import { StorySpecSchema } from "./story";

export const PUBLISHING_INTENT_VERSION = "publishing-intent-v1" as const;

const PublishingTextSchema = z.string().trim().min(1);

export const PublishingChapterNameSchema = PublishingTextSchema.max(64)
  .refine(
    (value) => Array.from(value).length <= 11,
    "Publishing chapter names must contain at most 11 Unicode characters.",
  )
  .refine(
    (value) => /\p{Script=Han}/u.test(value),
    "Publishing chapter names must contain Chinese text.",
  );

const PublishingIntentChapterSchema = z
  .object({
    meaningId: MeaningIdSchema,
    name: PublishingChapterNameSchema,
  })
  .strict()
  .readonly();

export const AuthoredPublishingIntentSchema = z
  .object({
    description: PublishingTextSchema.max(2_000),
    topics: z.array(PublishingTextSchema.max(48)).min(6).max(7).readonly(),
    collection: PublishingTextSchema.max(96),
    chapters: z.array(PublishingIntentChapterSchema).min(1).max(256).readonly(),
  })
  .strict()
  .superRefine((intent, context) => {
    if (new Set(intent.topics).size !== intent.topics.length) {
      context.addIssue({
        code: "custom",
        message: "Publishing topics must be unique.",
        path: ["topics"],
      });
    }
    const meaningIds = intent.chapters.map(({ meaningId }) => meaningId);
    if (new Set(meaningIds).size !== meaningIds.length) {
      context.addIssue({
        code: "custom",
        message: "Publishing chapters must use unique meaning IDs.",
        path: ["chapters"],
      });
    }
  })
  .readonly();

const PublishingIntentInputObject = AuthoredPublishingIntentSchema.unwrap()
  .extend({
    schemaVersion: z.literal(1),
    contractVersion: z.literal(PUBLISHING_INTENT_VERSION),
    storyId: StoryIdSchema,
    storyFingerprint: Sha256DigestSchema,
  })
  .strict();

export const PublishingIntentInputSchema =
  PublishingIntentInputObject.readonly();

export const computePublishingIntentFingerprint = (rawInput: unknown) => {
  const record = { ...(rawInput as Record<string, unknown>) };
  delete record.intentFingerprint;
  return createFingerprint({
    namespace: "publishing-intent",
    version: 1,
    value: PublishingIntentInputSchema.parse(record),
  });
};

export const PublishingIntentSchema = PublishingIntentInputObject.extend({
  intentFingerprint: Sha256DigestSchema,
})
  .strict()
  .superRefine((intent, context) => {
    const { intentFingerprint, ...input } = intent;
    if (intentFingerprint !== computePublishingIntentFingerprint(input)) {
      context.addIssue({
        code: "custom",
        message: "PublishingIntent fingerprint is stale.",
        path: ["intentFingerprint"],
      });
    }
  })
  .readonly();

export const buildPublishingIntent = ({
  story: rawStory,
  authored: rawAuthored,
}: {
  readonly story: unknown;
  readonly authored: unknown;
}) => {
  const story = StorySpecSchema.parse(rawStory);
  const authored = AuthoredPublishingIntentSchema.parse(rawAuthored);
  const input = PublishingIntentInputSchema.parse({
    ...authored,
    schemaVersion: 1,
    contractVersion: PUBLISHING_INTENT_VERSION,
    storyId: story.storyId,
    storyFingerprint: computeStoryFingerprint(story),
  });
  const intent = PublishingIntentSchema.parse({
    ...input,
    intentFingerprint: computePublishingIntentFingerprint(input),
  });
  return resolveCurrentPublishingIntent({ story, intent });
};

export const resolveCurrentPublishingIntent = ({
  story: rawStory,
  intent: rawIntent,
}: {
  readonly story: unknown;
  readonly intent: unknown;
}) => {
  const story = StorySpecSchema.parse(rawStory);
  const intent = PublishingIntentSchema.parse(rawIntent);
  if (
    intent.storyId !== story.storyId ||
    intent.storyFingerprint !== computeStoryFingerprint(story)
  ) {
    throw new Error("PublishingIntent is stale against the current StorySpec.");
  }
  if (
    intent.chapters.length !== story.beats.length ||
    intent.chapters.some(
      ({ meaningId }, index) => meaningId !== story.beats[index]?.meaningId,
    )
  ) {
    throw new Error(
      "PublishingIntent chapters must cover current StoryBeats in Story order.",
    );
  }
  return intent;
};

export type PublishingIntent = z.infer<typeof PublishingIntentSchema>;

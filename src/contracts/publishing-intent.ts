import { z } from "zod";

import { createFingerprint } from "./fingerprint";
import { computeStoryFingerprint } from "./generation-input";
import {
  MeaningIdSchema,
  Sha256DigestSchema,
  StoryIdSchema,
} from "./primitives";
import { StorySpecSchema } from "./story";
import {
  PublishingCollectionSchema,
  ProducerConfigIdSchema,
  computePublishingCollectionCatalogFingerprint,
} from "./producer-config";

export const PUBLISHING_INTENT_VERSION = "publishing-intent-v2" as const;

const PublishingTextSchema = z.string().trim().min(1);

export const PublishingTopicSchema = z.string().min(1).max(48).refine(
  (value) => !/[\s\p{White_Space}]/u.test(value),
  "Publishing topics must not contain whitespace.",
);

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

const PublishingIntentAuthoredFields = {
  description: PublishingTextSchema.max(2_000),
  topics: z.array(PublishingTopicSchema).min(6).max(7).readonly(),
  chapters: z.array(PublishingIntentChapterSchema).min(1).max(256).readonly(),
} as const;

export const AuthoredPublishingIntentSchema = z
  .object({
    ...PublishingIntentAuthoredFields,
    collectionId: ProducerConfigIdSchema,
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

const PublishingIntentInputObject = z
  .object({
    ...PublishingIntentAuthoredFields,
    schemaVersion: z.literal(2),
    contractVersion: z.literal(PUBLISHING_INTENT_VERSION),
    storyId: StoryIdSchema,
    storyFingerprint: Sha256DigestSchema,
    collection: z
      .object({
        id: ProducerConfigIdSchema,
        name: PublishingTextSchema.max(96),
        catalogFingerprint: Sha256DigestSchema,
      })
      .strict()
      .readonly(),
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
  });

export const PublishingIntentInputSchema =
  PublishingIntentInputObject.readonly();

export const computePublishingIntentFingerprint = (rawInput: unknown) => {
  const record = { ...(rawInput as Record<string, unknown>) };
  delete record.intentFingerprint;
  return createFingerprint({
    namespace: "publishing-intent",
    version: 2,
    value: PublishingIntentInputSchema.parse(record),
  });
};

export const PublishingIntentSchema = PublishingIntentInputObject.safeExtend({
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
  publishingCollections: rawPublishingCollections,
}: {
  readonly story: unknown;
  readonly authored: unknown;
  readonly publishingCollections: unknown;
}) => {
  const story = StorySpecSchema.parse(rawStory);
  const authored = AuthoredPublishingIntentSchema.parse(rawAuthored);
  const publishingCollections = z
    .array(PublishingCollectionSchema)
    .min(1)
    .parse(rawPublishingCollections);
  const matches = publishingCollections.filter(
    ({ id }) => id === authored.collectionId,
  );
  if (matches.length !== 1) {
    throw new Error(
      "PublishingIntent must select exactly one current publishing collection.",
    );
  }
  const selectedCollection = matches[0];
  if (selectedCollection === undefined) {
    throw new Error("Publishing collection selection is unavailable.");
  }
  const { collectionId: _collectionId, ...authoredWithoutCollection } =
    authored;
  void _collectionId;
  const input = PublishingIntentInputSchema.parse({
    ...authoredWithoutCollection,
    schemaVersion: 2,
    contractVersion: PUBLISHING_INTENT_VERSION,
    storyId: story.storyId,
    storyFingerprint: computeStoryFingerprint(story),
    collection: {
      id: selectedCollection.id,
      name: selectedCollection.name,
      catalogFingerprint: computePublishingCollectionCatalogFingerprint(
        publishingCollections,
      ),
    },
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

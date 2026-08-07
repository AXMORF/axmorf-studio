import { z } from "zod";

import { DeliveryReleaseIdSchema } from "./delivery";
import { createFingerprint } from "./fingerprint";
import {
  CompositionIdSchema,
  NonNegativeIntegerSchema,
  PositiveIntegerSchema,
  Sha256DigestSchema,
  StoryIdSchema,
} from "./primitives";
import { SemanticTimingSchema } from "./semantic-timing";
import { StorySpecSchema } from "./story";
import {
  PublishingIntentSchema,
  resolveCurrentPublishingIntent,
} from "./publishing-intent";

export const DELIVERY_SPECIFICATION_VERSION_V2 =
  "delivery-specification-v2" as const;
export const DELIVERY_ARCHIVE_POLICY_VERSION_V2 =
  "approved-preview-cover-archive-v2" as const;
export const DELIVERY_PUBLISHING_VERSION_V2 =
  "delivery-publishing-v2" as const;
export const DELIVERY_RELEASE_MANIFEST_VERSION_V2 =
  "delivery-release-manifest-v2" as const;

const DeliverySpecificationV2InputObject = z
  .object({
    schemaVersion: z.literal(2),
    specificationVersion: z.literal(DELIVERY_SPECIFICATION_VERSION_V2),
    archivePolicyVersion: z.literal(DELIVERY_ARCHIVE_POLICY_VERSION_V2),
    storyId: StoryIdSchema,
    compositionId: CompositionIdSchema,
    publishingIntentFingerprint: Sha256DigestSchema,
    coverResultFingerprint: Sha256DigestSchema,
  })
  .strict();

export const DeliverySpecificationV2InputSchema =
  DeliverySpecificationV2InputObject.readonly();

export const computeDeliverySpecificationV2Fingerprint = (rawInput: unknown) => {
  const record = { ...(rawInput as Record<string, unknown>) };
  delete record.deliverySpecificationFingerprint;
  return createFingerprint({
    namespace: "delivery-specification",
    version: 2,
    value: DeliverySpecificationV2InputSchema.parse(record),
  });
};

export const DeliverySpecificationV2Schema =
  DeliverySpecificationV2InputObject.extend({
    deliverySpecificationFingerprint: Sha256DigestSchema,
  })
    .strict()
    .superRefine((specification, context) => {
      const { deliverySpecificationFingerprint, ...input } = specification;
      if (
        deliverySpecificationFingerprint !==
        computeDeliverySpecificationV2Fingerprint(input)
      ) {
        context.addIssue({
          code: "custom",
          message: "DeliverySpecification v2 fingerprint is stale.",
          path: ["deliverySpecificationFingerprint"],
        });
      }
    })
    .readonly();

export const createDeliverySpecificationV2 = (rawInput: unknown) => {
  const record: Record<string, unknown> = {
    ...(rawInput as Record<string, unknown>),
    schemaVersion: 2,
    specificationVersion: DELIVERY_SPECIFICATION_VERSION_V2,
    archivePolicyVersion: DELIVERY_ARCHIVE_POLICY_VERSION_V2,
  };
  delete record.deliverySpecificationFingerprint;
  const input = DeliverySpecificationV2InputSchema.parse(record);
  return DeliverySpecificationV2Schema.parse({
    ...input,
    deliverySpecificationFingerprint:
      computeDeliverySpecificationV2Fingerprint(input),
  });
};

const DeliveryReleaseIdentityV2Schema = z
  .object({
    approvalFingerprint: Sha256DigestSchema,
    finalAssemblyFingerprint: Sha256DigestSchema,
    deliverySpecificationFingerprint: Sha256DigestSchema,
  })
  .strict()
  .readonly();

export const createDeliveryReleaseIdV2 = (rawInput: unknown) => {
  const fingerprint = createFingerprint({
    namespace: "delivery-release-id",
    version: 2,
    value: DeliveryReleaseIdentityV2Schema.parse(rawInput),
  });
  return DeliveryReleaseIdSchema.parse(`release-${fingerprint.slice(7)}`);
};

const PublishingChapterV2Schema = z
  .object({
    meaningId: z.string().min(1).max(96),
    name: z.string().trim().min(1).max(64),
    startFrame: NonNegativeIntegerSchema,
    timecode: z.string().regex(/^\d{2,}:\d{2}:\d{2}$/u),
  })
  .strict()
  .readonly();

export const DeliveryPublishingV2Schema = z
  .object({
    schemaVersion: z.literal(2),
    publishingVersion: z.literal(DELIVERY_PUBLISHING_VERSION_V2),
    storyId: StoryIdSchema,
    compositionId: CompositionIdSchema,
    title: z.string().trim().min(1),
    description: z.string().trim().min(1).max(2_000),
    topics: z.array(z.string().trim().min(1).max(48)).min(6).max(7).readonly(),
    collection: z.string().trim().min(1).max(96),
    chapters: z.array(PublishingChapterV2Schema).min(1).max(256).readonly(),
    fps: PositiveIntegerSchema,
    totalFrames: PositiveIntegerSchema,
    actualDurationSeconds: z.number().positive().finite(),
    mp4FileName: z.string().min(1).max(128),
    cover4x3FileName: z.literal("cover-4x3.png"),
    cover3x4FileName: z.literal("cover-3x4.png"),
  })
  .strict()
  .superRefine((publishing, context) => {
    if (new Set(publishing.topics).size !== publishing.topics.length) {
      context.addIssue({
        code: "custom",
        message: "Publishing topics must be unique.",
        path: ["topics"],
      });
    }
    if (publishing.mp4FileName !== `${publishing.storyId}.mp4`) {
      context.addIssue({
        code: "custom",
        message: "Publishing MP4 filename must match the fixed Story rule.",
        path: ["mp4FileName"],
      });
    }
    publishing.chapters.forEach((chapter, index) => {
      if (
        chapter.startFrame >= publishing.totalFrames ||
        (index > 0 &&
          chapter.startFrame <= publishing.chapters[index - 1]!.startFrame)
      ) {
        context.addIssue({
          code: "custom",
          message: "Publishing chapters must be ordered inside the video.",
          path: ["chapters", index],
        });
      }
    });
  })
  .readonly();

const formatFloorTimecode = (frame: number, fps: number) => {
  const totalSeconds = Math.floor(frame / fps);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

const PublishingFinalAssemblySchema = z
  .object({
    storyId: StoryIdSchema,
    compositionId: CompositionIdSchema,
    fps: PositiveIntegerSchema,
    durationInFrames: PositiveIntegerSchema,
  })
  .passthrough()
  .readonly();

export const createPublishingMetadataV2 = ({
  story: rawStory,
  intent: rawIntent,
  semanticTiming: rawSemanticTiming,
  finalAssembly: rawFinalAssembly,
  actualDurationSeconds,
}: {
  readonly story: unknown;
  readonly intent: unknown;
  readonly semanticTiming: unknown;
  readonly finalAssembly: unknown;
  readonly actualDurationSeconds: number;
}) => {
  const story = StorySpecSchema.parse(rawStory);
  const intent = resolveCurrentPublishingIntent({ story, intent: rawIntent });
  const semanticTiming = SemanticTimingSchema.parse(rawSemanticTiming);
  const finalAssembly = PublishingFinalAssemblySchema.parse(rawFinalAssembly);
  if (
    semanticTiming.storyId !== story.storyId ||
    finalAssembly.storyId !== story.storyId ||
    semanticTiming.fps !== finalAssembly.fps ||
    semanticTiming.durationInFrames !== finalAssembly.durationInFrames ||
    semanticTiming.storyBeats.length !== story.beats.length ||
    semanticTiming.storyBeats.some(
      ({ meaningId }, index) => meaningId !== story.beats[index]?.meaningId,
    )
  ) {
    throw new Error(
      "Publishing projection requires current Story, SemanticTiming, and FinalAssembly identities.",
    );
  }
  const parsedDuration = z.number().positive().finite().parse(actualDurationSeconds);
  return DeliveryPublishingV2Schema.parse({
    schemaVersion: 2,
    publishingVersion: DELIVERY_PUBLISHING_VERSION_V2,
    storyId: story.storyId,
    compositionId: finalAssembly.compositionId,
    title: story.title,
    description: intent.description,
    topics: intent.topics,
    collection: intent.collection,
    chapters: intent.chapters.map((chapter, index) => {
      const timing = semanticTiming.storyBeats[index];
      if (timing?.meaningId !== chapter.meaningId) {
        throw new Error("Publishing chapter timing order is stale.");
      }
      return {
        meaningId: chapter.meaningId,
        name: chapter.name,
        startFrame: timing.startFrame,
        timecode: formatFloorTimecode(timing.startFrame, finalAssembly.fps),
      };
    }),
    fps: finalAssembly.fps,
    totalFrames: finalAssembly.durationInFrames,
    actualDurationSeconds: parsedDuration,
    mp4FileName: `${story.storyId}.mp4`,
    cover4x3FileName: "cover-4x3.png",
    cover3x4FileName: "cover-3x4.png",
  });
};

const DeliveryVideoMediaV2Schema = z
  .object({
    videoCodec: z.literal("h264"),
    audioCodec: z.literal("aac"),
    width: PositiveIntegerSchema,
    height: PositiveIntegerSchema,
    fpsNumerator: PositiveIntegerSchema,
    fpsDenominator: PositiveIntegerSchema,
    frameCount: PositiveIntegerSchema,
    videoDurationSeconds: z.number().positive().finite(),
    actualDurationSeconds: z.number().positive().finite(),
    sampleRate: PositiveIntegerSchema,
    channelLayout: z.string().trim().min(1).max(80),
    videoStreamCount: z.literal(1),
    audioStreamCount: z.literal(1),
    decodedToEof: z.literal(true),
  })
  .strict()
  .readonly();

const DeliveryImageMediaV2Schema = z
  .object({
    imageFormat: z.literal("png"),
    width: PositiveIntegerSchema,
    height: PositiveIntegerSchema,
    decodedToEof: z.literal(true),
  })
  .strict()
  .readonly();

const DeliveryPayloadFileBaseSchema = z
  .object({
    checksum: Sha256DigestSchema,
    sizeBytes: PositiveIntegerSchema,
  })
  .strict();

const DeliveryVideoFileV2Schema = DeliveryPayloadFileBaseSchema.extend({
  kind: z.literal("video"),
  fileName: z.string().min(1).max(128),
  media: DeliveryVideoMediaV2Schema,
})
  .strict()
  .readonly();

const DeliveryImageFileV2Schema = DeliveryPayloadFileBaseSchema.extend({
  kind: z.literal("image"),
  fileName: z.enum(["cover-4x3.png", "cover-3x4.png"]),
  media: DeliveryImageMediaV2Schema,
})
  .strict()
  .readonly();

const DeliveryTextFileV2Schema = DeliveryPayloadFileBaseSchema.extend({
  kind: z.enum(["json", "markdown"]),
  fileName: z.enum(["publishing.json", "HANDOFF.md"]),
  contentType: z.enum([
    "application/json",
    "text/markdown; charset=utf-8",
  ]),
})
  .strict()
  .readonly();

const DeliveryReleaseManifestV2InputObject = z
  .object({
    schemaVersion: z.literal(2),
    manifestVersion: z.literal(DELIVERY_RELEASE_MANIFEST_VERSION_V2),
    releaseId: DeliveryReleaseIdSchema,
    storyId: StoryIdSchema,
    compositionId: CompositionIdSchema,
    identities: z
      .object({
        approvalFingerprint: Sha256DigestSchema,
        evidenceFingerprint: Sha256DigestSchema,
        finalAssemblyFingerprint: Sha256DigestSchema,
        finalMechanicalCheckVersion: z.literal("final-mechanical-check-v2"),
        finalMechanicalCheckReportFingerprint: Sha256DigestSchema,
        publishingIntentFingerprint: Sha256DigestSchema,
        coverResultFingerprint: Sha256DigestSchema,
        deliveryArchivePolicyVersion: z.literal(
          DELIVERY_ARCHIVE_POLICY_VERSION_V2,
        ),
        deliverySpecificationFingerprint: Sha256DigestSchema,
        approvedPreviewChecksum: Sha256DigestSchema,
      })
      .strict()
      .readonly(),
    files: z
      .object({
        video: DeliveryVideoFileV2Schema,
        cover4x3: DeliveryImageFileV2Schema,
        cover3x4: DeliveryImageFileV2Schema,
        publishing: DeliveryTextFileV2Schema,
        handoff: DeliveryTextFileV2Schema,
      })
      .strict()
      .readonly(),
    verification: z
      .object({
        deliveryCheckCommand: z.string().trim().min(1).max(512),
        checksumCommand: z.string().trim().min(1).max(512),
      })
      .strict()
      .readonly(),
  })
  .strict()
  .superRefine((manifest, context) => {
    const expectedReleaseId = createDeliveryReleaseIdV2({
      approvalFingerprint: manifest.identities.approvalFingerprint,
      finalAssemblyFingerprint: manifest.identities.finalAssemblyFingerprint,
      deliverySpecificationFingerprint:
        manifest.identities.deliverySpecificationFingerprint,
    });
    if (manifest.releaseId !== expectedReleaseId) {
      context.addIssue({
        code: "custom",
        message: "Delivery release v2 ID is stale.",
        path: ["releaseId"],
      });
    }
    if (
      manifest.files.video.fileName !== `${manifest.storyId}.mp4` ||
      manifest.files.video.checksum !==
        manifest.identities.approvedPreviewChecksum ||
      manifest.files.cover4x3.fileName !== "cover-4x3.png" ||
      manifest.files.cover4x3.media.width !== 1600 ||
      manifest.files.cover4x3.media.height !== 1200 ||
      manifest.files.cover3x4.fileName !== "cover-3x4.png" ||
      manifest.files.cover3x4.media.width !== 1200 ||
      manifest.files.cover3x4.media.height !== 1600 ||
      manifest.files.publishing.kind !== "json" ||
      manifest.files.publishing.fileName !== "publishing.json" ||
      manifest.files.publishing.contentType !== "application/json" ||
      manifest.files.handoff.kind !== "markdown" ||
      manifest.files.handoff.fileName !== "HANDOFF.md" ||
      manifest.files.handoff.contentType !== "text/markdown; charset=utf-8"
    ) {
      context.addIssue({
        code: "custom",
        message: "Delivery release v2 files do not follow the fixed policy.",
        path: ["files"],
      });
    }
    const releaseRoot = `deliveries/${manifest.storyId}/${manifest.releaseId}`;
    if (
      manifest.verification.deliveryCheckCommand !==
        `npm run delivery:check -- --project ${manifest.storyId} --release ${manifest.releaseId}` ||
      manifest.verification.checksumCommand !==
        `cd ${releaseRoot} && sha256sum -c checksums.sha256`
    ) {
      context.addIssue({
        code: "custom",
        message: "Delivery release v2 verification commands are stale.",
        path: ["verification"],
      });
    }
  });

export const DeliveryReleaseManifestV2InputSchema =
  DeliveryReleaseManifestV2InputObject.readonly();

export const computeDeliveryReleaseManifestV2Fingerprint = (
  rawInput: unknown,
) => {
  const record = { ...(rawInput as Record<string, unknown>) };
  delete record.manifestFingerprint;
  return createFingerprint({
    namespace: "delivery-release-manifest",
    version: 2,
    value: DeliveryReleaseManifestV2InputSchema.parse(record),
  });
};

export const DeliveryReleaseManifestV2Schema =
  DeliveryReleaseManifestV2InputObject.extend({
    manifestFingerprint: Sha256DigestSchema,
  })
    .strict()
    .superRefine((manifest, context) => {
      const { manifestFingerprint, ...input } = manifest;
      if (
        manifestFingerprint !==
        computeDeliveryReleaseManifestV2Fingerprint(input)
      ) {
        context.addIssue({
          code: "custom",
          message: "DeliveryReleaseManifest v2 fingerprint is stale.",
          path: ["manifestFingerprint"],
        });
      }
    })
    .readonly();

export const createDeliveryReleaseManifestV2 = (rawInput: unknown) => {
  const record: Record<string, unknown> = {
    ...(rawInput as Record<string, unknown>),
    schemaVersion: 2,
    manifestVersion: DELIVERY_RELEASE_MANIFEST_VERSION_V2,
  };
  delete record.manifestFingerprint;
  const input = DeliveryReleaseManifestV2InputSchema.parse(record);
  return DeliveryReleaseManifestV2Schema.parse({
    ...input,
    manifestFingerprint: computeDeliveryReleaseManifestV2Fingerprint(input),
  });
};

export type DeliverySpecificationV2 = z.infer<
  typeof DeliverySpecificationV2Schema
>;
export type DeliveryPublishingV2 = z.infer<
  typeof DeliveryPublishingV2Schema
>;
export type DeliveryReleaseManifestV2 = z.infer<
  typeof DeliveryReleaseManifestV2Schema
>;
export type PublishingIntentForDelivery = z.infer<
  typeof PublishingIntentSchema
>;

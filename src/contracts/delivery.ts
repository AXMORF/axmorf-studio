import { z } from "zod";

import { createFingerprint } from "./fingerprint";
import {
  CompositionIdSchema,
  NonNegativeIntegerSchema,
  PositiveIntegerSchema,
  Sha256DigestSchema,
  StoryIdSchema,
} from "./primitives";

export const DELIVERY_SPECIFICATION_VERSION =
  "delivery-specification-v1" as const;
export const DELIVERY_COVER_SOURCE_VERSION =
  "project-owned-remotion-stills-v1" as const;
export const DELIVERY_VERIFICATION_POLICY_VERSION =
  "delivery-local-verification-v1" as const;
export const DELIVERY_PUBLISHING_VERSION = "delivery-publishing-v1" as const;
export const DELIVERY_RELEASE_MANIFEST_VERSION =
  "delivery-release-manifest-v1" as const;

const UnicodeTextSchema = z.string().trim().min(1);

const ChapterSchema = z
  .object({
    name: UnicodeTextSchema.max(64).refine(
      (value) => Array.from(value).length <= 11,
      "Delivery chapter names must contain at most 11 Unicode characters.",
    ),
    startFrame: NonNegativeIntegerSchema,
  })
  .strict()
  .readonly();

const AuthoredDeliverySpecificationObject = z
  .object({
    schemaVersion: z.literal(1),
    specificationVersion: z.literal(DELIVERY_SPECIFICATION_VERSION),
    verificationPolicyVersion: z.literal(DELIVERY_VERIFICATION_POLICY_VERSION),
    storyId: StoryIdSchema,
    compositionId: CompositionIdSchema,
    title: UnicodeTextSchema.max(160),
    description: UnicodeTextSchema.max(2_000),
    topics: z.array(UnicodeTextSchema.max(48)).min(6).max(7).readonly(),
    collection: UnicodeTextSchema.max(96),
    chapters: z.array(ChapterSchema).min(1).max(64).readonly(),
  })
  .strict()
  .superRefine((specification, context) => {
    if (new Set(specification.topics).size !== specification.topics.length) {
      context.addIssue({
        code: "custom",
        message: "Delivery topics must be unique.",
        path: ["topics"],
      });
    }
    specification.chapters.forEach((chapter, index) => {
      if (
        (index === 0 && chapter.startFrame !== 0) ||
        (index > 0 &&
          chapter.startFrame <= specification.chapters[index - 1].startFrame)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Delivery chapters must start at frame zero and increase strictly.",
          path: ["chapters", index, "startFrame"],
        });
      }
    });
  });

export const AuthoredDeliverySpecificationSchema =
  AuthoredDeliverySpecificationObject.readonly();

const CoverSourceFileSchema = z
  .object({
    relativePath: z.string().min(1).max(256),
    checksum: Sha256DigestSchema,
  })
  .strict()
  .readonly();

const DeliverySpecificationInputObject = z
  .object({
    ...AuthoredDeliverySpecificationObject.shape,
    coverSourceVersion: z.literal(DELIVERY_COVER_SOURCE_VERSION),
    coverSourceFiles: z
      .tuple([
        CoverSourceFileSchema,
        CoverSourceFileSchema,
        CoverSourceFileSchema,
      ])
      .readonly(),
  })
  .strict()
  .superRefine((specification, context) => {
    if (new Set(specification.topics).size !== specification.topics.length) {
      context.addIssue({
        code: "custom",
        message: "Delivery topics must be unique.",
        path: ["topics"],
      });
    }
    specification.chapters.forEach((chapter, index) => {
      if (
        (index === 0 && chapter.startFrame !== 0) ||
        (index > 0 &&
          chapter.startFrame <= specification.chapters[index - 1].startFrame)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Delivery chapters must start at frame zero and increase strictly.",
          path: ["chapters", index, "startFrame"],
        });
      }
    });
    const expectedPaths = [
      `src/projects/${specification.storyId}/delivery/Covers.tsx`,
      `src/projects/${specification.storyId}/delivery/Root.tsx`,
      `src/projects/${specification.storyId}/delivery/index.ts`,
    ];
    specification.coverSourceFiles.forEach((file, index) => {
      if (file.relativePath !== expectedPaths[index]) {
        context.addIssue({
          code: "custom",
          message: "Delivery cover source graph must use the fixed files.",
          path: ["coverSourceFiles", index, "relativePath"],
        });
      }
    });
  });

export const DeliverySpecificationInputSchema =
  DeliverySpecificationInputObject.readonly();

export const computeDeliverySpecificationFingerprint = (rawInput: unknown) =>
  createFingerprint({
    namespace: "delivery-specification",
    version: 1,
    value: DeliverySpecificationInputSchema.parse(rawInput),
  });

export const DeliverySpecificationSchema =
  DeliverySpecificationInputObject.safeExtend({
    deliverySpecificationFingerprint: Sha256DigestSchema,
  })
    .strict()
    .superRefine((specification, context) => {
      const { deliverySpecificationFingerprint, ...input } = specification;
      try {
        if (
          deliverySpecificationFingerprint !==
          computeDeliverySpecificationFingerprint(input)
        ) {
          context.addIssue({
            code: "custom",
            message: "Delivery specification fingerprint is stale.",
            path: ["deliverySpecificationFingerprint"],
          });
        }
      } catch {
        return;
      }
    })
    .readonly();

export const createDeliverySpecification = ({
  authored: rawAuthored,
  coverSourceFiles,
}: {
  readonly authored: unknown;
  readonly coverSourceFiles: unknown;
}) => {
  const authored = AuthoredDeliverySpecificationSchema.parse(rawAuthored);
  const input = DeliverySpecificationInputSchema.parse({
    ...authored,
    coverSourceVersion: DELIVERY_COVER_SOURCE_VERSION,
    coverSourceFiles,
  });
  return DeliverySpecificationSchema.parse({
    ...input,
    deliverySpecificationFingerprint:
      computeDeliverySpecificationFingerprint(input),
  });
};

export const DeliveryReleaseIdSchema = z
  .string()
  .regex(/^release-[0-9a-f]{64}$/u)
  .brand<"DeliveryReleaseId">();

const ReleaseIdentityInputSchema = z
  .object({
    approvalFingerprint: Sha256DigestSchema,
    finalAssemblyFingerprint: Sha256DigestSchema,
    deliverySpecificationFingerprint: Sha256DigestSchema,
  })
  .strict()
  .readonly();

export const createDeliveryReleaseId = (rawInput: unknown) => {
  const fingerprint = createFingerprint({
    namespace: "delivery-release-id",
    version: 1,
    value: ReleaseIdentityInputSchema.parse(rawInput),
  });
  return DeliveryReleaseIdSchema.parse(`release-${fingerprint.slice(7)}`);
};

const PublishingChapterSchema = ChapterSchema.unwrap()
  .extend({
    timeSeconds: z.number().finite().nonnegative(),
    timecode: z.string().regex(/^\d{2}:\d{2}:\d{2}\.\d{3}$/u),
  })
  .strict()
  .readonly();

export const DeliveryPublishingSchema = z
  .object({
    schemaVersion: z.literal(1),
    publishingVersion: z.literal(DELIVERY_PUBLISHING_VERSION),
    storyId: StoryIdSchema,
    compositionId: CompositionIdSchema,
    title: UnicodeTextSchema.max(160),
    description: UnicodeTextSchema.max(2_000),
    topics: z.array(UnicodeTextSchema.max(48)).min(6).max(7).readonly(),
    collection: UnicodeTextSchema.max(96),
    chapters: z.array(PublishingChapterSchema).min(1).max(64).readonly(),
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
        message: "Publishing MP4 filename must match the Story ID.",
        path: ["mp4FileName"],
      });
    }
    publishing.chapters.forEach((chapter, index) => {
      if (
        chapter.startFrame >= publishing.totalFrames ||
        (index === 0 && chapter.startFrame !== 0) ||
        (index > 0 &&
          chapter.startFrame <= publishing.chapters[index - 1].startFrame)
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

const roundMilliseconds = (seconds: number) =>
  Math.round(seconds * 1_000) / 1_000;

const formatTimecode = (seconds: number) => {
  const totalMilliseconds = Math.round(seconds * 1_000);
  const hours = Math.floor(totalMilliseconds / 3_600_000);
  const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
  const wholeSeconds = Math.floor((totalMilliseconds % 60_000) / 1_000);
  const milliseconds = totalMilliseconds % 1_000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
};

export const createPublishingMetadata = ({
  specification: rawSpecification,
  fps,
  totalFrames,
  actualDurationSeconds,
}: {
  readonly specification: unknown;
  readonly fps: number;
  readonly totalFrames: number;
  readonly actualDurationSeconds: number;
}) => {
  const specification = DeliverySpecificationSchema.parse(rawSpecification);
  return DeliveryPublishingSchema.parse({
    schemaVersion: 1,
    publishingVersion: DELIVERY_PUBLISHING_VERSION,
    storyId: specification.storyId,
    compositionId: specification.compositionId,
    title: specification.title,
    description: specification.description,
    topics: specification.topics,
    collection: specification.collection,
    chapters: specification.chapters.map((chapter) => {
      const timeSeconds = roundMilliseconds(chapter.startFrame / fps);
      return {
        ...chapter,
        timeSeconds,
        timecode: formatTimecode(timeSeconds),
      };
    }),
    fps,
    totalFrames,
    actualDurationSeconds,
    mp4FileName: `${specification.storyId}.mp4`,
    cover4x3FileName: "cover-4x3.png",
    cover3x4FileName: "cover-3x4.png",
  });
};

const VideoMediaSchema = z
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
    channelLayout: UnicodeTextSchema.max(80),
    videoStreamCount: z.literal(1),
    audioStreamCount: z.literal(1),
    decodedToEof: z.literal(true),
  })
  .strict()
  .readonly();

const ImageMediaSchema = z
  .object({
    imageFormat: z.literal("png"),
    width: PositiveIntegerSchema,
    height: PositiveIntegerSchema,
    decodedToEof: z.literal(true),
  })
  .strict()
  .readonly();

const VideoFileSchema = z
  .object({
    kind: z.literal("video"),
    fileName: z.string().min(1).max(128),
    checksum: Sha256DigestSchema,
    sizeBytes: PositiveIntegerSchema,
    media: VideoMediaSchema,
  })
  .strict()
  .readonly();

const ImageFileSchema = z
  .object({
    kind: z.literal("image"),
    fileName: z.enum(["cover-4x3.png", "cover-3x4.png"]),
    checksum: Sha256DigestSchema,
    sizeBytes: PositiveIntegerSchema,
    media: ImageMediaSchema,
  })
  .strict()
  .readonly();

const JsonFileSchema = z
  .object({
    kind: z.literal("json"),
    fileName: z.literal("publishing.json"),
    checksum: Sha256DigestSchema,
    sizeBytes: PositiveIntegerSchema,
    contentType: z.literal("application/json"),
  })
  .strict()
  .readonly();

const MarkdownFileSchema = z
  .object({
    kind: z.literal("markdown"),
    fileName: z.literal("HANDOFF.md"),
    checksum: Sha256DigestSchema,
    sizeBytes: PositiveIntegerSchema,
    contentType: z.literal("text/markdown; charset=utf-8"),
  })
  .strict()
  .readonly();

const ReleaseManifestInputObject = z
  .object({
    schemaVersion: z.literal(1),
    manifestVersion: z.literal(DELIVERY_RELEASE_MANIFEST_VERSION),
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
        deliverySpecificationFingerprint: Sha256DigestSchema,
        approvedPreviewChecksum: Sha256DigestSchema,
      })
      .strict()
      .readonly(),
    files: z
      .object({
        video: VideoFileSchema,
        cover4x3: ImageFileSchema,
        cover3x4: ImageFileSchema,
        publishing: JsonFileSchema,
        handoff: MarkdownFileSchema,
      })
      .strict()
      .readonly(),
    verification: z
      .object({
        deliveryCheckCommand: UnicodeTextSchema.max(512),
        checksumCommand: UnicodeTextSchema.max(512),
      })
      .strict()
      .readonly(),
  })
  .strict()
  .superRefine((manifest, context) => {
    const expectedReleaseId = createDeliveryReleaseId({
      approvalFingerprint: manifest.identities.approvalFingerprint,
      finalAssemblyFingerprint: manifest.identities.finalAssemblyFingerprint,
      deliverySpecificationFingerprint:
        manifest.identities.deliverySpecificationFingerprint,
    });
    if (manifest.releaseId !== expectedReleaseId) {
      context.addIssue({
        code: "custom",
        message: "Delivery release ID is stale.",
        path: ["releaseId"],
      });
    }
    if (
      manifest.files.video.fileName !== `${manifest.storyId}.mp4` ||
      manifest.files.video.checksum !==
        manifest.identities.approvedPreviewChecksum
    ) {
      context.addIssue({
        code: "custom",
        message: "Delivery video must be the exact approved preview.",
        path: ["files", "video"],
      });
    }
    if (
      manifest.files.cover4x3.fileName !== "cover-4x3.png" ||
      manifest.files.cover4x3.media.width !== 1600 ||
      manifest.files.cover4x3.media.height !== 1200 ||
      manifest.files.cover3x4.fileName !== "cover-3x4.png" ||
      manifest.files.cover3x4.media.width !== 1200 ||
      manifest.files.cover3x4.media.height !== 1600
    ) {
      context.addIssue({
        code: "custom",
        message: "Delivery covers must use the fixed ratios and dimensions.",
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
        message: "Delivery verification commands must use the fixed forms.",
        path: ["verification"],
      });
    }
  });

export const DeliveryReleaseManifestInputSchema =
  ReleaseManifestInputObject.readonly();

export const computeDeliveryReleaseManifestFingerprint = (rawInput: unknown) =>
  createFingerprint({
    namespace: "delivery-release-manifest",
    version: 1,
    value: DeliveryReleaseManifestInputSchema.parse(rawInput),
  });

export const DeliveryReleaseManifestSchema =
  ReleaseManifestInputObject.safeExtend({
    manifestFingerprint: Sha256DigestSchema,
  })
    .strict()
    .superRefine((manifest, context) => {
      const { manifestFingerprint, ...input } = manifest;
      try {
        if (
          manifestFingerprint !==
          computeDeliveryReleaseManifestFingerprint(input)
        ) {
          context.addIssue({
            code: "custom",
            message: "Delivery release manifest fingerprint is stale.",
            path: ["manifestFingerprint"],
          });
        }
      } catch {
        return;
      }
    })
    .readonly();

export const createDeliveryReleaseManifest = (rawInput: unknown) => {
  const input = DeliveryReleaseManifestInputSchema.parse(rawInput);
  return DeliveryReleaseManifestSchema.parse({
    ...input,
    manifestFingerprint: computeDeliveryReleaseManifestFingerprint(input),
  });
};

export type AuthoredDeliverySpecification = z.infer<
  typeof AuthoredDeliverySpecificationSchema
>;
export type DeliverySpecification = z.infer<typeof DeliverySpecificationSchema>;
export type DeliveryPublishing = z.infer<typeof DeliveryPublishingSchema>;
export type DeliveryReleaseManifest = z.infer<
  typeof DeliveryReleaseManifestSchema
>;
export type DeliveryReleaseId = z.infer<typeof DeliveryReleaseIdSchema>;

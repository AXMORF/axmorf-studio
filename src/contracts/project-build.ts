import { z } from "zod";

import { DeliveryPublishingSchema } from "./delivery-launch";
import { createFingerprint } from "./fingerprint";
import {
  CompositionIdSchema,
  PositiveIntegerSchema,
  Sha256DigestSchema,
  StoryIdSchema,
} from "./primitives";

export const PROJECT_BUILD_POLICY_VERSION =
  "synchronous-atomic-project-build-v1" as const;
export const PROJECT_PUBLISH_VERSION = "project-publish-v1" as const;

export const ProjectBuildIdSchema = z
  .string()
  .regex(/^build-[0-9a-f]{64}$/u)
  .brand<"ProjectBuildId">();

const ProjectBuildIdentitySchema = z
  .object({
    storyId: StoryIdSchema,
    sourceSnapshotFingerprint: Sha256DigestSchema,
    compositionId: CompositionIdSchema,
    fps: PositiveIntegerSchema.max(120),
    frameCount: PositiveIntegerSchema,
    width: PositiveIntegerSchema,
    height: PositiveIntegerSchema,
    policyVersion: z.literal(PROJECT_BUILD_POLICY_VERSION),
  })
  .strict();

export const createProjectBuildId = (rawInput: unknown) => {
  const record = rawInput as Record<string, unknown>;
  const identity = ProjectBuildIdentitySchema.parse({
    storyId: record.storyId,
    sourceSnapshotFingerprint: record.sourceSnapshotFingerprint,
    compositionId: record.compositionId,
    fps: record.fps,
    frameCount: record.frameCount,
    width: record.width,
    height: record.height,
    policyVersion: record.policyVersion,
  });
  const fingerprint = createFingerprint({
    namespace: "project-build-identity",
    version: 1,
    value: identity,
  });
  return ProjectBuildIdSchema.parse(
    `build-${fingerprint.slice("sha256:".length)}`,
  );
};

const ProjectBuildArtifactSchema = z
  .object({
    repositoryPath: z.string().min(1).max(512),
    checksum: Sha256DigestSchema,
    sizeBytes: PositiveIntegerSchema,
  })
  .strict();

const ProjectBuildVideoArtifactSchema = ProjectBuildArtifactSchema.safeExtend({
  media: z
    .object({
      codec: z.literal("h264"),
      audioCodec: z.literal("aac"),
      audioChannels: z.union([z.literal(1), z.literal(2)]),
      width: PositiveIntegerSchema,
      height: PositiveIntegerSchema,
      fps: PositiveIntegerSchema.max(120),
      frameCount: PositiveIntegerSchema,
      decodedToEof: z.literal(true),
    })
    .strict()
    .readonly(),
}).readonly();

const ProjectBuildCoverArtifactSchema = ProjectBuildArtifactSchema.safeExtend({
  media: z
    .object({
      imageFormat: z.literal("png"),
      width: PositiveIntegerSchema,
      height: PositiveIntegerSchema,
      decodedToEof: z.literal(true),
    })
    .strict()
    .readonly(),
}).readonly();

const ProjectPublishInputSchema = ProjectBuildIdentitySchema.safeExtend({
  schemaVersion: z.literal(1),
  contractVersion: z.literal(PROJECT_PUBLISH_VERSION),
  buildId: ProjectBuildIdSchema,
  sourceFileCount: PositiveIntegerSchema,
  artifacts: z
    .object({
      video: ProjectBuildVideoArtifactSchema,
      cover4x3: ProjectBuildCoverArtifactSchema,
      cover3x4: ProjectBuildCoverArtifactSchema,
    })
    .strict()
    .readonly(),
  publishing: DeliveryPublishingSchema,
})
  .strict()
  .superRefine((publish, context) => {
    if (publish.buildId !== createProjectBuildId(publish)) {
      context.addIssue({
        code: "custom",
        message: "Project build identity is stale.",
        path: ["buildId"],
      });
    }
    const base = `deliveries/${publish.storyId}`;
    const expectedPaths = {
      video: `${base}/video.mp4`,
      cover4x3: `${base}/cover-4x3.png`,
      cover3x4: `${base}/cover-3x4.png`,
    };
    for (const key of ["video", "cover4x3", "cover3x4"] as const) {
      if (publish.artifacts[key].repositoryPath !== expectedPaths[key]) {
        context.addIssue({
          code: "custom",
          message: "Project publish artifact path is stale.",
          path: ["artifacts", key, "repositoryPath"],
        });
      }
    }
    if (
      publish.publishing.storyId !== publish.storyId ||
      publish.publishing.outputFileName !== "video.mp4" ||
      publish.publishing.fps !== publish.fps ||
      publish.publishing.frameCount !== publish.frameCount ||
      publish.artifacts.video.media.width !== publish.width ||
      publish.artifacts.video.media.height !== publish.height ||
      publish.artifacts.video.media.fps !== publish.fps ||
      publish.artifacts.video.media.frameCount !== publish.frameCount ||
      publish.artifacts.cover4x3.media.width !== 1600 ||
      publish.artifacts.cover4x3.media.height !== 1200 ||
      publish.artifacts.cover3x4.media.width !== 1200 ||
      publish.artifacts.cover3x4.media.height !== 1600
    ) {
      context.addIssue({
        code: "custom",
        message: "Project publish metadata and artifacts are cross-bound.",
        path: ["artifacts"],
      });
    }
  })
  .readonly();

export const ProjectPublishSchema = ProjectPublishInputSchema;

export const buildProjectPublish = (rawInput: unknown) =>
  ProjectPublishSchema.parse({
    ...(rawInput as Record<string, unknown>),
    schemaVersion: 1,
    contractVersion: PROJECT_PUBLISH_VERSION,
    policyVersion: PROJECT_BUILD_POLICY_VERSION,
  });

export type ProjectBuildId = z.infer<typeof ProjectBuildIdSchema>;
export type ProjectPublish = z.infer<typeof ProjectPublishSchema>;

import { z } from "zod";

import { DeliveryPublishingSchema } from "./delivery-publishing";
import { createFingerprint } from "./fingerprint";
import { CompositionIdSchema, PositiveIntegerSchema, Sha256DigestSchema, StoryIdSchema } from "./primitives";
import { ProductionRevisionIdSchema } from "./production-revision";
import { SourceCurrentIdSchema } from "./source-current";

export const DELIVERY_BUILD_POLICY_VERSION = "source-runtime-delivery-v2" as const;
export const DELIVERY_PUBLISH_VERSION = "source-runtime-project-publish-v2" as const;
export const DeliveryBuildIdSchema = z.string().regex(/^delivery-[0-9a-f]{64}$/u).brand<"DeliveryBuildId">();

const DeliveryBuildIdentitySchema = z.object({
  storyId: StoryIdSchema,
  revisionId: ProductionRevisionIdSchema,
  sourceCurrentId: SourceCurrentIdSchema,
  rendererRuntimeFingerprint: Sha256DigestSchema,
  publishingFingerprint: Sha256DigestSchema,
  compositionId: CompositionIdSchema,
  fps: PositiveIntegerSchema.max(120), frameCount: PositiveIntegerSchema,
  width: PositiveIntegerSchema, height: PositiveIntegerSchema,
  policyVersion: z.literal(DELIVERY_BUILD_POLICY_VERSION),
}).strict();

export const createDeliveryBuildId = (raw: unknown) => {
  const input = DeliveryBuildIdentitySchema.parse(raw);
  const fingerprint = createFingerprint({ namespace: "delivery-build", version: 1, value: input });
  return DeliveryBuildIdSchema.parse(`delivery-${fingerprint.slice("sha256:".length)}`);
};

const FileSchema = z.object({ logicalPath: z.string().min(1), checksum: Sha256DigestSchema, sizeBytes: PositiveIntegerSchema }).strict();
const VideoSchema = FileSchema.extend({ media: z.object({ codec: z.literal("h264"), audioCodec: z.literal("aac"), audioChannels: z.union([z.literal(1), z.literal(2)]), width: PositiveIntegerSchema, height: PositiveIntegerSchema, fps: PositiveIntegerSchema, frameCount: PositiveIntegerSchema, decodedToEof: z.literal(true) }).strict() }).strict();
const CoverSchema = FileSchema.extend({ media: z.object({ imageFormat: z.literal("png"), width: PositiveIntegerSchema, height: PositiveIntegerSchema, decodedToEof: z.literal(true) }).strict() }).strict();

const PublishInputSchema = DeliveryBuildIdentitySchema.extend({
  schemaVersion: z.literal(1), contractVersion: z.literal(DELIVERY_PUBLISH_VERSION), deliveryBuildId: DeliveryBuildIdSchema,
  artifacts: z.object({ video: VideoSchema, cover4x3: CoverSchema, cover3x4: CoverSchema }).strict(), publishing: DeliveryPublishingSchema,
}).strict().superRefine((publish, context) => {
  const identity = {
    storyId: publish.storyId,
    revisionId: publish.revisionId,
    sourceCurrentId: publish.sourceCurrentId,
    rendererRuntimeFingerprint: publish.rendererRuntimeFingerprint,
    publishingFingerprint: publish.publishingFingerprint,
    compositionId: publish.compositionId,
    fps: publish.fps,
    frameCount: publish.frameCount,
    width: publish.width,
    height: publish.height,
    policyVersion: publish.policyVersion,
  };
  if (publish.deliveryBuildId !== createDeliveryBuildId(identity)) context.addIssue({ code: "custom", message: "Delivery build identity is stale.", path: ["deliveryBuildId"] });
  const expectedPublishingFingerprint = createFingerprint({
    namespace: "delivery-publishing-input",
    version: 1,
    value: publish.publishing,
  });
  if (publish.publishingFingerprint !== expectedPublishingFingerprint) {
    context.addIssue({
      code: "custom",
      message: "Delivery publishing identity is stale.",
      path: ["publishingFingerprint"],
    });
  }
  const expected = { video: `deliveries/${publish.storyId}/video.mp4`, cover4x3: `deliveries/${publish.storyId}/cover-4x3.png`, cover3x4: `deliveries/${publish.storyId}/cover-3x4.png` };
  for (const key of Object.keys(expected) as Array<keyof typeof expected>) if (publish.artifacts[key].logicalPath !== expected[key]) context.addIssue({ code: "custom", message: "Delivery artifact path is stale.", path: ["artifacts", key, "logicalPath"] });
});

export const DeliveryPublishSchema = PublishInputSchema.readonly();
export const buildDeliveryPublish = (raw: unknown) => DeliveryPublishSchema.parse({ ...(raw as Record<string, unknown>), schemaVersion: 1, contractVersion: DELIVERY_PUBLISH_VERSION, policyVersion: DELIVERY_BUILD_POLICY_VERSION });
export type DeliveryPublish = z.infer<typeof DeliveryPublishSchema>;

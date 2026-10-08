import { z } from "zod";

import {
  ProductionRevisionIdSchema,
  RenderSpecSchema,
  Sha256DigestSchema,
  StoryIdSchema,
  createFingerprint,
} from "@axmorf/studio/contracts";

export const PREVIEW_VERSION = "project-preview-v1" as const;
export const PREVIEW_FILES = ["preview.json", "preview.mp4"] as const;

export const PreviewProfileSchema = z
  .object({
    profileVersion: z.literal("draft-proportional-v1"),
    scale: z.number().finite().positive().lt(1),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    fps: z.number().int().positive(),
    frameCount: z.number().int().positive(),
    videoCodec: z.literal("h264"),
    audioCodec: z.literal("aac"),
    audioChannels: z.union([z.literal(1), z.literal(2)]),
    crf: z.literal(28),
    pixelFormat: z.literal("yuv420p"),
  })
  .strict()
  .readonly();

export type PreviewProfile = z.infer<typeof PreviewProfileSchema>;

const greatestCommonDivisor = (left: number, right: number): number => {
  let a = left;
  let b = right;
  while (b !== 0) {
    [a, b] = [b, a % b];
  }
  return a;
};

export const createPreviewProfile = (
  rawRender: unknown,
  frameCount: number,
): PreviewProfile => {
  const render = RenderSpecSchema.parse(rawRender);
  const divisor = greatestCommonDivisor(render.width, render.height);
  const maximumScale = Math.min(
    0.5,
    960 / Math.max(render.width, render.height),
  );
  // An even multiplier of the reduced ratio preserves the exact aspect ratio
  // without Remotion rounding an H.264 dimension or changing the layout size.
  const multiplier = Math.floor((divisor * maximumScale) / 2) * 2;
  if (multiplier === 0) {
    throw new Error(
      "Project dimensions have no smaller proportional even H.264 preview size.",
    );
  }
  return PreviewProfileSchema.parse({
    profileVersion: "draft-proportional-v1",
    scale: multiplier / divisor,
    width: (render.width / divisor) * multiplier,
    height: (render.height / divisor) * multiplier,
    fps: render.fps,
    frameCount,
    videoCodec: render.output.videoCodec,
    audioCodec: render.output.audioCodec,
    audioChannels: render.output.audioChannels,
    crf: 28,
    pixelFormat: "yuv420p",
  });
};

export const PreviewReceiptSchema = z
  .object({
    schemaVersion: z.literal(1),
    previewVersion: z.literal(PREVIEW_VERSION),
    previewBuildId: z.string().regex(/^preview-[a-f0-9]{64}$/u),
    storyId: StoryIdSchema,
    revisionId: ProductionRevisionIdSchema,
    sourceFingerprint: Sha256DigestSchema,
    sourceSnapshotFingerprint: Sha256DigestSchema,
    artifactSetFingerprint: Sha256DigestSchema,
    profile: PreviewProfileSchema,
    video: z
      .object({
        file: z.literal("preview.mp4"),
        checksum: Sha256DigestSchema,
        sizeBytes: z.number().int().positive(),
        media: z
          .object({
            codec: z.literal("h264"),
            audioCodec: z.literal("aac"),
            audioChannels: z.union([z.literal(1), z.literal(2)]),
            width: z.number().int().positive(),
            height: z.number().int().positive(),
            fps: z.number().int().positive(),
            frameCount: z.number().int().positive(),
            decodedToEof: z.literal(true),
          })
          .strict()
          .readonly(),
      })
      .strict()
      .readonly(),
    assessment: z
      .object({
        motion: z.literal("not-assessed"),
        continuity: z.literal("not-assessed"),
        listening: z.literal("not-assessed"),
      })
      .strict()
      .readonly(),
  })
  .strict()
  .readonly();

export type PreviewReceipt = z.infer<typeof PreviewReceiptSchema>;

export const createPreviewBuildId = (input: {
  readonly storyId: string;
  readonly revisionId: string;
  readonly sourceFingerprint: string;
  readonly profile: PreviewProfile;
}) =>
  `preview-${createFingerprint({
    namespace: "project-preview-build",
    version: 1,
    value: { previewVersion: PREVIEW_VERSION, ...input },
  }).slice("sha256:".length)}`;

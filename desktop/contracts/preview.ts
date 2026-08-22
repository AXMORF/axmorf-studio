import { z } from "zod";

import {
  DeliveryBuildIdSchema,
  CompositionIdSchema,
  MeaningIdSchema,
  ProductionRevisionIdSchema,
  Sha256DigestSchema,
  StoryIdSchema,
  TtsChunkIdSchema,
} from "../../src/contracts";

export const DESKTOP_PREVIEW_CATALOG_VERSION =
  "desktop-preview-catalog-v1" as const;
export const DESKTOP_PREVIEW_PLAYER_VERSION =
  "desktop-preview-player-v1" as const;
export const DESKTOP_MEDIA_SCHEME = "axmorf-media" as const;

const FrameSchema = z.number().int().nonnegative().safe();
const PositiveFrameSchema = z.number().int().positive().safe();

const PreviewSceneSchema = z
  .strictObject({
    kind: z.enum(["narrated-scene", "silent-scene"]),
    meaningId: MeaningIdSchema,
    label: z.string().trim().min(1).max(96),
    startFrame: FrameSchema,
    endFrame: PositiveFrameSchema,
  })
  .refine(({ startFrame, endFrame }) => endFrame > startFrame, {
    message: "Preview Scene must cover at least one frame.",
  });

const PreviewChunkSchema = z
  .strictObject({
    kind: z.literal("chunk"),
    chunkId: TtsChunkIdSchema,
    meaningId: MeaningIdSchema,
    text: z.string().trim().min(1),
    startFrame: FrameSchema,
    endFrame: PositiveFrameSchema,
  })
  .refine(({ startFrame, endFrame }) => endFrame > startFrame, {
    message: "Preview narration chunk must cover at least one frame.",
  });

const PreviewPauseSchema = z
  .strictObject({
    kind: z.literal("pause"),
    afterChunkId: TtsChunkIdSchema,
    meaningId: MeaningIdSchema,
    pauseMs: z.number().int().nonnegative().safe(),
    startFrame: FrameSchema,
    endFrame: FrameSchema,
  })
  .refine(({ startFrame, endFrame }) => endFrame >= startFrame, {
    message: "Preview pause must not run backward.",
  });

const PreviewCaptionSchema = z
  .strictObject({
    chunkId: TtsChunkIdSchema,
    meaningId: MeaningIdSchema,
    text: z.string().trim().min(1),
    startFrame: FrameSchema,
    endFrame: PositiveFrameSchema,
  })
  .refine(({ startFrame, endFrame }) => endFrame > startFrame, {
    message: "Preview caption must cover at least one frame.",
  });

export const PreviewTimelineSchema = z
  .strictObject({
    durationInFrames: PositiveFrameSchema,
    leadInFrames: FrameSchema,
    tailFrames: FrameSchema,
    narrationStartFrame: FrameSchema,
    scenes: z.array(PreviewSceneSchema).min(1).readonly(),
    narration: z
      .array(
        z.discriminatedUnion("kind", [PreviewChunkSchema, PreviewPauseSchema]),
      )
      .min(1)
      .readonly(),
    captions: z.array(PreviewCaptionSchema).min(1).readonly(),
  })
  .superRefine((timeline, context) => {
    if (
      timeline.scenes[0]?.startFrame !== timeline.leadInFrames ||
      (timeline.scenes.at(-1)?.endFrame ?? -1) + timeline.tailFrames !==
        timeline.durationInFrames
    ) {
      context.addIssue({
        code: "custom",
        message: "Preview Scene bounds must cover the canonical timeline.",
        path: ["scenes"],
      });
    }
    timeline.scenes.forEach((scene, index) => {
      if (
        scene.endFrame > timeline.durationInFrames ||
        (index > 0 && timeline.scenes[index - 1]?.endFrame !== scene.startFrame)
      ) {
        context.addIssue({
          code: "custom",
          message: "Preview Scenes must be contiguous and contained.",
          path: ["scenes", index],
        });
      }
    });
    if (
      new Set(timeline.scenes.map(({ meaningId }) => meaningId)).size !==
      timeline.scenes.length
    ) {
      context.addIssue({
        code: "custom",
        message: "Preview Scene meaning IDs must be unique.",
        path: ["scenes"],
      });
    }
    for (const [key, ranges] of [
      ["narration", timeline.narration],
      ["captions", timeline.captions],
    ] as const) {
      ranges.forEach((range, index) => {
        if (range.endFrame > timeline.durationInFrames) {
          context.addIssue({
            code: "custom",
            message: "Preview range must be contained in the timeline.",
            path: [key, index],
          });
        }
      });
    }
    if (timeline.narration[0]?.startFrame !== timeline.narrationStartFrame) {
      context.addIssue({
        code: "custom",
        message: "Preview narration must start at the canonical frame.",
        path: ["narration", 0],
      });
    }
    timeline.narration.forEach((segment, index) => {
      const owner = timeline.scenes.find(
        ({ meaningId }) => meaningId === segment.meaningId,
      );
      if (
        owner === undefined ||
        segment.startFrame < owner.startFrame ||
        segment.endFrame > owner.endFrame ||
        (index > 0 &&
          timeline.narration[index - 1]?.endFrame !== segment.startFrame)
      ) {
        context.addIssue({
          code: "custom",
          message: "Preview narration must be contiguous within its Scene.",
          path: ["narration", index],
        });
      }
    });
    const chunks = timeline.narration.filter(
      (segment): segment is z.infer<typeof PreviewChunkSchema> =>
        segment.kind === "chunk",
    );
    if (
      chunks.length !== timeline.captions.length ||
      chunks.some((chunk, index) => {
        const caption = timeline.captions[index];
        return (
          caption === undefined ||
          caption.chunkId !== chunk.chunkId ||
          caption.meaningId !== chunk.meaningId ||
          caption.text !== chunk.text ||
          caption.startFrame !== chunk.startFrame ||
          caption.endFrame !== chunk.endFrame
        );
      })
    ) {
      context.addIssue({
        code: "custom",
        message: "Preview captions must be one-to-one with narration chunks.",
        path: ["captions"],
      });
    }
  })
  .readonly();

export const PreviewCatalogEntrySchema = z
  .strictObject({
    storyId: StoryIdSchema,
    revisionId: ProductionRevisionIdSchema,
    deliveryBuildId: DeliveryBuildIdSchema,
    compositionId: CompositionIdSchema,
    title: z.string().trim().min(1).max(256),
    width: z.number().int().positive().safe(),
    height: z.number().int().positive().safe(),
    fps: z.number().int().positive().max(120).safe(),
    frameCount: PositiveFrameSchema,
    video: z
      .strictObject({
        checksum: Sha256DigestSchema,
        sizeBytes: z.number().int().positive().safe(),
      })
      .readonly(),
    timeline: PreviewTimelineSchema,
  })
  .superRefine((entry, context) => {
    if (entry.timeline.durationInFrames !== entry.frameCount) {
      context.addIssue({
        code: "custom",
        message: "Preview timeline must match the delivered frame count.",
        path: ["timeline", "durationInFrames"],
      });
    }
  })
  .readonly();

const PreviewVideoUrlSchema = z
  .string()
  .regex(
    /^axmorf-media:\/\/delivery\/[a-z0-9]+(?:-[a-z0-9]+)*\/delivery-[0-9a-f]{64}\/video\.mp4$/u,
  );

export const PreviewPlayerEntrySchema = z
  .strictObject({
    storyId: StoryIdSchema,
    revisionId: ProductionRevisionIdSchema,
    deliveryBuildId: DeliveryBuildIdSchema,
    compositionId: CompositionIdSchema,
    title: z.string().trim().min(1).max(256),
    width: z.number().int().positive().safe(),
    height: z.number().int().positive().safe(),
    fps: z.number().int().positive().max(120).safe(),
    frameCount: PositiveFrameSchema,
    videoUrl: PreviewVideoUrlSchema,
    timeline: PreviewTimelineSchema,
  })
  .superRefine((entry, context) => {
    if (entry.timeline.durationInFrames !== entry.frameCount) {
      context.addIssue({
        code: "custom",
        message: "Preview timeline must match the delivered frame count.",
        path: ["timeline", "durationInFrames"],
      });
    }
  })
  .readonly();

export const PreviewUnavailableEntrySchema = z
  .strictObject({
    storyId: StoryIdSchema,
    code: z.enum([
      "source-not-ready",
      "delivery-missing",
      "delivery-stale",
      "delivery-invalid",
      "timing-invalid",
    ]),
  })
  .readonly();

export const PreviewCatalogSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    contractVersion: z.literal(DESKTOP_PREVIEW_CATALOG_VERSION),
    entries: z.array(PreviewCatalogEntrySchema).readonly(),
    unavailable: z.array(PreviewUnavailableEntrySchema).readonly(),
  })
  .superRefine((catalog, context) => {
    const identities = [
      ...catalog.entries.map(({ storyId }) => storyId),
      ...catalog.unavailable.map(({ storyId }) => storyId),
    ];
    if (new Set(identities).size !== identities.length) {
      context.addIssue({
        code: "custom",
        message: "Preview Catalog Project identities must be unique.",
      });
    }
    for (const key of ["entries", "unavailable"] as const) {
      if (
        catalog[key].some(
          (entry, index) =>
            index > 0 && catalog[key][index - 1]!.storyId >= entry.storyId,
        )
      ) {
        context.addIssue({
          code: "custom",
          message: "Preview Catalog entries must be sorted by storyId.",
          path: [key],
        });
      }
    }
  })
  .readonly();

export const PreviewCatalogReadinessSchema = z
  .strictObject({
    state: z.enum(["not-loaded", "ready", "failed"]),
    entryCount: z.number().int().nonnegative().safe(),
    unavailableCount: z.number().int().nonnegative().safe(),
    failureCode: z.literal("preview-catalog-failed").nullable(),
  })
  .superRefine((readiness, context) => {
    const valid =
      readiness.state === "ready"
        ? readiness.failureCode === null
        : readiness.state === "failed"
          ? readiness.failureCode === "preview-catalog-failed" &&
            readiness.entryCount === 0 &&
            readiness.unavailableCount === 0
          : readiness.failureCode === null &&
            readiness.entryCount === 0 &&
            readiness.unavailableCount === 0;
    if (!valid) {
      context.addIssue({
        code: "custom",
        message: "Preview Catalog readiness state is inconsistent.",
      });
    }
  })
  .readonly();

export const PreviewPlayerCatalogSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    contractVersion: z.literal(DESKTOP_PREVIEW_PLAYER_VERSION),
    entries: z.array(PreviewPlayerEntrySchema).readonly(),
    unavailable: z.array(PreviewUnavailableEntrySchema).readonly(),
  })
  .superRefine((catalog, context) => {
    const identities = [
      ...catalog.entries.map(({ storyId }) => storyId),
      ...catalog.unavailable.map(({ storyId }) => storyId),
    ];
    if (new Set(identities).size !== identities.length) {
      context.addIssue({
        code: "custom",
        message: "Preview Player Project identities must be unique.",
      });
    }
    for (const key of ["entries", "unavailable"] as const) {
      if (
        catalog[key].some(
          (entry, index) =>
            index > 0 && catalog[key][index - 1]!.storyId >= entry.storyId,
        )
      ) {
        context.addIssue({
          code: "custom",
          message: "Preview Player entries must be sorted by storyId.",
          path: [key],
        });
      }
    }
  })
  .readonly();

export type PreviewCatalog = z.infer<typeof PreviewCatalogSchema>;
export type PreviewCatalogEntry = z.infer<typeof PreviewCatalogEntrySchema>;
export type PreviewCatalogReadiness = z.infer<
  typeof PreviewCatalogReadinessSchema
>;
export type PreviewPlayerCatalog = z.infer<typeof PreviewPlayerCatalogSchema>;
export type PreviewPlayerEntry = z.infer<typeof PreviewPlayerEntrySchema>;

export const buildPreviewVideoUrl = ({
  storyId,
  deliveryBuildId,
}: Pick<PreviewCatalogEntry, "storyId" | "deliveryBuildId">) =>
  `${DESKTOP_MEDIA_SCHEME}://delivery/${encodeURIComponent(storyId)}/${encodeURIComponent(deliveryBuildId)}/video.mp4`;

export const projectPreviewCatalogForPlayer = (
  catalog: PreviewCatalog,
): PreviewPlayerCatalog =>
  PreviewPlayerCatalogSchema.parse({
    schemaVersion: 1,
    contractVersion: DESKTOP_PREVIEW_PLAYER_VERSION,
    entries: catalog.entries.map((catalogEntry) => {
      const { video, ...entry } = catalogEntry;
      void video;
      return { ...entry, videoUrl: buildPreviewVideoUrl(entry) };
    }),
    unavailable: catalog.unavailable,
  });

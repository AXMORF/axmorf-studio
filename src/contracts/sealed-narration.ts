import { z } from "zod";

import { createFingerprint, serializeCanonicalJson } from "./fingerprint";
import { NarrationSpecSchema } from "./narration";
import {
  MeaningIdSchema,
  NonNegativeIntegerSchema,
  PositiveIntegerSchema,
  PublicProjectPathSchema,
  Sha256DigestSchema,
  StoryIdSchema,
  TtsChunkIdSchema,
} from "./primitives";

export const PcmFormatSchema = z
  .object({
    sampleRate: PositiveIntegerSchema,
    channelLayout: z.enum(["mono", "stereo"]),
    sampleFormat: z.literal("s16le"),
  })
  .strict()
  .readonly();

const ChunkSegmentSchema = z
  .object({
    kind: z.literal("chunk"),
    chunkId: TtsChunkIdSchema,
    meaningId: MeaningIdSchema,
    ttsText: z.string().trim().min(1),
    localPath: PublicProjectPathSchema,
    checksum: Sha256DigestSchema,
    pcm: PcmFormatSchema,
    sampleFrameCount: PositiveIntegerSchema,
  })
  .strict()
  .readonly();

const PauseSegmentSchema = z
  .object({
    kind: z.literal("pause"),
    afterChunkId: TtsChunkIdSchema,
    meaningId: MeaningIdSchema,
    pauseMs: NonNegativeIntegerSchema,
    sampleFrameCount: NonNegativeIntegerSchema,
  })
  .strict()
  .readonly();

export const SealedNarrationSegmentSchema = z.discriminatedUnion("kind", [
  ChunkSegmentSchema,
  PauseSegmentSchema,
]);

const CompleteAudioSchema = z
  .object({
    localPath: PublicProjectPathSchema,
    checksum: Sha256DigestSchema,
    pcm: PcmFormatSchema,
    sampleFrameCount: PositiveIntegerSchema,
  })
  .strict()
  .readonly();

const SealedNarrationFingerprintInputObjectSchema = z
  .object({
    schemaVersion: z.literal(1),
    storyId: StoryIdSchema,
    narrationSpec: NarrationSpecSchema,
    generationInputFingerprint: Sha256DigestSchema,
    normalizationAlgorithmId: z.literal("pcm-s16le-normalize-v1"),
    assemblyAlgorithmId: z.literal("ordered-pcm-concat-v1"),
    canonicalPcm: PcmFormatSchema,
    segments: z.array(SealedNarrationSegmentSchema).min(1).readonly(),
    completeAudio: CompleteAudioSchema,
  })
  .strict();

export const SealedNarrationFingerprintInputSchema =
  SealedNarrationFingerprintInputObjectSchema.readonly();

const SealedNarrationManifestBaseSchema =
  SealedNarrationFingerprintInputObjectSchema.extend({
    sealedNarrationFingerprint: Sha256DigestSchema,
  }).strict();

export type SealedNarrationFingerprintInput = z.infer<
  typeof SealedNarrationFingerprintInputSchema
>;

export const computeSealedNarrationFingerprint = (input: unknown) => {
  const data = SealedNarrationFingerprintInputSchema.parse(input);
  return createFingerprint({
    namespace: "sealed-narration",
    version: 1,
    value: {
      generationInputFingerprint: data.generationInputFingerprint,
      normalizationAlgorithmId: data.normalizationAlgorithmId,
      assemblyAlgorithmId: data.assemblyAlgorithmId,
      canonicalPcm: data.canonicalPcm,
      segments: data.segments.map((segment) =>
        segment.kind === "chunk"
          ? {
              kind: segment.kind,
              chunkId: segment.chunkId,
              meaningId: segment.meaningId,
              checksum: segment.checksum,
              sampleFrameCount: segment.sampleFrameCount,
            }
          : segment,
      ),
      completeAudio: {
        checksum: data.completeAudio.checksum,
        sampleFrameCount: data.completeAudio.sampleFrameCount,
      },
    },
  });
};

export const SealedNarrationManifestSchema =
  SealedNarrationManifestBaseSchema.superRefine((manifest, context) => {
    let previousChunk:
      | { readonly chunkId: string; readonly meaningId: string }
      | undefined;
    const chunkIds = new Set<string>();
    let totalSampleFrames = 0n;
    const projectPathPrefix = `public/projects/${manifest.storyId}/`;

    manifest.segments.forEach((segment, index) => {
      totalSampleFrames += BigInt(segment.sampleFrameCount);
      if (segment.kind === "chunk") {
        if (!segment.localPath.startsWith(projectPathPrefix)) {
          context.addIssue({
            code: "custom",
            message: "Chunk path must stay inside the owning Story directory.",
            path: ["segments", index, "localPath"],
          });
        }
        if (chunkIds.has(segment.chunkId)) {
          context.addIssue({
            code: "custom",
            message: "Sealed chunkId must be unique.",
            path: ["segments", index, "chunkId"],
          });
        }
        chunkIds.add(segment.chunkId);
        previousChunk = {
          chunkId: segment.chunkId,
          meaningId: segment.meaningId,
        };
        if (
          serializeCanonicalJson(segment.pcm) !==
          serializeCanonicalJson(manifest.canonicalPcm)
        ) {
          context.addIssue({
            code: "custom",
            message: "Every chunk must use canonical PCM.",
            path: ["segments", index, "pcm"],
          });
        }
      } else {
        if (
          (segment.pauseMs === 0 && segment.sampleFrameCount !== 0) ||
          (segment.pauseMs > 0 && segment.sampleFrameCount === 0)
        ) {
          context.addIssue({
            code: "custom",
            message:
              "Zero pause must have zero samples; positive pause must have samples.",
            path: ["segments", index, "sampleFrameCount"],
          });
        }
        if (
          segment.afterChunkId !== previousChunk?.chunkId ||
          segment.meaningId !== previousChunk.meaningId
        ) {
          context.addIssue({
            code: "custom",
            message:
              "Pause must immediately follow its owned chunk and meaningId.",
            path: ["segments", index, "afterChunkId"],
          });
        }
        previousChunk = undefined;
      }
    });

    if (chunkIds.size === 0) {
      context.addIssue({
        code: "custom",
        message: "At least one sealed chunk is required.",
      });
    }
    if (BigInt(manifest.completeAudio.sampleFrameCount) !== totalSampleFrames) {
      context.addIssue({
        code: "custom",
        message: "Complete audio sampleFrameCount must equal the segment sum.",
        path: ["completeAudio", "sampleFrameCount"],
      });
    }
    if (!manifest.completeAudio.localPath.startsWith(projectPathPrefix)) {
      context.addIssue({
        code: "custom",
        message:
          "Complete audio path must stay inside the owning Story directory.",
        path: ["completeAudio", "localPath"],
      });
    }
    if (
      serializeCanonicalJson(manifest.completeAudio.pcm) !==
      serializeCanonicalJson(manifest.canonicalPcm)
    ) {
      context.addIssue({
        code: "custom",
        message: "Complete audio must use canonical PCM.",
        path: ["completeAudio", "pcm"],
      });
    }

    const { sealedNarrationFingerprint, ...input } = manifest;
    if (
      computeSealedNarrationFingerprint(input) !== sealedNarrationFingerprint
    ) {
      context.addIssue({
        code: "custom",
        message: "sealedNarrationFingerprint is stale.",
        path: ["sealedNarrationFingerprint"],
      });
    }
  }).readonly();

export type PcmFormat = z.infer<typeof PcmFormatSchema>;
export type SealedNarrationManifest = z.infer<
  typeof SealedNarrationManifestSchema
>;

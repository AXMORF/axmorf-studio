import { z } from "zod";

import {
  MeaningIdSchema,
  PositiveIntegerSchema,
  Sha256DigestSchema,
  StoryIdSchema,
  TtsChunkIdSchema,
} from "../../../src/contracts/primitives";
import type { VoxcpmChunkRequest } from "./provider-input";

const NonEmptyTextSchema = z.string().refine((value) => value.trim().length > 0);
const CandidateRelativePathSchema = z
  .string()
  .regex(/^candidates\/[a-z0-9]+(?:-[a-z0-9]+)*\/[0-9a-f]{64}\/(?:raw|normalized)\.wav$/);

export const RawNarrationCandidateSchema = z
  .object({
    stage: z.literal("candidate"),
    chunkId: TtsChunkIdSchema,
    meaningId: MeaningIdSchema,
    ttsText: NonEmptyTextSchema,
    requestFingerprint: Sha256DigestSchema,
    candidateId: Sha256DigestSchema,
    rawChecksum: Sha256DigestSchema,
    rawRelativePath: CandidateRelativePathSchema,
  })
  .strict()
  .readonly();

export const CanonicalMeasuredChunkSchema = z
  .object({
    stage: z.literal("measured"),
    chunkId: TtsChunkIdSchema,
    meaningId: MeaningIdSchema,
    ttsText: NonEmptyTextSchema,
    requestFingerprint: Sha256DigestSchema,
    candidateId: Sha256DigestSchema,
    rawChecksum: Sha256DigestSchema,
    normalizedChecksum: Sha256DigestSchema,
    pcm: z
      .object({
        sampleRate: z.literal(48_000),
        channelLayout: z.literal("mono"),
        sampleFormat: z.literal("s16le"),
      })
      .strict()
      .readonly(),
    sampleFrameCount: PositiveIntegerSchema,
    rawRelativePath: CandidateRelativePathSchema,
    normalizedRelativePath: CandidateRelativePathSchema,
  })
  .strict()
  .readonly();

export const NarrationGenerationProgressSchema = z
  .object({
    schemaVersion: z.literal(1),
    storyId: StoryIdSchema,
    generationInputFingerprint: Sha256DigestSchema,
    providerAttemptFingerprint: Sha256DigestSchema,
    chunks: z
      .array(
        z.discriminatedUnion("stage", [
          RawNarrationCandidateSchema,
          CanonicalMeasuredChunkSchema,
        ]),
      )
      .readonly(),
  })
  .strict()
  .superRefine((progress, context) => {
    const chunkIds = new Set<string>();
    progress.chunks.forEach((chunk, index) => {
      if (chunkIds.has(chunk.chunkId)) {
        context.addIssue({
          code: "custom",
          message: "Narration progress chunkId entries must be unique.",
          path: ["chunks", index, "chunkId"],
        });
      }
      chunkIds.add(chunk.chunkId);
      if (chunk.candidateId !== chunk.rawChecksum) {
        context.addIssue({
          code: "custom",
          message: "candidateId must equal the raw content checksum.",
          path: ["chunks", index, "candidateId"],
        });
      }
    });
  })
  .readonly();

export type RawNarrationCandidate = z.infer<
  typeof RawNarrationCandidateSchema
>;
export type CanonicalMeasuredChunk = z.infer<
  typeof CanonicalMeasuredChunkSchema
>;
export type NarrationGenerationProgress = z.infer<
  typeof NarrationGenerationProgressSchema
>;

export type PcmNormalizer = (sourceBytes: Buffer) => Promise<Buffer>;

export type NarrationGenerationExpected = {
  readonly storyId: string;
  readonly generationInputFingerprint: string;
  readonly providerAttemptFingerprint: string;
  readonly chunks: readonly VoxcpmChunkRequest[];
};

export type ChunkGenerationAction =
  | { readonly kind: "reuse"; readonly measured: CanonicalMeasuredChunk }
  | { readonly kind: "normalize"; readonly candidate: RawNarrationCandidate }
  | { readonly kind: "generate"; readonly request: VoxcpmChunkRequest };

const assertProgressMatchesExpected = (
  expected: NarrationGenerationExpected,
  progress: NarrationGenerationProgress,
): void => {
  if (
    progress.storyId !== expected.storyId ||
    progress.generationInputFingerprint !==
      expected.generationInputFingerprint ||
    progress.providerAttemptFingerprint !== expected.providerAttemptFingerprint
  ) {
    throw new Error("Narration progress fingerprints are stale.");
  }
  const expectedById = new Map(
    expected.chunks.map((chunk, index) => [chunk.chunkId, { chunk, index }]),
  );
  let previousIndex = -1;
  for (const progressChunk of progress.chunks) {
    const match = expectedById.get(progressChunk.chunkId);
    if (match === undefined) {
      throw new Error("Narration progress contains an extra authored chunk.");
    }
    if (match.index <= previousIndex) {
      throw new Error("Narration progress chunks are not in authored order.");
    }
    previousIndex = match.index;
    if (
      progressChunk.meaningId !== match.chunk.meaningId ||
      progressChunk.ttsText !== match.chunk.ttsText ||
      progressChunk.requestFingerprint !== match.chunk.requestFingerprint
    ) {
      throw new Error(
        `Narration progress request fingerprint or authored identity is stale for ${progressChunk.chunkId}.`,
      );
    }
  }
};

export const planChunkGeneration = ({
  expected,
  verifiedProgress,
}: {
  readonly expected: NarrationGenerationExpected;
  readonly verifiedProgress: NarrationGenerationProgress;
}): readonly ChunkGenerationAction[] => {
  assertProgressMatchesExpected(expected, verifiedProgress);
  const progressById = new Map<
    string,
    RawNarrationCandidate | CanonicalMeasuredChunk
  >(
    verifiedProgress.chunks.map((chunk) => [chunk.chunkId, chunk] as const),
  );
  return expected.chunks.map((request): ChunkGenerationAction => {
    const progressChunk = progressById.get(request.chunkId);
    if (progressChunk === undefined) return { kind: "generate", request };
    if (progressChunk.stage === "candidate") {
      return { kind: "normalize", candidate: progressChunk };
    }
    return { kind: "reuse", measured: progressChunk };
  });
};

export const createEmptyNarrationProgress = (
  expected: NarrationGenerationExpected,
): NarrationGenerationProgress =>
  NarrationGenerationProgressSchema.parse({
    schemaVersion: 1,
    storyId: expected.storyId,
    generationInputFingerprint: expected.generationInputFingerprint,
    providerAttemptFingerprint: expected.providerAttemptFingerprint,
    chunks: [],
  });

export const replaceProgressChunk = ({
  progress,
  expected,
  chunk,
}: {
  readonly progress: NarrationGenerationProgress;
  readonly expected: NarrationGenerationExpected;
  readonly chunk: RawNarrationCandidate | CanonicalMeasuredChunk;
}): NarrationGenerationProgress => {
  const chunksById = new Map<
    string,
    RawNarrationCandidate | CanonicalMeasuredChunk
  >(
    progress.chunks.map((current) => [current.chunkId, current] as const),
  );
  chunksById.set(chunk.chunkId, chunk);
  const next = NarrationGenerationProgressSchema.parse({
    ...progress,
    chunks: expected.chunks.flatMap((request) => {
      const current = chunksById.get(request.chunkId);
      return current === undefined ? [] : [current];
    }),
  });
  assertProgressMatchesExpected(expected, next);
  return next;
};

export type NarrationGenerationResult = {
  readonly storyId: string;
  readonly generationInputFingerprint: string;
  readonly providerAttemptFingerprint: string;
  readonly chunkCount: number;
  readonly measuredChunkCount: number;
  readonly generatedChunkCount: number;
  readonly normalizedChunkCount: number;
  readonly reusedChunkCount: number;
};

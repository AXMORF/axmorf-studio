import { computeGenerationInputFingerprint } from "@axmorf/studio/contracts";
import type { NarrationSpec } from "@axmorf/studio/contracts";
import {
  flattenTtsChunks,
  type StorySpec,
} from "@axmorf/studio/contracts";
import {
  CanonicalMeasuredChunkSchema,
  RawNarrationCandidateSchema,
  planChunkGeneration,
  replaceProgressChunk,
  type NarrationGenerationExpected,
  type NarrationGenerationResult,
  type PcmNormalizer,
} from "./domain/candidate-progress";
import {
  computeChunkRequestFingerprint,
  type ChunkAudioRequest,
  type ChunkAudioGenerator,
} from "./domain/provider-input";
import {
  getCandidateRelativePaths,
  loadVerifiedProgress,
  readCandidateBytes,
  writeCandidateAndProgress,
  writeNarrationProgress,
} from "./adapters/candidate-workspace";
import { measureCanonicalPcmWav, sha256Bytes } from "./domain/pcm-wav";

const createExpectedGeneration = ({
  story,
  narration,
  providerAttemptFingerprint,
}: {
  readonly story: StorySpec;
  readonly narration: NarrationSpec;
  readonly providerAttemptFingerprint: string;
}): NarrationGenerationExpected => {
  const generationInputFingerprint = computeGenerationInputFingerprint(
    story,
    narration,
  );
  const chunks: ChunkAudioRequest[] = flattenTtsChunks(story).map((chunk) => {
    const envelope = {
      generationInputFingerprint,
      providerAttemptFingerprint,
      chunkId: chunk.chunkId,
      meaningId: chunk.meaningId,
      ttsText: chunk.ttsText,
    };
    return {
      ...envelope,
      requestFingerprint: computeChunkRequestFingerprint(envelope),
    };
  });
  return {
    storyId: story.storyId,
    generationInputFingerprint,
    providerAttemptFingerprint,
    chunks,
  };
};

export const runNarrationGeneration = async ({
  rootDir,
  story,
  narration,
  providerAttemptFingerprint,
  generateChunk,
  normalizePcm,
}: {
  readonly rootDir: string;
  readonly story: StorySpec;
  readonly narration: NarrationSpec;
  readonly providerAttemptFingerprint: string;
  readonly generateChunk: ChunkAudioGenerator;
  readonly normalizePcm: PcmNormalizer;
}): Promise<NarrationGenerationResult> => {
  const expected = createExpectedGeneration({
    story,
    narration,
    providerAttemptFingerprint,
  });
  let progress = await loadVerifiedProgress({
    rootDir,
    storyId: expected.storyId,
    generationInputFingerprint: expected.generationInputFingerprint,
    providerAttemptFingerprint,
    expected,
  });
  const actions = planChunkGeneration({
    expected,
    verifiedProgress: progress,
  });
  let generatedChunkCount = 0;
  let normalizedChunkCount = 0;
  let reusedChunkCount = 0;

  for (const action of actions) {
    if (action.kind === "reuse") {
      reusedChunkCount += 1;
      continue;
    }

    let candidate = action.kind === "normalize" ? action.candidate : undefined;
    if (action.kind === "generate") {
      const rawBytes = await generateChunk(action.request);
      if (rawBytes.length === 0) {
        throw new Error(
          `Provider returned an empty candidate for ${action.request.chunkId}.`,
        );
      }
      const rawChecksum = sha256Bytes(rawBytes);
      const relativePaths = getCandidateRelativePaths({
        chunkId: action.request.chunkId,
        candidateId: rawChecksum,
      });
      candidate = RawNarrationCandidateSchema.parse({
        stage: "candidate",
        chunkId: action.request.chunkId,
        meaningId: action.request.meaningId,
        ttsText: action.request.ttsText,
        requestFingerprint: action.request.requestFingerprint,
        candidateId: rawChecksum,
        rawChecksum,
        rawRelativePath: relativePaths.rawRelativePath,
      });
      progress = replaceProgressChunk({ progress, expected, chunk: candidate });
      await writeCandidateAndProgress({
        rootDir,
        progress,
        chunk: candidate,
        bytes: rawBytes,
      });
      generatedChunkCount += 1;
    }
    if (candidate === undefined) {
      throw new Error(
        "Narration generation action did not resolve a candidate.",
      );
    }

    const rawBytes = await readCandidateBytes({
      rootDir,
      progress,
      relativePath: candidate.rawRelativePath,
    });
    const normalizedBytes = await normalizePcm(rawBytes);
    const measurement = measureCanonicalPcmWav(normalizedBytes);
    if (measurement.sampleFrameCount <= 0) {
      throw new Error(
        `Normalized narration chunk ${candidate.chunkId} is empty.`,
      );
    }
    const relativePaths = getCandidateRelativePaths({
      chunkId: candidate.chunkId,
      candidateId: candidate.candidateId,
    });
    const measured = CanonicalMeasuredChunkSchema.parse({
      ...candidate,
      stage: "measured",
      normalizedChecksum: sha256Bytes(normalizedBytes),
      pcm: measurement.pcm,
      sampleFrameCount: measurement.sampleFrameCount,
      normalizedRelativePath: relativePaths.normalizedRelativePath,
    });
    progress = replaceProgressChunk({ progress, expected, chunk: measured });
    await writeCandidateAndProgress({
      rootDir,
      progress,
      chunk: measured,
      bytes: normalizedBytes,
    });
    normalizedChunkCount += 1;
  }

  await writeNarrationProgress({ rootDir, progress });

  const verified = await loadVerifiedProgress({
    rootDir,
    storyId: expected.storyId,
    generationInputFingerprint: expected.generationInputFingerprint,
    providerAttemptFingerprint,
    expected,
  });
  const measuredChunkCount = verified.chunks.filter(
    (chunk) => chunk.stage === "measured",
  ).length;
  return {
    storyId: expected.storyId,
    generationInputFingerprint: expected.generationInputFingerprint,
    providerAttemptFingerprint,
    chunkCount: expected.chunks.length,
    measuredChunkCount,
    generatedChunkCount,
    normalizedChunkCount,
    reusedChunkCount,
  };
};

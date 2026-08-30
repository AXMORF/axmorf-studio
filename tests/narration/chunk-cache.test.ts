import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runNarrationGeneration } from "../../scripts/narration/generate-runner";
import { loadVerifiedProgress } from "../../scripts/narration/adapters/candidate-workspace";
import { computeChunkRequestFingerprint } from "../../scripts/narration/domain/provider-input";
import { NarrationSpecSchema } from "@axmorf/studio/contracts";
import { StorySpecSchema } from "@axmorf/studio/contracts";
import { validNarrationSpec, validStorySpec } from "../fixtures/narrative";
import { createRawPcmFixture, createWavFixture } from "../fixtures/wav";

const providerAttemptFingerprint = `sha256:${"a".repeat(64)}` as const;

test("chunk request identity excludes the enclosing generation identity", () => {
  const authoredChunk = {
    providerAttemptFingerprint,
    chunkId: "opening-01",
    meaningId: "opening",
    ttsText: "A",
  } as const;
  const first = computeChunkRequestFingerprint({
    ...authoredChunk,
    generationInputFingerprint: `sha256:${"1".repeat(64)}`,
  });
  const second = computeChunkRequestFingerprint({
    ...authoredChunk,
    generationInputFingerprint: `sha256:${"2".repeat(64)}`,
  });

  assert.equal(first, second);
  assert.notEqual(
    first,
    computeChunkRequestFingerprint({
      ...authoredChunk,
      generationInputFingerprint: `sha256:${"2".repeat(64)}`,
      ttsText: "A revised",
    }),
  );
});

test("changing one authored TTS chunk reuses verified bytes for every unchanged chunk", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "narration-chunk-cache-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));

  const narration = NarrationSpecSchema.parse(validNarrationSpec);
  const originalStory = StorySpecSchema.parse(validStorySpec);
  const revisedStory = StorySpecSchema.parse({
    ...validStorySpec,
    beats: validStorySpec.beats.map((beat) =>
      beat.meaningId === "conclusion"
        ? {
            ...beat,
            ttsChunks: [{ chunkId: "conclusion-01", ttsText: "B revised" }],
          }
        : beat,
    ),
  });
  const providerCalls: string[] = [];
  const normalizationCalls: string[] = [];
  const generateChunk = async (request: { readonly chunkId: string }) => {
    providerCalls.push(request.chunkId);
    return Buffer.from(`${request.chunkId}:${providerCalls.length}`, "utf8");
  };
  const normalizePcm = async (sourceBytes: Buffer) => {
    normalizationCalls.push(sourceBytes.toString("utf8"));
    return createWavFixture({
      rawPcm: createRawPcmFixture([
        sourceBytes[0] ?? 1,
        -(sourceBytes[0] ?? 1),
      ]),
    });
  };

  const first = await runNarrationGeneration({
    rootDir,
    story: originalStory,
    narration,
    providerAttemptFingerprint,
    generateChunk,
    normalizePcm,
  });
  assert.deepEqual(
    {
      generated: first.generatedChunkCount,
      normalized: first.normalizedChunkCount,
      reused: first.reusedChunkCount,
    },
    { generated: 2, normalized: 2, reused: 0 },
  );

  const reorderedStory = StorySpecSchema.parse({
    ...validStorySpec,
    beats: [...validStorySpec.beats].reverse(),
  });
  providerCalls.length = 0;
  normalizationCalls.length = 0;
  const reordered = await runNarrationGeneration({
    rootDir,
    story: reorderedStory,
    narration,
    providerAttemptFingerprint,
    generateChunk,
    normalizePcm,
  });
  assert.deepEqual(
    {
      generated: reordered.generatedChunkCount,
      normalized: reordered.normalizedChunkCount,
      reused: reordered.reusedChunkCount,
    },
    { generated: 0, normalized: 0, reused: 2 },
  );
  const persistedReordered = await loadVerifiedProgress({
    rootDir,
    storyId: reordered.storyId,
    generationInputFingerprint: reordered.generationInputFingerprint,
    providerAttemptFingerprint,
  });
  assert.equal(persistedReordered.chunks.length, 2);
  assert.equal(
    persistedReordered.chunks.every((chunk) => chunk.stage === "measured"),
    true,
  );

  providerCalls.length = 0;
  normalizationCalls.length = 0;
  const second = await runNarrationGeneration({
    rootDir,
    story: revisedStory,
    narration,
    providerAttemptFingerprint,
    generateChunk,
    normalizePcm,
  });

  assert.deepEqual(providerCalls, ["conclusion-01"]);
  assert.equal(normalizationCalls.length, 1);
  assert.deepEqual(
    {
      generated: second.generatedChunkCount,
      normalized: second.normalizedChunkCount,
      reused: second.reusedChunkCount,
    },
    { generated: 1, normalized: 1, reused: 1 },
  );
});

test("chunk reuse fails closed when cached normalized bytes drift", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "narration-chunk-drift-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const narration = NarrationSpecSchema.parse(validNarrationSpec);
  const story = StorySpecSchema.parse(validStorySpec);
  const generateChunk = async (request: { readonly chunkId: string }) =>
    Buffer.from(request.chunkId, "utf8");
  const normalizePcm = async () =>
    createWavFixture({ rawPcm: createRawPcmFixture([123, -123]) });

  await runNarrationGeneration({
    rootDir,
    story,
    narration,
    providerAttemptFingerprint,
    generateChunk,
    normalizePcm,
  });
  const cacheFiles = await readdir(rootDir, { recursive: true });
  const normalizedRelativePath = cacheFiles.find(
    (path) =>
      path.includes("chunk-cache-v1") && path.endsWith("normalized.wav"),
  );
  assert.ok(normalizedRelativePath);
  await writeFile(join(rootDir, normalizedRelativePath), Buffer.from("drift"));

  await assert.rejects(
    runNarrationGeneration({
      rootDir,
      story,
      narration,
      providerAttemptFingerprint,
      generateChunk,
      normalizePcm,
    }),
    /normalized checksum is stale/iu,
  );
});

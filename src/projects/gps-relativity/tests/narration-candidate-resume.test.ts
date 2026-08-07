import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";

import {
  getNarrationWorkPaths,
  loadVerifiedProgress,
} from "../../../../scripts/narration/adapters/candidate-workspace";
import {
  NarrationGenerationProgressSchema,
  type PcmNormalizer,
} from "../../../../scripts/narration/domain/candidate-progress";
import { runNarrationGeneration } from "../../../../scripts/narration/generate-runner";
import type { ChunkAudioGenerator } from "../../../../scripts/narration/domain/provider-input";
import {
  computeGenerationInputFingerprint,
  computeStoryFingerprint,
  flattenTtsChunks,
  NarrationSpecSchema,
  Sha256DigestSchema,
  STORY_CHECK_IDS,
  StorySpecSchema,
  type NarrationSpec,
  type StoryCheckReport,
  type StorySpec,
} from "../../../contracts";
import gpsNarrationJson from "../narration.json";
import gpsStoryJson from "../story.json";
import { encodeCanonicalPcmWav } from "../../../../scripts/narration/domain/pcm-wav";

const providerAttemptFingerprint = `sha256:${"9".repeat(64)}`;
const story = StorySpecSchema.parse(gpsStoryJson);
const narration = NarrationSpecSchema.parse(gpsNarrationJson);

const createStoryCheck = (
  currentStory: StorySpec,
  currentNarration: NarrationSpec,
): StoryCheckReport => ({
  schemaVersion: 1,
  storyId: currentStory.storyId,
  storyFingerprint: computeStoryFingerprint(currentStory),
  generationInputFingerprint: computeGenerationInputFingerprint(
    currentStory,
    currentNarration,
  ),
  voiceProfileId: currentNarration.voiceProfileId,
  decision: "proceed",
  checks: STORY_CHECK_IDS.map((checkId) => ({
    checkId,
    status: "pass" as const,
    note: `Checked ${checkId}.`,
  })),
});

const createNormalizer =
  (normalizedChunkIds: string[] = []): PcmNormalizer =>
  async (sourceBytes) => {
    normalizedChunkIds.push(sourceBytes.toString("utf8"));
    return encodeCanonicalPcmWav(
      Buffer.alloc(Math.max(2, sourceBytes.length * 2), 1),
    );
  };

const createGenerator =
  (
    requests: string[],
    transform: (chunkId: string) => Buffer = (chunkId) => Buffer.from(chunkId),
  ): ChunkAudioGenerator =>
  async (request) => {
    requests.push(request.chunkId);
    return transform(request.chunkId);
  };

const createWorkRoot = async (context: TestContext) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-candidates-test-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  return rootDir;
};

const runFixture = ({
  rootDir,
  currentStory = story,
  storyCheck = createStoryCheck(currentStory, narration),
  generateChunk,
  normalizePcm,
  attemptFingerprint = providerAttemptFingerprint,
}: {
  readonly rootDir: string;
  readonly currentStory?: StorySpec;
  readonly storyCheck?: StoryCheckReport;
  readonly generateChunk: ChunkAudioGenerator;
  readonly normalizePcm: PcmNormalizer;
  readonly attemptFingerprint?: string;
}) =>
  runNarrationGeneration({
    rootDir,
    story: currentStory,
    narration,
    storyCheck,
    providerAttemptFingerprint: attemptFingerprint,
    generateChunk,
    normalizePcm,
  });

test("ten authored chunks cause ten requests and no punctuation subrequests", async (context) => {
  const rootDir = await createWorkRoot(context);
  const providerRequests: string[] = [];
  const result = await runFixture({
    rootDir,
    generateChunk: createGenerator(providerRequests),
    normalizePcm: createNormalizer(),
  });

  assert.equal(providerRequests.length, 10);
  assert.deepEqual(
    providerRequests,
    flattenTtsChunks(story).map((chunk) => chunk.chunkId),
  );
  assert.equal(result.chunkCount, 10);
  assert.equal(result.measuredChunkCount, 10);
});

test("an interrupted run persists each completed chunk atomically", async (context) => {
  const rootDir = await createWorkRoot(context);
  let requestCount = 0;
  const generateChunk: ChunkAudioGenerator = async (request) => {
    requestCount += 1;
    if (requestCount === 4) throw new Error("fixture interruption");
    return Buffer.from(request.chunkId);
  };

  await assert.rejects(
    () =>
      runFixture({ rootDir, generateChunk, normalizePcm: createNormalizer() }),
    /fixture interruption/,
  );
  const progress = await loadVerifiedProgress({
    rootDir,
    storyId: story.storyId,
    generationInputFingerprint: computeGenerationInputFingerprint(
      story,
      narration,
    ),
    providerAttemptFingerprint,
  });
  assert.equal(progress.chunks.length, 3);
});

test("normalization failure preserves the verified raw candidate", async (context) => {
  const rootDir = await createWorkRoot(context);
  const fourChunkStory = StorySpecSchema.parse({
    ...story,
    beats: story.beats.slice(0, 2),
  });
  let normalizationCount = 0;
  await assert.rejects(() =>
    runFixture({
      rootDir,
      currentStory: fourChunkStory,
      generateChunk: createGenerator([]),
      normalizePcm: async (bytes) => {
        normalizationCount += 1;
        if (normalizationCount === 4)
          throw new Error("fixture normalization failure");
        return createNormalizer()(bytes);
      },
    }),
  );
  const generationInputFingerprint = computeGenerationInputFingerprint(
    fourChunkStory,
    narration,
  );
  const progress = await loadVerifiedProgress({
    rootDir,
    storyId: story.storyId,
    generationInputFingerprint,
    providerAttemptFingerprint,
  });
  assert.equal(progress.chunks.length, 4);
  assert.equal(progress.chunks[3]?.stage, "candidate");

  const resumeProviderRequests: string[] = [];
  const resumeNormalizedChunkIds: string[] = [];
  await runFixture({
    rootDir,
    currentStory: fourChunkStory,
    generateChunk: createGenerator(resumeProviderRequests),
    normalizePcm: createNormalizer(resumeNormalizedChunkIds),
  });
  assert.equal(resumeProviderRequests.length, 0);
  assert.deepEqual(resumeNormalizedChunkIds, ["two-relativistic-effects-02"]);
});

test("same generation and attempt fingerprints reuse verified measured chunks", async (context) => {
  const rootDir = await createWorkRoot(context);
  await runFixture({
    rootDir,
    generateChunk: createGenerator([]),
    normalizePcm: createNormalizer(),
  });
  const secondRunProviderRequests: string[] = [];
  const result = await runFixture({
    rootDir,
    generateChunk: createGenerator(secondRunProviderRequests),
    normalizePcm: createNormalizer(),
  });
  assert.equal(secondRunProviderRequests.length, 0);
  assert.equal(result.reusedChunkCount, 10);
});

test("missing normalized bytes re-normalize without a provider request", async (context) => {
  const rootDir = await createWorkRoot(context);
  await runFixture({
    rootDir,
    generateChunk: createGenerator([]),
    normalizePcm: createNormalizer(),
  });
  const progress = await loadVerifiedProgress({
    rootDir,
    storyId: story.storyId,
    generationInputFingerprint: computeGenerationInputFingerprint(
      story,
      narration,
    ),
    providerAttemptFingerprint,
  });
  const target = progress.chunks.find(
    (chunk) => chunk.chunkId === "net-drift-01",
  );
  assert.equal(target?.stage, "measured");
  if (target?.stage !== "measured") throw new Error("fixture must be measured");
  const paths = getNarrationWorkPaths({
    rootDir,
    storyId: story.storyId,
    generationInputFingerprint: progress.generationInputFingerprint,
    providerAttemptFingerprint,
  });
  await unlink(join(paths.attemptDirectory, target.normalizedRelativePath));

  const resumeProviderRequests: string[] = [];
  const resumeNormalizedChunkIds: string[] = [];
  await runFixture({
    rootDir,
    generateChunk: createGenerator(resumeProviderRequests),
    normalizePcm: createNormalizer(resumeNormalizedChunkIds),
  });
  assert.equal(resumeProviderRequests.length, 0);
  assert.deepEqual(resumeNormalizedChunkIds, ["net-drift-01"]);
});

test("missing or corrupt raw bytes regenerate only that candidate", async (context) => {
  const rootDir = await createWorkRoot(context);
  await runFixture({
    rootDir,
    generateChunk: createGenerator([]),
    normalizePcm: createNormalizer(),
  });
  const progress = await loadVerifiedProgress({
    rootDir,
    storyId: story.storyId,
    generationInputFingerprint: computeGenerationInputFingerprint(
      story,
      narration,
    ),
    providerAttemptFingerprint,
  });
  const target = progress.chunks.find(
    (chunk) => chunk.chunkId === "net-drift-01",
  );
  assert.ok(target);
  const paths = getNarrationWorkPaths({
    rootDir,
    storyId: story.storyId,
    generationInputFingerprint: progress.generationInputFingerprint,
    providerAttemptFingerprint,
  });
  await writeFile(
    join(paths.attemptDirectory, target.rawRelativePath),
    "corrupt",
  );

  const resumeProviderRequests: string[] = [];
  await runFixture({
    rootDir,
    generateChunk: createGenerator(resumeProviderRequests, (chunkId) =>
      Buffer.from(`${chunkId}-regenerated`),
    ),
    normalizePcm: createNormalizer(),
  });
  assert.deepEqual(resumeProviderRequests, ["net-drift-01"]);
});

test("changed generation input or provider attempt never mixes progress", async () => {
  const inputFingerprint = computeGenerationInputFingerprint(story, narration);
  const changedStory = StorySpecSchema.parse({
    ...story,
    beats: story.beats.map((beat, beatIndex) =>
      beatIndex === 0
        ? {
            ...beat,
            ttsChunks: beat.ttsChunks.map((chunk, chunkIndex) =>
              chunkIndex === 0
                ? { ...chunk, ttsText: `${chunk.ttsText} Changed.` }
                : chunk,
            ),
          }
        : beat,
    ),
  });
  assert.notEqual(
    getNarrationWorkPaths({
      rootDir: "/tmp/work",
      storyId: story.storyId,
      generationInputFingerprint: inputFingerprint,
      providerAttemptFingerprint,
    }).progressPath,
    getNarrationWorkPaths({
      rootDir: "/tmp/work",
      storyId: story.storyId,
      generationInputFingerprint: computeGenerationInputFingerprint(
        changedStory,
        narration,
      ),
      providerAttemptFingerprint,
    }).progressPath,
  );
  assert.notEqual(
    getNarrationWorkPaths({
      rootDir: "/tmp/work",
      storyId: story.storyId,
      generationInputFingerprint: inputFingerprint,
      providerAttemptFingerprint,
    }).progressPath,
    getNarrationWorkPaths({
      rootDir: "/tmp/work",
      storyId: story.storyId,
      generationInputFingerprint: inputFingerprint,
      providerAttemptFingerprint: `sha256:${"8".repeat(64)}`,
    }).progressPath,
  );
});

test("malformed stale or structurally unsafe progress fails closed", async (context) => {
  const rootDir = await createWorkRoot(context);
  const generationInputFingerprint = computeGenerationInputFingerprint(
    story,
    narration,
  );
  const paths = getNarrationWorkPaths({
    rootDir,
    storyId: story.storyId,
    generationInputFingerprint,
    providerAttemptFingerprint,
  });
  await runFixture({
    rootDir,
    generateChunk: createGenerator([]),
    normalizePcm: createNormalizer(),
  });
  const progress = NarrationGenerationProgressSchema.parse(
    JSON.parse(await readFile(paths.progressPath, "utf8")),
  );
  await writeFile(
    paths.progressPath,
    JSON.stringify({
      ...progress,
      chunks: [progress.chunks[1], progress.chunks[0]],
    }),
  );
  await assert.rejects(
    () =>
      runFixture({
        rootDir,
        generateChunk: createGenerator([]),
        normalizePcm: createNormalizer(),
      }),
    /authored order/i,
  );

  await assert.rejects(
    () =>
      runFixture({
        rootDir,
        storyCheck: {
          ...createStoryCheck(story, narration),
          storyFingerprint: Sha256DigestSchema.parse(
            `sha256:${"0".repeat(64)}`,
          ),
        },
        generateChunk: createGenerator([]),
        normalizePcm: createNormalizer(),
      }),
    /StoryCheck/i,
  );
});

import assert from "node:assert/strict";
import {
  access,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { type TestContext } from "node:test";

import {
  createNarrationSealFileOperations,
  withProjectSealLock,
  type NarrationSealFileOperations,
} from "../../scripts/narration/adapters/atomic-files";
import { checkM2NarrationArtifacts } from "../../scripts/narration/check";
import {
  CanonicalMeasuredChunkSchema,
  NarrationGenerationProgressSchema,
} from "../../scripts/narration/domain/candidate-progress";
import {
  encodeCanonicalPcmWav,
  sha256Bytes,
} from "../../scripts/narration/domain/pcm-wav";
import { computeChunkRequestFingerprint } from "../../scripts/narration/domain/provider-input";
import { buildNarrationSeal } from "../../scripts/narration/domain/seal";
import { runNarrationSeal } from "../../scripts/narration/seal-runner";
import {
  computeGenerationInputFingerprint,
  computeStoryFingerprint,
  flattenTtsChunks,
  parseNarrativeProjectSource,
  STORY_CHECK_IDS,
  type NarrativeProjectSource,
  type StoryCheckReport,
  StorySpecSchema,
} from "../../src/contracts";
import briefJson from "../../src/projects/gps-relativity/brief.json";
import narrationJson from "../../src/projects/gps-relativity/narration.json";
import renderJson from "../../src/projects/gps-relativity/render.json";
import storyJson from "../../src/projects/gps-relativity/story.json";

const providerAttemptFingerprint = `sha256:${"6".repeat(64)}`;
const baseProjectSource = parseNarrativeProjectSource({
  brief: briefJson,
  story: storyJson,
  narration: narrationJson,
  render: renderJson,
});

const createStoryCheck = (
  projectSource: NarrativeProjectSource,
): StoryCheckReport => ({
  schemaVersion: 1,
  storyId: projectSource.story.storyId,
  storyFingerprint: computeStoryFingerprint(projectSource.story),
  generationInputFingerprint: computeGenerationInputFingerprint(
    projectSource.story,
    projectSource.narration,
  ),
  voiceProfileId: projectSource.narration.voiceProfileId,
  decision: "proceed",
  checks: STORY_CHECK_IDS.map((checkId) => ({
    checkId,
    status: "pass" as const,
    note: `Checked ${checkId}.`,
  })),
});

const createMeasuredSelection = (projectSource: NarrativeProjectSource) => {
  const generationInputFingerprint = computeGenerationInputFingerprint(
    projectSource.story,
    projectSource.narration,
  );
  const normalizedChunks = new Map<string, Buffer>();
  const chunks = flattenTtsChunks(projectSource.story).map((chunk, index) => {
    const rawChecksum = sha256Bytes(Buffer.from(`raw-${chunk.chunkId}`));
    const candidateDigest = rawChecksum.slice("sha256:".length);
    const wav = encodeCanonicalPcmWav(
      Buffer.alloc((2_400 + index * 120) * 2, index + 1),
    );
    normalizedChunks.set(chunk.chunkId, wav);
    const envelope = {
      generationInputFingerprint,
      providerAttemptFingerprint,
      chunkId: chunk.chunkId,
      meaningId: chunk.meaningId,
      ttsText: chunk.ttsText,
    };
    return CanonicalMeasuredChunkSchema.parse({
      stage: "measured",
      chunkId: chunk.chunkId,
      meaningId: chunk.meaningId,
      ttsText: chunk.ttsText,
      requestFingerprint: computeChunkRequestFingerprint(envelope),
      candidateId: rawChecksum,
      rawChecksum,
      normalizedChecksum: sha256Bytes(wav),
      pcm: {
        sampleRate: 48_000,
        channelLayout: "mono",
        sampleFormat: "s16le",
      },
      sampleFrameCount: 2_400 + index * 120,
      rawRelativePath: `candidates/${chunk.chunkId}/${candidateDigest}/raw.wav`,
      normalizedRelativePath: `candidates/${chunk.chunkId}/${candidateDigest}/normalized.wav`,
    });
  });
  return {
    progress: NarrationGenerationProgressSchema.parse({
      schemaVersion: 1,
      storyId: projectSource.story.storyId,
      generationInputFingerprint,
      providerAttemptFingerprint,
      chunks,
    }),
    normalizedChunks,
  };
};

const createRoot = async (context: TestContext) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-atomic-seal-test-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  return rootDir;
};

const exists = async (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

const getPaths = (rootDir: string, projectSource = baseProjectSource) => {
  const projectDirectory = join(
    rootDir,
    "src/projects",
    projectSource.story.storyId,
  );
  return {
    activeManifestPath: join(
      projectDirectory,
      "generated/sealed-narration.generated.json",
    ),
    timingPath: join(
      projectDirectory,
      "generated/semantic-timing.generated.json",
    ),
    lockPath: join(projectDirectory, "generated/.narration-seal.lock"),
  };
};

const createInput = (
  rootDir: string,
  projectSource = baseProjectSource,
) => ({
  rootDir,
  projectSource,
  storyCheck: createStoryCheck(projectSource),
  ...createMeasuredSelection(projectSource),
});

const createFailingSealFileOperations = (
  rootDir: string,
  phase: "before-promote" | "before-receipt" | "before-timing",
): NarrationSealFileOperations => {
  const real = createNarrationSealFileOperations();
  const paths = getPaths(rootDir);
  return {
    commitImmutableDirectory: async (input) => {
      if (phase === "before-promote") throw new Error("before-promote");
      await real.commitImmutableDirectory(input);
    },
    writeJsonAtomic: async (input) => {
      if (
        phase === "before-receipt" &&
        input.destination === paths.activeManifestPath
      ) {
        throw new Error("before-receipt");
      }
      if (phase === "before-timing" && input.destination === paths.timingPath) {
        throw new Error("before-timing");
      }
      await real.writeJsonAtomic(input);
    },
  };
};

test("failure before public promotion leaves no receipt", async (context) => {
  const rootDir = await createRoot(context);
  const paths = getPaths(rootDir);
  await assert.rejects(() =>
    runNarrationSeal({
      ...createInput(rootDir),
      fileOperations: createFailingSealFileOperations(
        rootDir,
        "before-promote",
      ),
    }),
  );
  assert.equal(await exists(paths.activeManifestPath), false);
});

test("failure after immutable promotion but before receipt leaves only an orphan", async (context) => {
  const rootDir = await createRoot(context);
  const input = createInput(rootDir);
  const seal = buildNarrationSeal({
    story: input.projectSource.story,
    narration: input.projectSource.narration,
    progress: input.progress,
    normalizedChunks: input.normalizedChunks,
  });
  const immutableAudioDirectory = join(
    rootDir,
    dirname(seal.manifest.completeAudio.localPath),
  );
  await assert.rejects(() =>
    runNarrationSeal({
      ...input,
      fileOperations: createFailingSealFileOperations(
        rootDir,
        "before-receipt",
      ),
    }),
  );
  assert.equal(await exists(immutableAudioDirectory), true);
  assert.equal(await exists(getPaths(rootDir).activeManifestPath), false);
});

test("failure after receipt leaves a valid seal and recoverable stale timing", async (context) => {
  const rootDir = await createRoot(context);
  const input = createInput(rootDir);
  await assert.rejects(() =>
    runNarrationSeal({
      ...input,
      fileOperations: createFailingSealFileOperations(
        rootDir,
        "before-timing",
      ),
    }),
  );
  const manifest = JSON.parse(
    await readFile(getPaths(rootDir).activeManifestPath, "utf8"),
  ) as { sealedNarrationFingerprint: string };
  assert.match(manifest.sealedNarrationFingerprint, /^sha256:[a-f0-9]{64}$/);
  await assert.rejects(
    () => checkM2NarrationArtifacts(input),
    /semantic-timing|semantic timing/i,
  );
  await runNarrationSeal(input);
  await assert.doesNotReject(() => checkM2NarrationArtifacts(input));
});

test("different active seal requires exact compare-and-swap fingerprint", async (context) => {
  const rootDir = await createRoot(context);
  const originalInput = createInput(rootDir);
  const original = await runNarrationSeal(originalInput);
  const originalManifestBytes = await readFile(
    getPaths(rootDir).activeManifestPath,
  );
  const changedStory = StorySpecSchema.parse({
    ...baseProjectSource.story,
    beats: baseProjectSource.story.beats.map((beat) =>
      beat.meaningId === "two-relativistic-effects"
        ? {
            ...beat,
            explicitPauses: [
              {
                afterChunkId: "two-relativistic-effects-02",
                pauseMs: 350,
              },
            ],
          }
        : beat,
    ),
  });
  const changedProjectSource = parseNarrativeProjectSource({
    ...baseProjectSource,
    story: changedStory,
  });
  const changedInput = createInput(rootDir, changedProjectSource);

  await assert.rejects(() => runNarrationSeal(changedInput), /--supersede/i);
  await assert.rejects(
    () =>
      runNarrationSeal({
        ...changedInput,
        supersedeFingerprint: `sha256:${"0".repeat(64)}`,
      }),
    /current sealed fingerprint/i,
  );
  assert.deepEqual(
    await readFile(getPaths(rootDir).activeManifestPath),
    originalManifestBytes,
  );
  const changed = await runNarrationSeal({
    ...changedInput,
    supersedeFingerprint: original.sealedNarrationFingerprint,
  });
  assert.notEqual(
    changed.sealedNarrationFingerprint,
    original.sealedNarrationFingerprint,
  );
  const originalDirectory = join(
    rootDir,
    `public/projects/gps-relativity/narration/${original.sealedNarrationFingerprint.slice("sha256:".length)}`,
  );
  assert.equal(await exists(originalDirectory), true);
});

test("same sealed fingerprint keeps the receipt and repairs timing when needed", async (context) => {
  const rootDir = await createRoot(context);
  const input = createInput(rootDir);
  await runNarrationSeal(input);
  const manifestPath = getPaths(rootDir).activeManifestPath;
  const before = await stat(manifestPath);
  await runNarrationSeal(input);
  const after = await stat(manifestPath);
  assert.equal(after.mtimeMs, before.mtimeMs);
});

test("read-only check detects changed chunk complete WAV and timing", async (context) => {
  for (const target of ["chunk", "complete", "timing"] as const) {
    const rootDir = await createRoot(context);
    const input = createInput(rootDir);
    await runNarrationSeal(input);
    const manifest = JSON.parse(
      await readFile(getPaths(rootDir).activeManifestPath, "utf8"),
    ) as {
      segments: { kind: string; localPath?: string }[];
      completeAudio: { localPath: string };
    };
    if (target === "chunk") {
      const path = manifest.segments.find(
        (segment) => segment.kind === "chunk",
      )?.localPath;
      assert.ok(path);
      await writeFile(join(rootDir, path), "corrupt chunk");
    } else if (target === "complete") {
      await writeFile(
        join(rootDir, manifest.completeAudio.localPath),
        "corrupt complete",
      );
    } else {
      const timingPath = getPaths(rootDir).timingPath;
      const timing = JSON.parse(await readFile(timingPath, "utf8")) as {
        durationInFrames: number;
      };
      await writeFile(
        timingPath,
        JSON.stringify({
          ...timing,
          durationInFrames: timing.durationInFrames + 1,
        }),
      );
    }
    await assert.rejects(() => checkM2NarrationArtifacts(input));
  }
});

test("exclusive locks incomplete progress and cumulative timing fail closed", async (context) => {
  const rootDir = await createRoot(context);
  const lockPath = getPaths(rootDir).lockPath;
  await withProjectSealLock({ lockPath, operation: "outer" }, async () => {
    await assert.rejects(
      () =>
        withProjectSealLock({ lockPath, operation: "inner" }, async () => {
          throw new Error("must not run");
        }),
      /lock.*remove only/i,
    );
  });

  const input = createInput(rootDir);
  await assert.rejects(() =>
    runNarrationSeal({
      ...input,
      progress: NarrationGenerationProgressSchema.parse({
        ...input.progress,
        chunks: input.progress.chunks.slice(0, -1),
      }),
    }),
  );
  assert.equal(await exists(getPaths(rootDir).activeManifestPath), false);

  const result = await runNarrationSeal(input);
  assert.equal(result.chunkCount, 10);
  assert.equal(result.captionCueCount, 10);
});

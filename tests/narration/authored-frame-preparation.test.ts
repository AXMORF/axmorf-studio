import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createFingerprint } from "../../packages/studio/src/contracts/fingerprint";
import { ProductionRevisionIdSchema } from "../../packages/studio/src/contracts/production-revision";
import { parseNarrativeProjectSource } from "../../packages/studio/src/contracts/project";
import { buildSilentScenePreset } from "../../packages/studio/src/contracts/story";
import { checkM2NarrationArtifacts } from "../../scripts/narration/check";
import { runCli } from "../../scripts/narration/cli";
import { runNarrationGeneration } from "../../scripts/narration/generate-runner";
import { runNarrationSeal } from "../../scripts/narration/seal-runner";
import {
  buildAuthoredSemanticTimingTask,
  buildNarrationTasks,
} from "../../scripts/project-production/application/build-current-plan";
import {
  prepareNarrationInputs,
  ensureFixedTaskArtifact,
} from "../../scripts/project-production/application/prepare-fixed-tasks";
import { inspectNarrationCache } from "../../scripts/project-production/adapters/production-inspection";
import { createTaskWorkspace } from "../../scripts/project-production/adapters/task-workspace";
import { checkTaskByKind } from "../../scripts/project-production/application/check-task";
import { inspectProjectProduction } from "../../scripts/project-production/application/inspect-production";
import { validProjectSource } from "../fixtures/narrative";

const source = parseNarrativeProjectSource({
  ...validProjectSource,
  story: {
    schemaVersion: 3,
    storyId: validProjectSource.story.storyId,
    title: "A silent continuous film",
    timingSource: "authored-frames",
    beats: ["begin", "transform", "settle"].map((meaningId, index) => ({
      kind: "silent-scene",
      meaningId,
      narrativePurpose: `Express ${meaningId} visually.`,
      preset: buildSilentScenePreset({
        presetId: meaningId,
        durationInFrames: 24 + index * 6,
        visualIntent: "Move the same object through a continuous world.",
        soundIntent: "No narration.",
        resourceIds: [],
        implementation: { kind: "scene-owner" },
      }),
    })),
  },
});
const revisionId = ProductionRevisionIdSchema.parse(
  `revision-${"1".repeat(64)}`,
);
const environment = {
  RSP_PRODUCER_CONFIG:
    "/missing/authored-frames-must-not-load-provider-config.json",
};

const writeSource = async (rootDir: string) => {
  const directory = join(rootDir, "src/projects", source.story.storyId);
  await mkdir(directory, { recursive: true });
  for (const name of ["brief", "story", "narration", "render"] as const) {
    await writeFile(
      join(directory, `${name}.json`),
      `${JSON.stringify(source[name])}\n`,
    );
  }
};

test("authored preparation and cache inspection use zero provider configuration and create only timing JSON", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "axmorf-authored-frames-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  await writeSource(rootDir);
  assert.deepEqual(
    await inspectNarrationCache({
      rootDir,
      projectId: source.story.storyId,
      env: environment,
    }),
    {
      timingSource: "authored-frames",
      providerRequests: 0,
      providerCacheHits: 0,
      narrationReady: true,
    },
  );
  const prepared = await prepareNarrationInputs({
    rootDir,
    projectId: source.story.storyId,
    env: environment,
  });
  assert.equal(prepared.timingSource, "authored-frames");
  assert.equal(prepared.providerAttemptFingerprint, null);
  assert.equal(prepared.sealedNarration, null);
  assert.equal(prepared.masteredNarration, null);
  assert.equal(prepared.completeAudioBytes, null);
  assert.equal(prepared.masteredAudioBytes, null);
  assert.equal(prepared.chunkAudioBytes.size, 0);
  assert.deepEqual(prepared.actualCost, {
    providerRequests: 0,
    providerCacheHits: 0,
  });
  assert.deepEqual(
    await readdir(
      join(rootDir, "src/projects", source.story.storyId, "generated"),
    ),
    ["semantic-timing.generated.json"],
  );
  for (const name of [".narration-work", "public"])
    await assert.rejects(stat(join(rootDir, name)), { code: "ENOENT" });
  const checked = await checkM2NarrationArtifacts({
    rootDir,
    projectSource: source,
  });
  assert.equal(checked.timingSource, "authored-frames");
  assert.equal(checked.sealedNarrationFingerprint, null);
  assert.equal(checked.completeAudioSampleFrameCount, null);
  assert.equal(checked.chunkCount, 0);
});

test("inspection exposes authored timing without introducing narrated preparation or changing legacy diagnostics", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "axmorf-authored-inspection-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  await writeSource(rootDir);
  for (const sourceState of ["configured-authoring", "timing-ready"] as const) {
    const inspection = await inspectProjectProduction(
      { rootDir, projectId: source.story.storyId, env: environment },
      {
        inspectReadiness: async () => ({
          sourceState,
          missingAuthoringInputs: [],
        }),
      },
    );
    assert.equal(inspection.timingSource, "authored-frames");
    assert.equal(
      inspection.nextAction,
      sourceState === "configured-authoring"
        ? "prepare-timing"
        : "complete-authoring",
    );
    assert.equal(inspection.estimatedCost.providerRequests, 0);
    assert.equal(inspection.estimatedCost.providerCacheHits, 0);
  }
  const legacy = await inspectProjectProduction(
    { rootDir, projectId: source.story.storyId },
    {
      inspectReadiness: async () => ({
        sourceState: "configured-authoring",
        missingAuthoringInputs: [],
      }),
      inspectNarrationCache: async () => ({
        providerRequests: 1,
        providerCacheHits: 0,
        narrationReady: false,
      }),
    },
  );
  assert.equal(Object.hasOwn(legacy, "timingSource"), false);
  assert.equal(legacy.nextAction, "prepare-narration");
  assert.equal(legacy.estimatedCost.providerRequests, 1);
  await assert.rejects(stat(join(rootDir, ".producer-operation.lock")), {
    code: "ENOENT",
  });
});

test("authored fixed timing is a reusable task with no narration or audio dependencies", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "axmorf-authored-fixed-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  await writeSource(rootDir);
  const prepared = await prepareNarrationInputs({
    rootDir,
    projectId: source.story.storyId,
    env: environment,
  });
  const inputs = {
    projectId: source.story.storyId,
    story: source.story,
    render: source.render,
    fingerprints: {
      story: createFingerprint({
        namespace: "revision-story",
        version: 1,
        value: source.story,
      }),
      render: createFingerprint({
        namespace: "revision-render",
        version: 1,
        value: source.render,
      }),
    },
  } as never;
  const built = buildAuthoredSemanticTimingTask({ inputs, revisionId });
  assert.equal(built.task.taskKind, "semantic-timing");
  assert.equal(
    built.task.validatorPolicyVersion,
    "authored-frame-timing-validator-v1",
  );
  assert.deepEqual(built.task.dependencyArtifacts, []);
  assert.deepEqual(built.task.declaredOutputSet, [
    "project/generated/semantic-timing.generated.json",
  ]);
  const files = {
    "inputs/context.json": built.contextBytes,
    "project/generated/semantic-timing.generated.json":
      prepared.semanticTimingBytes,
  };
  const attestation = await ensureFixedTaskArtifact({
    rootDir,
    task: built.task,
    files,
  });
  assert.deepEqual(
    attestation.outputManifest.map(({ logicalPath }) => logicalPath),
    built.task.declaredOutputSet,
  );
  const reused = await ensureFixedTaskArtifact({
    rootDir,
    task: built.task,
    files,
  });
  assert.equal(reused.artifactFingerprint, attestation.artifactFingerprint);
  const plan = await buildNarrationTasks({
    rootDir,
    inputs,
    revisionId,
    narration: {
      providerAttemptFingerprint: null,
      masteringPolicy: null,
      sealedNarration: null,
    },
  });
  assert.equal(plan.nodes.length, 1);
  assert.equal(plan.nodes[0].task.taskKind, "semantic-timing");
  assert.equal(
    plan.timingAttestation?.artifactFingerprint,
    attestation.artifactFingerprint,
  );

  const changedStory = { ...source.story, title: "Changed authored context" };
  const changed = buildAuthoredSemanticTimingTask({
    inputs: {
      projectId: source.story.storyId,
      story: changedStory,
      render: source.render,
      fingerprints: {
        story: createFingerprint({
          namespace: "revision-story",
          version: 1,
          value: changedStory,
        }),
        render: createFingerprint({
          namespace: "revision-render",
          version: 1,
          value: source.render,
        }),
      },
    } as never,
    revisionId,
  });
  const workspace = await createTaskWorkspace({
    rootDir,
    task: changed.task,
    seedFiles: { "inputs/context.json": changed.contextBytes },
  });
  const outputDirectory = join(workspace, "project/generated");
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    join(outputDirectory, "semantic-timing.generated.json"),
    prepared.semanticTimingBytes,
  );
  await assert.rejects(
    checkTaskByKind({ rootDir, taskRevision: changed.task.taskRevision }),
    /declared frame authority/u,
  );
});

test("narration commands and low-level seal/generation reject authored frames before provider or filesystem work", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "axmorf-authored-no-provider-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  await writeSource(rootDir);
  let providerCalls = 0;
  const cli = {
    rootDir,
    env: environment,
    stdout: () => undefined,
    stderr: () => undefined,
    createGenerationDependencies: async () => {
      providerCalls += 1;
      throw new Error("Provider must not be resolved.");
    },
  };
  await assert.rejects(
    runCli(["generate", "--project", source.story.storyId], cli),
    /do not use narration generation/u,
  );
  await assert.rejects(
    runCli(
      [
        "seal",
        "--project",
        source.story.storyId,
        "--attempt",
        `sha256:${"a".repeat(64)}`,
      ],
      cli,
    ),
    /no narration seal/u,
  );
  await assert.rejects(
    runNarrationGeneration({
      rootDir: join(rootDir, "work"),
      story: source.story,
      narration: source.narration,
      providerAttemptFingerprint: `sha256:${"a".repeat(64)}`,
      generateChunk: async () => {
        providerCalls += 1;
        throw new Error("No generation.");
      },
      normalizePcm: async () => {
        throw new Error("No normalization.");
      },
    }),
    /do not generate narration/u,
  );
  await assert.rejects(
    runNarrationSeal({
      rootDir,
      projectSource: source,
      progress: {} as never,
      normalizedChunks: new Map(),
    }),
    /no narration seal/u,
  );
  assert.equal(providerCalls, 0);
  await assert.rejects(stat(join(rootDir, "work")), { code: "ENOENT" });
});

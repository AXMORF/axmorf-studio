import assert from "node:assert/strict";
import {
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import {
  ProductionRevisionIdSchema,
  RenderSpecSchema,
  StorySpecSchema,
  computeNoNarrationFingerprint,
  createFingerprint,
  generateVisualSemanticTiming,
  serializeCanonicalJson,
} from "@axmorf/studio/contracts";
import {
  captureProductionInspectionSnapshot,
  inspectNarrationCache,
  inspectProductionSourceReadiness,
} from "../../scripts/project-production/adapters/production-inspection";
import {
  buildCurrentProductionPlan,
  buildVisualSemanticTimingTask,
} from "../../scripts/project-production/application/build-current-plan";
import { checkTaskByKind } from "../../scripts/project-production/application/check-task";
import { inspectProjectProduction } from "../../scripts/project-production/application/inspect-production";
import { loadProjectProductionInputs } from "../../scripts/project-production/application/load-inputs";
import { prepareProjectProduction } from "../../scripts/project-production/application/prepare-production";
import {
  createProject,
  projectPendingSceneAuthoring,
} from "../../scripts/projects/application/create-project";
import {
  ensureFixedTaskArtifact,
  prepareNarrationInputs,
} from "../../scripts/project-production/application/prepare-fixed-tasks";
import { createTemporaryDirectory } from "../package-boundary/support";
import { buildRuntimePolicyManifest } from "../../packages/studio/src/runtime/policy-manifest";
import { validRenderSpec, validVideoBrief } from "../fixtures/narrative";
import {
  prepareProjectCreateFixture,
  projectCreateRuntimeResources,
  validProjectCreateInput,
  writeProjectCreateJson,
} from "../fixtures/project-create";

const story = StorySpecSchema.parse({
  schemaVersion: 3,
  storyId: "story-example",
  title: validVideoBrief.title,
  beats: [
    {
      kind: "visual-scene",
      meaningId: "opening",
      narrativePurpose: "A query selects evidence from a document.",
      durationInFrames: 120,
    },
    {
      kind: "visual-scene",
      meaningId: "conclusion",
      narrativePurpose: "The answer carries the selected evidence forward.",
      durationInFrames: 180,
    },
  ],
});
const render = RenderSpecSchema.parse(validRenderSpec);
const canonical = (value: unknown) => `${serializeCanonicalJson(value)}\n`;

const writeVisualSource = async (rootDir: string) => {
  const projectRoot = join(rootDir, "src/projects", story.storyId);
  await mkdir(projectRoot, { recursive: true });
  for (const [file, value] of [
    ["brief.json", validVideoBrief],
    ["story.json", story],
    ["narration.json", null],
    ["render.json", render],
  ] as const) {
    await writeFile(join(projectRoot, file), canonical(value));
  }
  return projectRoot;
};

test("visual timing preparation never resolves TTS configuration or manufactures narration PCM", async (context) => {
  const rootDir = await createTemporaryDirectory(
    context,
    "axmorf-visual-prepare-",
  );
  const projectRoot = await writeVisualSource(rootDir);
  // Resolving this provider configuration would fail. Visual preparation must
  // complete without reading it or protected voice material.
  const env = { RSP_PRODUCER_CONFIG: join(rootDir, "missing-tts-config.json") };
  const before = await readdir(rootDir);
  assert.deepEqual(
    await inspectNarrationCache({ rootDir, projectId: story.storyId, env }),
    { providerRequests: 0, providerCacheHits: 0, narrationReady: true },
  );
  assert.deepEqual(await readdir(rootDir), before);

  const prepared = await prepareNarrationInputs({
    rootDir,
    projectId: story.storyId,
    env,
  });
  assert.equal(prepared.mode, "visual");
  assert.equal(prepared.sealedNarration, null);
  assert.equal(prepared.masteredNarration, null);
  assert.deepEqual(prepared.actualCost, {
    providerRequests: 0,
    providerCacheHits: 0,
  });
  assert.deepEqual(
    prepared.semanticTiming,
    generateVisualSemanticTiming({ story, render }),
  );
  assert.equal(prepared.semanticTiming.durationInFrames, 327);
  assert.equal(prepared.semanticTiming.sampleRate, null);
  assert.equal(prepared.semanticTiming.narrationStartFrame, null);
  assert.deepEqual(prepared.semanticTiming.captionCues, []);
  assert.deepEqual(prepared.semanticTiming.segments, []);
  assert.deepEqual(await readdir(join(projectRoot, "generated")), [
    "mastered-narration.generated.json",
    "sealed-narration.generated.json",
    "semantic-timing.generated.json",
  ]);
  for (const path of [
    join(rootDir, ".narration-work"),
    join(rootDir, "public"),
    join(projectRoot, "generated/narration-preparation.generated.json"),
  ]) {
    await assert.rejects(stat(path), { code: "ENOENT" });
  }
  const repeated = await prepareNarrationInputs({
    rootDir,
    projectId: story.storyId,
    env,
  });
  assert.deepEqual(repeated.semanticTimingBytes, prepared.semanticTimingBytes);
  assert.equal(
    await readFile(
      join(projectRoot, "generated/sealed-narration.generated.json"),
      "utf8",
    ),
    "null\n",
  );
});

test("visual fixed timing attests authored frames and explicit absence of narration", async (context) => {
  const rootDir = await createTemporaryDirectory(
    context,
    "axmorf-visual-fixed-",
  );
  const preparedTiming = generateVisualSemanticTiming({ story, render });
  const built = buildVisualSemanticTimingTask({
    inputs: {
      projectId: story.storyId,
      story,
      render,
      narration: null,
      fingerprints: {
        story: createFingerprint({
          namespace: "revision-story",
          version: 1,
          value: story,
        }),
        render: createFingerprint({
          namespace: "revision-render",
          version: 1,
          value: render,
        }),
      },
    } as Parameters<typeof buildVisualSemanticTimingTask>[0]["inputs"],
    revisionId: ProductionRevisionIdSchema.parse(`revision-${"1".repeat(64)}`),
  });
  assert.equal(built.task.taskKind, "semantic-timing");
  assert.deepEqual(built.task.dependencyArtifacts, []);
  assert.equal(
    built.task.inputFingerprints.find(({ id }) => id === "narration")
      ?.fingerprint,
    computeNoNarrationFingerprint(),
  );
  assert.ok(
    built.task.declaredOutputSet.every((file) => file.endsWith(".json")),
  );
  const files = {
    "inputs/context.json": built.contextBytes,
    "project/generated/sealed-narration.generated.json": "null\n",
    "project/generated/mastered-narration.generated.json": "null\n",
    "project/generated/semantic-timing.generated.json":
      canonical(preparedTiming),
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
  assert.equal(
    (await ensureFixedTaskArtifact({ rootDir, task: built.task, files }))
      .artifactFingerprint,
    attestation.artifactFingerprint,
  );

  const workspace = join(
    rootDir,
    ".producer-work",
    story.storyId,
    built.task.taskRevision,
  );
  const changedStory = StorySpecSchema.parse({
    ...story,
    beats: story.beats.map((beat) =>
      beat.kind === "visual-scene" && beat.meaningId === "opening"
        ? { ...beat, durationInFrames: 121 }
        : beat,
    ),
  });
  await writeFile(
    join(workspace, "project/generated/semantic-timing.generated.json"),
    canonical(generateVisualSemanticTiming({ story: changedStory, render })),
  );
  await assert.rejects(
    checkTaskByKind({ rootDir, taskRevision: built.task.taskRevision }),
    /stale against authored frames/u,
  );
  await writeFile(
    join(workspace, "project/generated/semantic-timing.generated.json"),
    canonical(preparedTiming),
  );
  await writeFile(
    join(workspace, "project/generated/sealed-narration.generated.json"),
    "{}\n",
  );
  await assert.rejects(
    checkTaskByKind({ rootDir, taskRevision: built.task.taskRevision }),
  );
  await writeFile(
    join(workspace, "project/generated/sealed-narration.generated.json"),
    "null\n",
  );
  await writeFile(join(workspace, "fake-narration.wav"), "fake PCM");
  await assert.rejects(
    checkTaskByKind({ rootDir, taskRevision: built.task.taskRevision }),
    /exact file set/u,
  );
});

test("created visual Story is inspectable and timing-bound without a provider receipt or TTS configuration", async (context) => {
  const fixture = await prepareProjectCreateFixture();
  context.after(() => rm(fixture.rootDir, { recursive: true, force: true }));
  await writeProjectCreateJson(fixture.inputPath, {
    ...validProjectCreateInput,
    story: {
      ...validProjectCreateInput.story,
      beats: [story.beats[0]],
    },
  });
  await createProject({
    rootDir: fixture.rootDir,
    projectId: story.storyId,
    inputPath: fixture.inputPath,
    runtimeResources: projectCreateRuntimeResources,
    env: { RSP_PRODUCER_CONFIG: fixture.configPath },
  });
  const input = {
    rootDir: fixture.rootDir,
    projectId: story.storyId,
    env: { RSP_PRODUCER_CONFIG: join(fixture.rootDir, "missing-config.json") },
  };
  const timingPath = join(
    fixture.rootDir,
    "src/projects/story-example/generated/semantic-timing.generated.json",
  );
  const createdTimingBytes = await readFile(timingPath);
  await writeFile(
    timingPath,
    canonical(generateVisualSemanticTiming({ story, render })),
  );
  const stale = await inspectProjectProduction(input);
  assert.equal(stale.sourceState, "configured-authoring");
  assert.equal(stale.nextAction, "prepare-production");
  assert.equal(stale.estimatedCost.providerRequests, 0);
  await writeFile(timingPath, createdTimingBytes);
  const before = await captureProductionInspectionSnapshot(input);
  const inspection = await inspectProjectProduction(input);
  assert.deepEqual(await captureProductionInspectionSnapshot(input), before);
  assert.equal(inspection.sourceState, "timing-ready");
  assert.equal(inspection.estimatedCost.providerRequests, 0);
  assert.equal(inspection.estimatedCost.providerCacheHits, 0);
  assert.equal(inspection.durationBudget?.actualTotalSeconds, 147 / 30);
  assert.equal(
    inspection.durationBudget?.measurement,
    "authored-semantic-timing",
  );
  assert.equal(inspection.nextAction, "complete-authoring");
  await projectPendingSceneAuthoring(input);
  assert.equal(
    (await inspectProductionSourceReadiness(input)).sourceState,
    "production-inputs-ready",
  );
  // Supply a real source-byte policy fixture, rather than depending on a built
  // npm package or copying the entire development repository into this test.
  const policyPath = "scripts/project-production/application/load-inputs.ts";
  const runtimePolicyManifest = buildRuntimePolicyManifest({
    packageVersion: "0.1.16",
    files: [
      {
        logicalPath: policyPath,
        bytes: await readFile(join(import.meta.dirname, "../..", policyPath)),
        scopes: ["composition", "delivery", "global-visual", "scene"],
      },
    ],
  });
  for (const [file, value] of [
    ["package.json", '{"name":"visual-source-proof"}\n'],
    ["package-lock.json", '{"name":"visual-source-proof"}\n'],
    ["remotion.config.mjs", "export {};\n"],
  ] as const) {
    await writeFile(join(fixture.rootDir, file), value);
  }
  const inputs = await loadProjectProductionInputs({
    ...input,
    runtimePolicyManifest,
  });
  assert.equal(inputs.narration, null);
  assert.equal(inputs.sealedNarration, null);
  assert.equal(inputs.masteredNarration, null);
  assert.equal(inputs.fingerprints.narration, computeNoNarrationFingerprint());
  assert.equal(
    inputs.fingerprints.narrationGeneration,
    computeNoNarrationFingerprint(),
  );
  assert.deepEqual(inputs.sceneInputs[0]?.narrationCues, []);
  const planned = await buildCurrentProductionPlan({
    ...input,
    inputs,
    runtimePolicyManifest,
  });
  assert.equal(
    planned.tasks.filter(({ taskKind }) => taskKind === "semantic-timing")
      .length,
    1,
  );
  assert.equal(
    planned.tasks.filter(({ taskKind }) => taskKind.startsWith("narration-"))
      .length,
    0,
  );
  const otherProvider = await buildCurrentProductionPlan({
    ...input,
    inputs,
    runtimePolicyManifest,
    narration: { providerAttemptFingerprint: `sha256:${"b".repeat(64)}` },
  });
  assert.equal(otherProvider.revision.revisionId, planned.revision.revisionId);
  assert.deepEqual(
    otherProvider.tasks.map(({ taskRevision }) => taskRevision),
    planned.tasks.map(({ taskRevision }) => taskRevision),
  );
  const prepared = await prepareProjectProduction({
    ...input,
    runtimePolicyManifest,
  });
  assert.equal(prepared.status, "project-production-prepared");
  assert.equal(prepared.actualCost.providerRequests, 0);
  assert.equal(prepared.actualCost.providerCacheHits, 0);
  assert.deepEqual(
    prepared.dirtyAgentTasks.map(({ taskKind }) => taskKind).sort(),
    ["cover-owner", "global-visual-owner", "scene-owner"],
  );
  const afterPrepare = await buildCurrentProductionPlan({
    ...input,
    runtimePolicyManifest,
  });
  assert.equal(
    afterPrepare.plan.tasks.find(
      ({ taskKind }) => taskKind === "semantic-timing",
    )?.action,
    "reuse",
  );
  await assert.rejects(
    stat(
      join(
        fixture.rootDir,
        "src/projects/story-example/generated/narration-preparation.generated.json",
      ),
    ),
    { code: "ENOENT" },
  );
  await assert.rejects(stat(join(fixture.rootDir, ".narration-work")), {
    code: "ENOENT",
  });
});

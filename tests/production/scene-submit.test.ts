import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";

import {
  SceneAssignmentSchema,
  ScenePackageSchema,
  SceneProductionResultSchema,
  buildNotApplicableFidelityReceipt,
  buildSceneAssignment,
  buildSceneSoundPlan,
  buildSceneSyncAnchors,
  buildSceneTaskInputV3,
  buildSceneVisualPlan,
  buildShotPlanSet,
  buildShotRecipeSelection,
  computeSceneTaskInputFingerprint,
  resolveProductionReadabilityPolicy,
  type ProductionReadabilityPolicy,
} from "../../src/contracts";
import { buildScenePackage } from "../../scripts/scene-package/domain";
import { parseSceneSelectedResourcesFile } from "../../scripts/scene-package/generate";
import { readProductionRunStore } from "../../scripts/production/adapters/run-store";
import { runProductionSceneFail } from "../../scripts/production/application/scene-fail";
import {
  runProductionSceneCheck,
  runProductionSceneSubmit,
} from "../../scripts/production/application/scene-submit";
import {
  FIXED_PRODUCTION_NOW,
  createProductionFixture,
  markProductionBaselineReady,
  markProductionSceneInputsFrozen,
} from "./fixture";

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;

const createAssignment = (
  runId: string,
  requirementsFingerprint: string,
  readabilityPolicy: ProductionReadabilityPolicy,
) => {
  const taskInput = buildSceneTaskInputV3({
    storyId: "story-example",
    meaningId: "opening",
    storyBeat: {
      meaningId: "opening",
      narrativePurpose: "State the timing problem.",
      ttsChunks: [{ chunkId: "opening-01", ttsText: "A" }],
      explicitPauses: [{ afterChunkId: "opening-01", pauseMs: 250 }],
    },
    timingBeat: { meaningId: "opening", startFrame: 15, endFrame: 84 },
    storyFingerprint: sha("1"),
    semanticTimingFingerprint: sha("2"),
    renderFingerprint: sha("3"),
    visualStyleFingerprint: sha("4"),
    resourceCatalogFingerprint: sha("5"),
    allowedSnapshots: [],
    allowedResourceIds: [],
    continuity: {
      previousMeaningId: null,
      previousSummary: null,
      nextMeaningId: "conclusion",
      nextSummary: "State the deterministic result.",
      continuityBrief: "Hand the timing axis to the conclusion.",
    },
    allowedDirectories: {
      sceneRoot: "src/projects/story-example/scenes/opening",
      publicAssetRoot: "public/projects/story-example/scenes/opening",
    },
    readabilityPolicy,
    sceneCompositionBoundaryVersion: "scene-composition-boundary-v1",
  });
  return buildSceneAssignment({
    runId,
    storyId: "story-example",
    meaningId: "opening",
    requirementsFingerprint,
    sceneBriefFingerprint: sha("6"),
    resourcePoolFingerprint: sha("7"),
    taskInput,
    readabilityPolicy,
    sceneCompositionBoundaryVersion: "scene-composition-boundary-v1",
    sceneBrief: {
      meaningId: "opening",
      visualIntent: "Show the cumulative timing boundary.",
      compositionIntent: "Use one horizontal axis.",
      motionIntent: "Reveal the boundary frame by frame.",
      soundIntent: "No Scene-local sound is required.",
      continuityBrief: "Hand the timing axis to the conclusion.",
      candidateResourceIds: [],
      allowedSnapshotCards: [],
    },
    additionalRequirements: [],
  });
};

const createPackage = (assignment: ReturnType<typeof createAssignment>) => {
  const task = assignment.taskInput;
  assert.equal(
    task.taskInputFingerprint,
    computeSceneTaskInputFingerprint(task),
  );
  const visual = buildSceneVisualPlan({
    taskInputFingerprint: task.taskInputFingerprint,
    meaningId: task.meaningId,
    semanticObjective: "Show the timing boundary.",
    subject: "One cumulative timing boundary.",
    primaryAction: "Reveal the boundary from left to right.",
    causalLink: "The completed timing span establishes the handoff.",
    primaryComposition: "Use one stable horizontal axis.",
    styleRealization: ["Use a restrained high-contrast timing line."],
    continuity: "Preserve the axis for the following Scene.",
    recipeDecision: "empty",
    visualResourceIds: [],
    orderedShotIds: ["opening-shot"],
    fallbackIntent: "Keep the timing boundary legible without resources.",
  });
  const shots = buildShotPlanSet({
    taskInputFingerprint: task.taskInputFingerprint,
    meaningId: task.meaningId,
    sceneDurationInFrames: 69,
    shots: [
      {
        shotId: "opening-shot",
        order: 0,
        primaryRange: { startFrame: 0, endFrame: 69 },
        purpose: "Show one boundary.",
        action: "Reveal a timing line.",
        visualResourceIds: [],
        syncAnchorIds: [],
      },
    ],
  });
  const anchors = buildSceneSyncAnchors({
    taskInputFingerprint: task.taskInputFingerprint,
    meaningId: task.meaningId,
    sceneDurationInFrames: 69,
    anchors: [],
  });
  const sound = buildSceneSoundPlan({
    taskInputFingerprint: task.taskInputFingerprint,
    meaningId: task.meaningId,
    sceneDurationInFrames: 69,
    ambience: null,
    cues: [],
  });
  const selection = buildShotRecipeSelection({
    taskInputFingerprint: task.taskInputFingerprint,
    selections: [],
  });
  const fidelityReceipt = buildNotApplicableFidelityReceipt({
    selectionFingerprint: selection.selectionFingerprint,
    reason: "empty",
  });
  return buildScenePackage({
    task,
    visual,
    shots,
    anchors,
    sound,
    selection,
    fidelityReceipt,
    selectedResources: [],
    rendererBinding: {
      rendererId: "story-example-opening",
      rendererSourceFingerprint: sha("8"),
    },
    current: {
      timingBeat: task.timingBeat,
      semanticTimingFingerprint: task.semanticTimingFingerprint,
      visualStyleFingerprint: task.visualStyleFingerprint,
      resourceCatalogFingerprint: task.resourceCatalogFingerprint,
      snapshotFingerprints: [],
      rendererSourceFingerprint: sha("8"),
      visualRuntimeVersion: "story-visual-runtime-v2",
      sceneAudioRuntimeVersion: "scene-audio-runtime-v1",
    },
  });
};

const createFixture = async (context: TestContext) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-scene-submit-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const fixture = await createProductionFixture(context, rootDir);
  await markProductionBaselineReady(fixture);
  const assignment = createAssignment(
    fixture.runId,
    fixture.requirements.requirementsFingerprint,
    fixture.requirements.readabilityPolicy,
  );
  await markProductionSceneInputsFrozen({
    ...fixture,
    assignmentFingerprint: assignment.assignmentFingerprint,
  });
  return { ...fixture, assignment, scenePackage: createPackage(assignment) };
};

test("check validates a Scene without creating an immutable result", async (context) => {
  const fixture = await createFixture(context);
  const statePath = join(
    fixture.rootDir,
    ".producer-runs",
    fixture.runId,
    "state.generated.json",
  );
  const resultPath = join(
    fixture.rootDir,
    ".producer-runs",
    fixture.runId,
    "scene-results/opening.json",
  );
  const beforeState = await readFile(statePath);
  const beforeMtime = (await stat(statePath)).mtimeMs;
  const eventsPath = join(
    fixture.rootDir,
    ".producer-runs",
    fixture.runId,
    "events",
  );
  const beforeEvents = await readdir(eventsPath);

  const result = await runProductionSceneCheck({
    rootDir: fixture.rootDir,
    runId: fixture.runId,
    meaningId: "opening",
    resolveAssignment: async () => fixture.assignment,
    validateScene: async () => ({
      scenePackage: fixture.scenePackage,
      rendererSourceGraphFingerprint: sha("8"),
      mechanicalCheckFingerprint: sha("9"),
    }),
  });

  assert.deepEqual(result, {
    runId: fixture.runId,
    storyId: "story-example",
    meaningId: "opening",
    status: "ready-to-submit",
    assignmentFingerprint: fixture.assignment.assignmentFingerprint,
    scenePackageFingerprint: fixture.scenePackage.packageFingerprint,
    rendererSourceGraphFingerprint: sha("8"),
    mechanicalCheckFingerprint: sha("9"),
  });
  await assert.rejects(() => stat(resultPath), { code: "ENOENT" });
  assert.deepEqual(await readFile(statePath), beforeState);
  assert.equal((await stat(statePath)).mtimeMs, beforeMtime);
  assert.deepEqual(await readdir(eventsPath), beforeEvents);
});

test("check rejects invalid Agent output without terminalizing the run", async (context) => {
  const fixture = await createFixture(context);
  const resultPath = join(
    fixture.rootDir,
    ".producer-runs",
    fixture.runId,
    "scene-results/opening.json",
  );

  await assert.rejects(() =>
    runProductionSceneCheck({
      rootDir: fixture.rootDir,
      runId: fixture.runId,
      meaningId: "opening",
      resolveAssignment: async () => fixture.assignment,
      validateScene: async () => {
        throw new Error("Renderer crosses another Scene directory.");
      },
    }),
  );

  await assert.rejects(() => stat(resultPath), { code: "ENOENT" });
  const state = await readProductionRunStore({
    rootDir: fixture.rootDir,
    runId: fixture.runId,
  });
  assert.equal(state.state.state, "scene-inputs-frozen");
});

test("submit creates one success result without changing central state", async (context) => {
  const fixture = await createFixture(context);
  const statePath = join(
    fixture.rootDir,
    ".producer-runs",
    fixture.runId,
    "state.generated.json",
  );
  const beforeState = await readFile(statePath);
  const beforeMtime = (await stat(statePath)).mtimeMs;
  const result = await runProductionSceneSubmit({
    rootDir: fixture.rootDir,
    runId: fixture.runId,
    meaningId: "opening",
    clock: () => FIXED_PRODUCTION_NOW,
    resolveAssignment: async () => fixture.assignment,
    validateScene: async () => ({
      scenePackage: fixture.scenePackage,
      rendererSourceGraphFingerprint: sha("8"),
      mechanicalCheckFingerprint: sha("9"),
    }),
  });
  assert.equal(result.result.status, "success");
  assert.equal(result.result.schemaVersion, 3);
  assert.equal(result.written, true);
  assert.deepEqual(await readFile(statePath), beforeState);
  assert.equal((await stat(statePath)).mtimeMs, beforeMtime);
  assert.equal(
    SceneProductionResultSchema.parse(
      JSON.parse(await readFile(result.resultPath, "utf8")),
    ).resultFingerprint,
    result.result.resultFingerprint,
  );

  const repeated = await runProductionSceneSubmit({
    rootDir: fixture.rootDir,
    runId: fixture.runId,
    meaningId: "opening",
    clock: () => new Date("2026-08-04T01:00:00.000Z"),
    resolveAssignment: async () => fixture.assignment,
    validateScene: async () => ({
      scenePackage: fixture.scenePackage,
      rendererSourceGraphFingerprint: sha("8"),
      mechanicalCheckFingerprint: sha("9"),
    }),
  });
  assert.equal(repeated.written, false);
});

test("readability policy drift invalidates assignment package and result identities", async (context) => {
  const fixture = await createFixture(context);
  const driftedPolicy = resolveProductionReadabilityPolicy({
    width: 2160,
    height: 3840,
  });
  assert.throws(() =>
    SceneAssignmentSchema.parse({
      ...fixture.assignment,
      readabilityPolicy: driftedPolicy,
    }),
  );
  assert.throws(() =>
    ScenePackageSchema.parse({
      ...fixture.scenePackage,
      readabilityPolicyFingerprint: driftedPolicy.policyFingerprint,
    }),
  );

  const submitted = await runProductionSceneSubmit({
    rootDir: fixture.rootDir,
    runId: fixture.runId,
    meaningId: "opening",
    clock: () => FIXED_PRODUCTION_NOW,
    resolveAssignment: async () => fixture.assignment,
    validateScene: async () => ({
      scenePackage: fixture.scenePackage,
      rendererSourceGraphFingerprint: sha("8"),
      mechanicalCheckFingerprint: sha("9"),
    }),
  });
  assert.throws(() =>
    SceneProductionResultSchema.parse({
      ...submitted.result,
      readabilityPolicyFingerprint: driftedPolicy.policyFingerprint,
    }),
  );
});

test("validation failures become atomic failure results and stop success", async (context) => {
  for (const message of [
    "Selected resource is outside the assignment allowlist.",
    "Renderer imports https://remote.example/module.ts.",
    "Renderer crosses another Scene directory.",
    "ScenePackage is malformed.",
    "Exact recipe receipt is missing or stale.",
  ]) {
    await context.test(message, async (child) => {
      const fixture = await createFixture(child);
      await assert.rejects(() =>
        runProductionSceneSubmit({
          rootDir: fixture.rootDir,
          runId: fixture.runId,
          meaningId: "opening",
          clock: () => FIXED_PRODUCTION_NOW,
          resolveAssignment: async () => fixture.assignment,
          validateScene: async () => {
            throw new Error(message);
          },
        }),
      );
      const path = join(
        fixture.rootDir,
        ".producer-runs",
        fixture.runId,
        "scene-results/opening.json",
      );
      const result = SceneProductionResultSchema.parse(
        JSON.parse(await readFile(path, "utf8")),
      );
      assert.equal(result.status, "failure");
      if (message.includes("outside")) {
        assert.equal(result.error.code, "RESOURCE_NOT_ALLOWED");
      }
      const state = await readProductionRunStore({
        rootDir: fixture.rootDir,
        runId: fixture.runId,
      });
      assert.equal(state.state.state, "scene-inputs-frozen");
    });
  }
});

test("success and failure results conflict instead of overwriting", async (context) => {
  const fixture = await createFixture(context);
  await runProductionSceneSubmit({
    rootDir: fixture.rootDir,
    runId: fixture.runId,
    meaningId: "opening",
    clock: () => FIXED_PRODUCTION_NOW,
    resolveAssignment: async () => fixture.assignment,
    validateScene: async () => ({
      scenePackage: fixture.scenePackage,
      rendererSourceGraphFingerprint: sha("8"),
      mechanicalCheckFingerprint: sha("9"),
    }),
  });
  await assert.rejects(() =>
    runProductionSceneFail({
      rootDir: fixture.rootDir,
      runId: fixture.runId,
      meaningId: "opening",
      code: "SCENE_BLOCKED",
      description: "The Scene cannot be completed.",
      clock: () => FIXED_PRODUCTION_NOW,
      resolveAssignment: async () => fixture.assignment,
    }),
  );
});

test("Scene submit fails closed on a malformed selected-resources envelope", () => {
  assert.throws(
    () => parseSceneSelectedResourcesFile({ selectedResources: [] }),
    /schemaVersion/,
  );
  assert.deepEqual(
    parseSceneSelectedResourcesFile({
      schemaVersion: 1,
      selectedResources: [],
    }),
    { schemaVersion: 1, selectedResources: [] },
  );
});

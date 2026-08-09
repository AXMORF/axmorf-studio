import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";

import {
  buildProductionRenderPlan,
  buildProductionRenderReady,
} from "../../src/contracts";
import { readProductionRunStore } from "../../scripts/production/adapters/run-store";
import {
  checkProductionRenderReady,
  runProductionRenderReady,
  type RenderReadyDependencies,
} from "../../scripts/production/application/render-ready";
import {
  FIXED_PRODUCTION_NOW,
  createProductionFixture,
  markProductionBaselineReady,
  markProductionRenderReadyRunning,
  markProductionSceneInputsFrozen,
} from "./fixture";

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;

const readyFixture = async (context: TestContext) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-render-ready-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const fixture = await createProductionFixture(context, rootDir);
  await markProductionBaselineReady(fixture);
  await markProductionSceneInputsFrozen({
    ...fixture,
    globalVisualAssignmentFingerprint: sha("a"),
  });
  await markProductionRenderReadyRunning({
    ...fixture,
    sceneResults: [
      {
        meaningId: "opening",
        assignmentFingerprint: sha("f"),
        resultFingerprint: sha("9"),
      },
    ],
  });
  const plan = buildProductionRenderPlan({
    runId: fixture.runId,
    storyId: fixture.source.story.storyId,
    requirementsFingerprint: fixture.requirements.requirementsFingerprint,
    storyFingerprint: sha("1"),
    sealedNarrationFingerprint: sha("2"),
    semanticTimingFingerprint: sha("3"),
    captionCuesFingerprint: sha("4"),
    sceneCoverageFingerprint: sha("5"),
    scenePackages: [{ meaningId: "opening", packageFingerprint: sha("6") }],
    rendererRegistryFingerprint: sha("7"),
    storyVisualProjectionFingerprint: sha("8"),
    sceneSoundProjectionFingerprint: sha("9"),
    globalVisual: {
      assignmentFingerprint: sha("a"),
      packageFingerprint: sha("b"),
      resultFingerprint: sha("c"),
      planFingerprint: sha("d"),
      projectionFingerprint: sha("e"),
      rendererSourceGraphFingerprint: sha("f"),
    },
    compositionId: fixture.source.render.compositionId,
    compositionSourceChecksum: sha("0"),
    width: fixture.source.render.width,
    height: fixture.source.render.height,
    fps: fixture.source.render.fps,
    frameCount: 120,
    layerOrder: ["global-visual", "story-visual", "narrative-core"],
    mixOrder: ["narration", "scene-local-sound"],
    remotionVersion: "4.0.489",
  });
  const ready = buildProductionRenderReady({ plan });
  const calls: string[] = [];
  const dependencies: RenderReadyDependencies = {
    assertCurrentFreeze: async () => {
      calls.push("freeze");
    },
    prepareRenderPlan: async ({ mode }) => {
      calls.push(`plan:${mode}`);
      return plan;
    },
    projectRegistry: async ({ mode }) => {
      calls.push(`registry:${mode}`);
      return {
        compositionId: plan.compositionId,
        registryChecksum: sha("a"),
      };
    },
    compileProjectComposition: async () => {
      calls.push("compile");
    },
    writeOrCheckRenderReady: async ({ mode }) => {
      calls.push(`ready:${mode}`);
      return ready;
    },
  };
  return { ...fixture, rootDir, plan, ready, calls, dependencies } as const;
};

test("render-ready writes, rechecks, seals terminal state, and is idempotent", async (context) => {
  const fixture = await readyFixture(context);
  const first = await runProductionRenderReady({
    rootDir: fixture.rootDir,
    runId: fixture.runId,
    clock: () => FIXED_PRODUCTION_NOW,
    dependencies: fixture.dependencies,
  });
  assert.deepEqual(first, {
    runId: fixture.runId,
    status: "render-ready",
    handoff: "awaiting-automatic-delivery",
    renderPlanFingerprint: fixture.plan.renderPlanFingerprint,
    renderReadyFingerprint: fixture.ready.renderReadyFingerprint,
    statePath: `.producer-runs/${fixture.runId}/state.generated.json`,
    noOp: false,
  });
  assert.deepEqual(fixture.calls, [
    "freeze",
    "plan:write",
    "plan:check",
    "registry:write",
    "registry:check",
    "compile",
    "ready:write",
    "ready:check",
  ]);
  assert.equal(
    (await readProductionRunStore(fixture)).state.state,
    "render-ready",
  );

  const repeated = await runProductionRenderReady({
    rootDir: fixture.rootDir,
    runId: fixture.runId,
    clock: () => FIXED_PRODUCTION_NOW,
    dependencies: fixture.dependencies,
  });
  assert.equal(repeated.noOp, true);
  const checked = await checkProductionRenderReady({
    rootDir: fixture.rootDir,
    runId: fixture.runId,
    dependencies: fixture.dependencies,
  });
  assert.equal(checked.noOp, true);
});

test("render-ready failure is recorded centrally and never claims readiness", async (context) => {
  const fixture = await readyFixture(context);
  await assert.rejects(
    runProductionRenderReady({
      rootDir: fixture.rootDir,
      runId: fixture.runId,
      clock: () => FIXED_PRODUCTION_NOW,
      dependencies: {
        ...fixture.dependencies,
        prepareRenderPlan: async () => {
          throw new Error("injected render plan failure");
        },
      },
    }),
    /render plan failure/iu,
  );
  const state = (await readProductionRunStore(fixture)).state;
  assert.equal(state.state, "failed");
  assert.equal(state.failure?.stageId, "render-ready");
});

test("Composition compile failure is terminal before render-ready is written", async (context) => {
  const fixture = await readyFixture(context);
  let readyWrites = 0;
  await assert.rejects(
    runProductionRenderReady({
      rootDir: fixture.rootDir,
      runId: fixture.runId,
      clock: () => FIXED_PRODUCTION_NOW,
      dependencies: {
        ...fixture.dependencies,
        compileProjectComposition: async () => {
          throw new Error("Target Project Composition TypeScript compile failed (TS2322).");
        },
        writeOrCheckRenderReady: async (request) => {
          if (request.mode === "write") readyWrites += 1;
          return fixture.dependencies.writeOrCheckRenderReady(request);
        },
      },
    }),
    /TypeScript compile failed \(TS2322\)/u,
  );
  const state = (await readProductionRunStore(fixture)).state;
  assert.equal(state.state, "failed");
  assert.equal(state.failure?.stageId, "render-ready");
  assert.equal(readyWrites, 0);
  assert.equal(
    state.outputArtifacts.some(
      ({ artifactId }) => artifactId === "production-render-ready",
    ),
    false,
  );
});

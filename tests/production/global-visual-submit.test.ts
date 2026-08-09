import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";

import {
  GlobalVisualProductionResultSchema,
  buildGlobalVisualAssignment,
  buildGlobalVisualPackage,
} from "../../src/contracts";
import { runProductionGlobalVisualFail } from "../../scripts/production/application/global-visual-fail";
import {
  runProductionGlobalVisualCheck,
  runProductionGlobalVisualSubmit,
} from "../../scripts/production/application/global-visual-submit";
import {
  createProductionFixture,
  markProductionBaselineReady,
  markProductionSceneInputsFrozen,
} from "./fixture";

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;

const createFixture = async (context: TestContext) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-global-visual-submit-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const fixture = await createProductionFixture(context, rootDir);
  await markProductionBaselineReady(fixture);
  const assignment = buildGlobalVisualAssignment({
    runId: fixture.runId,
    storyId: "story-example",
    compositionId: "StoryExample",
    requirementsFingerprint: fixture.requirements.requirementsFingerprint,
    globalVisualBriefFingerprint: sha("1"),
    storyFingerprint: sha("2"),
    renderFingerprint: sha("3"),
    semanticTimingFingerprint: sha("4"),
    visualStyleFingerprint: sha("5"),
    resourceCatalogFingerprint: sha("6"),
    resourcePoolFingerprint: sha("7"),
    readabilityPolicyFingerprint:
      fixture.requirements.readabilityPolicy.policyFingerprint,
    timeline: {
      fps: 30,
      width: 1920,
      height: 1080,
      durationInFrames: 300,
      captionSafeArea: { top: 90, right: 90, bottom: 180, left: 90 },
      storyBeatWindows: [
        { meaningId: "opening", startFrame: 0, endFrame: 150 },
        { meaningId: "conclusion", startFrame: 150, endFrame: 300 },
      ],
    },
    allowedResourceIds: [],
    exclusivePaths: {
      plan: "src/projects/story-example/global-visual-plan.json",
      sourceDirectory: "src/projects/story-example/global-visual",
      publicDirectory: "public/projects/story-example/global-visual",
    },
  });
  const globalVisualPackage = buildGlobalVisualPackage({
    storyId: "story-example",
    compositionId: "StoryExample",
    assignmentFingerprint: assignment.assignmentFingerprint,
    requirementsFingerprint: assignment.requirementsFingerprint,
    semanticTimingFingerprint: assignment.semanticTimingFingerprint,
    visualStyleFingerprint: assignment.visualStyleFingerprint,
    readabilityPolicyFingerprint: assignment.readabilityPolicyFingerprint,
    globalVisualPlanFingerprint: sha("8"),
    rendererId: "project-global-visual",
    rendererSourceGraphFingerprint: sha("9"),
    selectedResources: [],
  });
  await markProductionSceneInputsFrozen({ ...fixture });
  return { ...fixture, assignment, globalVisualPackage };
};

const validate = async (
  fixture: Awaited<ReturnType<typeof createFixture>>,
) => ({
  globalVisualPackage: fixture.globalVisualPackage,
  mechanicalCheckFingerprint: sha("a"),
});

test("check is non-terminal and submit writes one immutable result", async (context) => {
  const fixture = await createFixture(context);
  const statePath = join(
    fixture.rootDir,
    ".producer-runs",
    fixture.runId,
    "state.generated.json",
  );
  const before = await readFile(statePath);
  const beforeMtime = (await stat(statePath)).mtimeMs;
  const checked = await runProductionGlobalVisualCheck({
    rootDir: fixture.rootDir,
    runId: fixture.runId,
    resolveAssignment: async () => fixture.assignment,
    validateGlobalVisual: async () => validate(fixture),
  });
  assert.equal(checked.status, "ready-to-submit");

  const submitted = await runProductionGlobalVisualSubmit({
    rootDir: fixture.rootDir,
    runId: fixture.runId,
    resolveAssignment: async () => fixture.assignment,
    validateGlobalVisual: async () => validate(fixture),
  });
  assert.equal(submitted.written, true);
  assert.equal(submitted.result.status, "success");
  assert.deepEqual(await readFile(statePath), before);
  assert.equal((await stat(statePath)).mtimeMs, beforeMtime);
  assert.equal(
    GlobalVisualProductionResultSchema.parse(
      JSON.parse(await readFile(submitted.resultPath, "utf8")),
    ).resultFingerprint,
    submitted.result.resultFingerprint,
  );

  const repeated = await runProductionGlobalVisualSubmit({
    rootDir: fixture.rootDir,
    runId: fixture.runId,
    resolveAssignment: async () => fixture.assignment,
    validateGlobalVisual: async () => validate(fixture),
  });
  assert.equal(repeated.written, false);
});

test("failure is sanitized byte-stable and conflicts with success", async (context) => {
  const fixture = await createFixture(context);
  const failed = await runProductionGlobalVisualFail({
    rootDir: fixture.rootDir,
    runId: fixture.runId,
    code: "GLOBAL_VISUAL_BLOCKED",
    description:
      "Bearer secret failed at https://private.invalid /tmp/stack.ts",
    resolveAssignment: async () => fixture.assignment,
  });
  assert.equal(failed.result.status, "failure");
  assert.doesNotMatch(
    JSON.stringify(failed.result),
    /secret|private\.invalid|\/tmp/u,
  );
  const repeated = await runProductionGlobalVisualFail({
    rootDir: fixture.rootDir,
    runId: fixture.runId,
    code: "GLOBAL_VISUAL_BLOCKED",
    description:
      "Bearer secret failed at https://private.invalid /tmp/stack.ts",
    resolveAssignment: async () => fixture.assignment,
  });
  assert.equal(repeated.written, false);
  await assert.rejects(() =>
    runProductionGlobalVisualSubmit({
      rootDir: fixture.rootDir,
      runId: fixture.runId,
      resolveAssignment: async () => fixture.assignment,
      validateGlobalVisual: async () => validate(fixture),
    }),
  );
});

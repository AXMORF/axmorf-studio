import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";

import {
  buildSceneAssignment,
  buildSceneTaskInputV5,
} from "../../src/contracts";
import { runProductionCli } from "../../scripts/production/cli";
import { runProductionSceneFail } from "../../scripts/production/application/scene-fail";
import {
  FIXED_PRODUCTION_NOW,
  createProductionFixture,
  markProductionBaselineReady,
  markProductionSceneInputsFrozen,
} from "./fixture";

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;

const createFixture = async (context: TestContext) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-scene-fail-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const fixture = await createProductionFixture(context, rootDir);
  await markProductionBaselineReady(fixture);
  const taskInput = buildSceneTaskInputV5({
    storyId: "story-example",
    meaningId: "opening",
    storyBeat: fixture.source.story.beats[0],
    sourceReferences: fixture.source.brief.sourceReferences,
    timingBeat: {
      kind: "narrated-scene",
      meaningId: "opening",
      startFrame: 15,
      endFrame: 84,
    },
    storyFingerprint: sha("1"),
    semanticTimingFingerprint: sha("2"),
    renderFingerprint: sha("3"),
    visualStyleFingerprint: sha("4"),
    resourceCatalogFingerprint: sha("5"),
    readabilityPolicy: fixture.requirements.readabilityPolicy,
    sceneCompositionBoundaryVersion: "scene-composition-boundary-v1",
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
  });
  const assignment = buildSceneAssignment({
    runId: fixture.runId,
    storyId: "story-example",
    meaningId: "opening",
    requirementsFingerprint: fixture.requirements.requirementsFingerprint,
    sceneBriefFingerprint: sha("6"),
    resourcePoolFingerprint: sha("7"),
    taskInput,
    readabilityPolicy: fixture.requirements.readabilityPolicy,
    sceneCompositionBoundaryVersion: "scene-composition-boundary-v1",
    sceneBrief: {
      meaningId: "opening",
      visualIntent: "Show the timing boundary.",
      compositionIntent: "Use one axis.",
      motionIntent: "Reveal frame by frame.",
      soundIntent: "No sound required.",
      continuityBrief: "Hand off the same axis.",
      candidateResourceIds: [],
      allowedSnapshotCards: [],
    },
    additionalRequirements: [],
  });
  await markProductionSceneInputsFrozen({
    ...fixture,
    assignmentFingerprint: assignment.assignmentFingerprint,
  });
  return { ...fixture, assignment };
};

test("writes a sanitized expected failure byte-stably", async (context) => {
  const fixture = await createFixture(context);
  const first = await runProductionSceneFail({
    rootDir: fixture.rootDir,
    runId: fixture.runId,
    meaningId: "opening",
    code: "SCENE_BLOCKED",
    description:
      "Bearer private-token failed at https://private.example?token=secret /tmp/stack.ts",
    clock: () => FIXED_PRODUCTION_NOW,
    resolveAssignment: async () => fixture.assignment,
  });
  assert.equal(first.result.status, "failure");
  assert.equal(first.result.error.code, "SCENE_BLOCKED");
  assert.doesNotMatch(
    JSON.stringify(first.result),
    /private-token|private\.example|token=secret|\/tmp\/stack/u,
  );
  const bytes = await readFile(first.resultPath);
  const mtime = (await stat(first.resultPath)).mtimeMs;
  const repeated = await runProductionSceneFail({
    rootDir: fixture.rootDir,
    runId: fixture.runId,
    meaningId: "opening",
    code: "SCENE_BLOCKED",
    description:
      "Bearer private-token failed at https://private.example?token=secret /tmp/stack.ts",
    clock: () => new Date("2026-08-04T01:00:00.000Z"),
    resolveAssignment: async () => fixture.assignment,
  });
  assert.equal(repeated.written, false);
  assert.deepEqual(await readFile(first.resultPath), bytes);
  assert.equal((await stat(first.resultPath)).mtimeMs, mtime);
});

test("rejects conflicting failures and malformed exact CLI forms", async (context) => {
  const fixture = await createFixture(context);
  await runProductionSceneFail({
    rootDir: fixture.rootDir,
    runId: fixture.runId,
    meaningId: "opening",
    code: "SCENE_BLOCKED",
    description: "The Scene is blocked.",
    clock: () => FIXED_PRODUCTION_NOW,
    resolveAssignment: async () => fixture.assignment,
  });
  await assert.rejects(() =>
    runProductionSceneFail({
      rootDir: fixture.rootDir,
      runId: fixture.runId,
      meaningId: "opening",
      code: "DIFFERENT_FAILURE",
      description: "A conflicting failure.",
      clock: () => FIXED_PRODUCTION_NOW,
      resolveAssignment: async () => fixture.assignment,
    }),
  );

  const contextForCli = {
    rootDir: fixture.rootDir,
    stdout: () => undefined,
    sceneFail: async () => ({ ok: true }),
  };
  await assert.rejects(() =>
    runProductionCli(
      ["scene-fail", "--run", fixture.runId, "--scene", "opening"],
      contextForCli,
    ),
  );
  await assert.rejects(() =>
    runProductionCli(
      [
        "scene-fail",
        "--run",
        fixture.runId,
        "--scene",
        "../opening",
        "--code",
        "SCENE_BLOCKED",
        "--description",
        "Blocked.",
      ],
      contextForCli,
    ),
  );
});

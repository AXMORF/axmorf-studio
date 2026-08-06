import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";

import {
  buildSceneAssignment,
  buildSceneProductionResult,
  buildSceneTaskInput,
  type SceneAssignment,
} from "../../src/contracts";
import { readProductionRunStore } from "../../scripts/production/adapters/run-store";
import {
  createSceneFailureResult,
  writeSceneProductionResult,
} from "../../scripts/production/application/scene-submit";
import { runProductionWatch } from "../../scripts/production/application/watch";
import {
  FIXED_PRODUCTION_NOW,
  createProductionFixture,
  markProductionBaselineReady,
  markProductionSceneInputsFrozen,
} from "./fixture";

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;

const createAssignments = ({
  runId,
  requirementsFingerprint,
  deadlineAt = "2026-08-04T00:30:00.000Z",
}: {
  readonly runId: string;
  readonly requirementsFingerprint: string;
  readonly deadlineAt?: string;
}) =>
  (["opening", "conclusion"] as const).map((meaningId, index) => {
    const taskInput = buildSceneTaskInput({
      storyId: "story-example",
      meaningId,
      storyBeat: {
        meaningId,
        narrativePurpose:
          index === 0
            ? "State the timing problem."
            : "Resolve the timing problem.",
        ttsChunks: [{ chunkId: `${meaningId}-01`, ttsText: "A" }],
        explicitPauses: [{ afterChunkId: `${meaningId}-01`, pauseMs: 250 }],
      },
      timingBeat: {
        meaningId,
        startFrame: index === 0 ? 15 : 84,
        endFrame: index === 0 ? 84 : 150,
      },
      storyFingerprint: sha("1"),
      semanticTimingFingerprint: sha("2"),
      renderFingerprint: sha("3"),
      visualStyleFingerprint: sha("4"),
      resourceCatalogFingerprint: sha("5"),
      allowedSnapshots: [],
      allowedResourceIds: [],
      continuity: {
        previousMeaningId: index === 0 ? null : "opening",
        previousSummary: index === 0 ? null : "State the timing problem.",
        nextMeaningId: index === 0 ? "conclusion" : null,
        nextSummary: index === 0 ? "Resolve the timing problem." : null,
        continuityBrief: "Preserve the timing axis.",
      },
      allowedDirectories: {
        sceneRoot: `src/projects/story-example/scenes/${meaningId}`,
        publicAssetRoot: `public/projects/story-example/scenes/${meaningId}`,
      },
    });
    return buildSceneAssignment({
      runId,
      storyId: "story-example",
      meaningId,
      requirementsFingerprint,
      sceneBriefFingerprint: sha("6"),
      resourcePoolFingerprint: sha("7"),
      taskInput,
      sceneBrief: {
        meaningId,
        visualIntent: "Show the timing boundary.",
        compositionIntent: "Use one axis.",
        motionIntent: "Reveal frame by frame.",
        soundIntent: "No Scene-local sound is required.",
        continuityBrief: "Preserve the timing axis.",
        candidateResourceIds: [],
        allowedSnapshotCards: [],
      },
      additionalRequirements: [],
      deadlineAt,
    });
  });

const successResult = (assignment: SceneAssignment) =>
  buildSceneProductionResult({
    runId: assignment.runId,
    storyId: assignment.storyId,
    meaningId: assignment.meaningId,
    assignmentFingerprint: assignment.assignmentFingerprint,
    taskInputFingerprint: assignment.taskInput.taskInputFingerprint,
    requirementsFingerprint: assignment.requirementsFingerprint,
    sceneBriefFingerprint: assignment.sceneBriefFingerprint,
    resourcePoolFingerprint: assignment.resourcePoolFingerprint,
    occurredAt: FIXED_PRODUCTION_NOW.toISOString(),
    status: "success",
    scenePackage: {
      repositoryPath: `src/projects/${assignment.storyId}/scenes/${assignment.meaningId}/generated/scene-package.generated.json`,
      packageFingerprint: sha(assignment.meaningId === "opening" ? "8" : "9"),
    },
    rendererSourceGraphFingerprint: sha("a"),
    selectedResourcesFingerprint: sha("b"),
    fidelityReceiptFingerprint: sha("c"),
    mechanicalCheckFingerprint: sha("d"),
  });

const createFixture = async (context: TestContext, deadlineAt?: string) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-watch-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const fixture = await createProductionFixture(context, rootDir);
  await markProductionBaselineReady(fixture);
  const assignments = createAssignments({
    runId: fixture.runId,
    requirementsFingerprint: fixture.requirements.requirementsFingerprint,
    deadlineAt,
  });
  await markProductionSceneInputsFrozen({
    ...fixture,
    assignmentFingerprints: assignments.map((assignment) => ({
      meaningId: assignment.meaningId,
      fingerprint: assignment.assignmentFingerprint,
    })),
  });
  return { ...fixture, assignments };
};

const resolver = (assignments: readonly SceneAssignment[]) => async () => ({
  assignments,
});

test("waits through partial out-of-order results and triggers post-scene once", async (context) => {
  const fixture = await createFixture(context);
  const [opening, conclusion] = fixture.assignments;
  await writeSceneProductionResult({
    rootDir: fixture.rootDir,
    result: successResult(conclusion),
  });
  let sleeps = 0;
  let postSceneCalls = 0;
  const watched = await runProductionWatch({
    rootDir: fixture.rootDir,
    runId: fixture.runId,
    clock: () => FIXED_PRODUCTION_NOW,
    scheduler: {
      sleep: async () => {
        sleeps += 1;
        await writeSceneProductionResult({
          rootDir: fixture.rootDir,
          result: successResult(opening),
        });
      },
    },
    resolveAssignments: resolver(fixture.assignments),
    verifySuccess: async () => undefined,
    postScene: async () => {
      postSceneCalls += 1;
    },
  });
  assert.equal(watched.status, "post-scene-running");
  assert.equal(sleeps, 1);
  assert.equal(postSceneCalls, 1);
  const loaded = await readProductionRunStore(fixture);
  assert.equal(loaded.state.state, "post-scene-running");
  assert.deepEqual(
    new Set(
      loaded.state.acceptedSceneResults.map(({ meaningId }) => meaningId),
    ),
    new Set(["opening", "conclusion"]),
  );

  const repeated = await runProductionWatch({
    rootDir: fixture.rootDir,
    runId: fixture.runId,
    clock: () => FIXED_PRODUCTION_NOW,
    scheduler: { sleep: async () => assert.fail("must not wait") },
    resolveAssignments: resolver(fixture.assignments),
    verifySuccess: async () => undefined,
    postScene: async () => {
      postSceneCalls += 1;
    },
  });
  assert.equal(repeated.noOp, true);
  assert.equal(postSceneCalls, 1);
});

test("fails immediately on an explicit Scene failure", async (context) => {
  const fixture = await createFixture(context);
  const failure = createSceneFailureResult({
    assignment: fixture.assignments[0],
    code: "SCENE_BLOCKED",
    description: "The Scene cannot satisfy its frozen brief.",
    redactionApplied: false,
    occurredAt: FIXED_PRODUCTION_NOW.toISOString(),
    commandId: "production-scene-fail",
  });
  await writeSceneProductionResult({
    rootDir: fixture.rootDir,
    result: failure,
  });
  let postSceneCalls = 0;
  await assert.rejects(() =>
    runProductionWatch({
      rootDir: fixture.rootDir,
      runId: fixture.runId,
      clock: () => FIXED_PRODUCTION_NOW,
      scheduler: { sleep: async () => assert.fail("must not wait") },
      resolveAssignments: resolver(fixture.assignments),
      verifySuccess: async () => undefined,
      postScene: async () => {
        postSceneCalls += 1;
      },
    }),
  );
  const loaded = await readProductionRunStore(fixture);
  assert.equal(loaded.state.state, "failed");
  assert.equal(loaded.state.failure?.code, "SCENE_BLOCKED");
  assert.equal(postSceneCalls, 0);
});

test("fails closed for malformed stale and unknown Scene results", async (context) => {
  await context.test("malformed", async (child) => {
    const fixture = await createFixture(child);
    await writeFile(
      join(
        fixture.rootDir,
        ".producer-runs",
        fixture.runId,
        "scene-results/opening.json",
      ),
      "{malformed\n",
    );
    await assert.rejects(() =>
      runProductionWatch({
        rootDir: fixture.rootDir,
        runId: fixture.runId,
        clock: () => FIXED_PRODUCTION_NOW,
        scheduler: { sleep: async () => undefined },
        resolveAssignments: resolver(fixture.assignments),
        verifySuccess: async () => undefined,
        postScene: async () => undefined,
      }),
    );
    assert.equal(
      (await readProductionRunStore(fixture)).state.failure?.code,
      "SCENE_RESULT_MALFORMED",
    );
  });

  await context.test("stale", async (child) => {
    const fixture = await createFixture(child);
    const stale = buildSceneProductionResult({
      ...successResult(fixture.assignments[0]),
      assignmentFingerprint: sha("0"),
    });
    await writeSceneProductionResult({
      rootDir: fixture.rootDir,
      result: stale,
    });
    await assert.rejects(() =>
      runProductionWatch({
        rootDir: fixture.rootDir,
        runId: fixture.runId,
        clock: () => FIXED_PRODUCTION_NOW,
        scheduler: { sleep: async () => undefined },
        resolveAssignments: resolver(fixture.assignments),
        verifySuccess: async () => undefined,
        postScene: async () => undefined,
      }),
    );
    assert.equal(
      (await readProductionRunStore(fixture)).state.failure?.code,
      "STALE_SCENE_RESULT",
    );
  });

  await context.test("unknown", async (child) => {
    const fixture = await createFixture(child);
    await writeFile(
      join(
        fixture.rootDir,
        ".producer-runs",
        fixture.runId,
        "scene-results/unknown.json",
      ),
      `${JSON.stringify(successResult(fixture.assignments[0]))}\n`,
    );
    await assert.rejects(() =>
      runProductionWatch({
        rootDir: fixture.rootDir,
        runId: fixture.runId,
        clock: () => FIXED_PRODUCTION_NOW,
        scheduler: { sleep: async () => undefined },
        resolveAssignments: resolver(fixture.assignments),
        verifySuccess: async () => undefined,
        postScene: async () => undefined,
      }),
    );
    assert.equal(
      (await readProductionRunStore(fixture)).state.failure?.code,
      "UNKNOWN_SCENE_RESULT",
    );
  });
});

test("times out a missing Scene at its frozen deadline", async (context) => {
  const fixture = await createFixture(context, "2026-08-04T00:00:01.000Z");
  let now = FIXED_PRODUCTION_NOW.getTime();
  await assert.rejects(() =>
    runProductionWatch({
      rootDir: fixture.rootDir,
      runId: fixture.runId,
      clock: () => new Date(now),
      scheduler: {
        sleep: async (milliseconds) => {
          now += milliseconds;
        },
      },
      resolveAssignments: resolver(fixture.assignments),
      verifySuccess: async () => undefined,
      postScene: async () => undefined,
    }),
  );
  assert.equal(
    (await readProductionRunStore(fixture)).state.failure?.code,
    "SCENE_TIMEOUT",
  );
});

test("single writer lock rejects a second watcher", async (context) => {
  const fixture = await createFixture(context);
  let releaseSleep: (() => void) | undefined;
  const first = runProductionWatch({
    rootDir: fixture.rootDir,
    runId: fixture.runId,
    clock: () => FIXED_PRODUCTION_NOW,
    scheduler: {
      sleep: () =>
        new Promise<void>((resolve) => {
          releaseSleep = resolve;
        }),
    },
    resolveAssignments: resolver(fixture.assignments),
    verifySuccess: async () => undefined,
    postScene: async () => undefined,
  });
  while (releaseSleep === undefined)
    await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(
    () =>
      runProductionWatch({
        rootDir: fixture.rootDir,
        runId: fixture.runId,
        clock: () => FIXED_PRODUCTION_NOW,
        scheduler: { sleep: async () => undefined },
        resolveAssignments: resolver(fixture.assignments),
        verifySuccess: async () => undefined,
        postScene: async () => undefined,
      }),
    /active writer lock/i,
  );
  await writeSceneProductionResult({
    rootDir: fixture.rootDir,
    result: successResult(fixture.assignments[0]),
  });
  await writeSceneProductionResult({
    rootDir: fixture.rootDir,
    result: successResult(fixture.assignments[1]),
  });
  releaseSleep();
  await first;
});

test("shared freeze drift while waiting records failure", async (context) => {
  const fixture = await createFixture(context);
  let resolutions = 0;
  await assert.rejects(() =>
    runProductionWatch({
      rootDir: fixture.rootDir,
      runId: fixture.runId,
      clock: () => FIXED_PRODUCTION_NOW,
      scheduler: { sleep: async () => undefined },
      resolveAssignments: async () => {
        resolutions += 1;
        if (resolutions > 1) throw new Error("Catalog fingerprint drifted.");
        return { assignments: fixture.assignments };
      },
      verifySuccess: async () => undefined,
      postScene: async () => undefined,
    }),
  );
  assert.equal(
    (await readProductionRunStore(fixture)).state.failure?.code,
    "STALE_SCENE_INPUTS",
  );
});

test("watcher never edits Scene result bytes", async (context) => {
  const fixture = await createFixture(context);
  const result = successResult(fixture.assignments[0]);
  const written = await writeSceneProductionResult({
    rootDir: fixture.rootDir,
    result,
  });
  const before = await readFile(written.resultPath);
  await assert.rejects(() =>
    runProductionWatch({
      rootDir: fixture.rootDir,
      runId: fixture.runId,
      clock: () => new Date("2026-08-04T00:31:00.000Z"),
      scheduler: { sleep: async () => undefined },
      resolveAssignments: resolver(fixture.assignments),
      verifySuccess: async () => undefined,
      postScene: async () => undefined,
    }),
  );
  assert.deepEqual(await readFile(written.resultPath), before);
});

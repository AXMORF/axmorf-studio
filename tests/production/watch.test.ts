import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";

import {
  buildGlobalVisualAssignment,
  buildGlobalVisualProductionResult,
  buildSceneAssignment,
  buildSceneProductionResult,
  buildSceneTaskInputV3,
  type ProductionReadabilityPolicy,
  type SceneAssignment,
  type GlobalVisualAssignment,
} from "../../src/contracts";
import { readProductionRunStore } from "../../scripts/production/adapters/run-store";
import {
  createSceneFailureResult,
  writeSceneProductionResult,
} from "../../scripts/production/application/scene-submit";
import { runProductionWatch } from "../../scripts/production/application/watch";
import {
  createGlobalVisualFailureResult,
  writeGlobalVisualProductionResult,
} from "../../scripts/production/application/global-visual-submit";
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
  readabilityPolicy,
  deadlineAt = "2026-08-04T00:30:00.000Z",
}: {
  readonly runId: string;
  readonly requirementsFingerprint: string;
  readonly readabilityPolicy: ProductionReadabilityPolicy;
  readonly deadlineAt?: string;
}) =>
  (["opening", "conclusion"] as const).map((meaningId, index) => {
    const taskInput = buildSceneTaskInputV3({
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
      readabilityPolicy,
      sceneCompositionBoundaryVersion: "scene-composition-boundary-v1",
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
      readabilityPolicy,
      sceneCompositionBoundaryVersion: "scene-composition-boundary-v1",
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

const successResult = (assignment: Extract<SceneAssignment, { schemaVersion: 3 }>) =>
  buildSceneProductionResult({
    runId: assignment.runId,
    storyId: assignment.storyId,
    meaningId: assignment.meaningId,
    assignmentFingerprint: assignment.assignmentFingerprint,
    taskInputFingerprint: assignment.taskInput.taskInputFingerprint,
    requirementsFingerprint: assignment.requirementsFingerprint,
    sceneBriefFingerprint: assignment.sceneBriefFingerprint,
    resourcePoolFingerprint: assignment.resourcePoolFingerprint,
    readabilityPolicyFingerprint:
      assignment.readabilityPolicy.policyFingerprint,
    sceneCompositionBoundaryVersion:
      assignment.sceneCompositionBoundaryVersion,
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

const createGlobalVisualAssignment = ({
  runId,
  requirementsFingerprint,
  deadlineAt = "2026-08-04T00:30:00.000Z",
}: {
  readonly runId: string;
  readonly requirementsFingerprint: string;
  readonly deadlineAt?: string;
}) =>
  buildGlobalVisualAssignment({
    runId,
    storyId: "story-example",
    compositionId: "StoryExample",
    requirementsFingerprint,
    globalVisualBriefFingerprint: sha("e"),
    storyFingerprint: sha("1"),
    renderFingerprint: sha("3"),
    semanticTimingFingerprint: sha("2"),
    visualStyleFingerprint: sha("4"),
    resourceCatalogFingerprint: sha("5"),
    resourcePoolFingerprint: sha("7"),
    readabilityPolicyFingerprint: sha("f"),
    timeline: {
      fps: 30,
      width: 1080,
      height: 1920,
      durationInFrames: 150,
      captionSafeArea: { top: 120, right: 72, bottom: 280, left: 72 },
      storyBeatWindows: [
        { meaningId: "opening", startFrame: 15, endFrame: 84 },
        { meaningId: "conclusion", startFrame: 84, endFrame: 150 },
      ],
    },
    allowedResourceIds: [],
    exclusivePaths: {
      plan: "src/projects/story-example/global-visual-plan.json",
      sourceDirectory: "src/projects/story-example/global-visual",
      publicDirectory: "public/projects/story-example/global-visual",
    },
    deadlineAt,
  });

const successGlobalVisualResult = (assignment: GlobalVisualAssignment) =>
  buildGlobalVisualProductionResult({
    runId: assignment.runId,
    storyId: assignment.storyId,
    assignmentFingerprint: assignment.assignmentFingerprint,
    requirementsFingerprint: assignment.requirementsFingerprint,
    status: "success",
    globalVisualPackage: {
      repositoryPath:
        "src/projects/story-example/global-visual/generated/global-visual-package.generated.json",
      packageFingerprint: sha("a"),
    },
    globalVisualPlanFingerprint: sha("b"),
    rendererSourceGraphFingerprint: sha("c"),
    selectedResourcesFingerprint: sha("d"),
    mechanicalCheckFingerprint: sha("e"),
  });

const createFixture = async (context: TestContext, deadlineAt?: string) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-watch-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const fixture = await createProductionFixture(context, rootDir);
  await markProductionBaselineReady(fixture);
  const assignments = createAssignments({
    runId: fixture.runId,
    requirementsFingerprint: fixture.requirements.requirementsFingerprint,
    readabilityPolicy: fixture.requirements.readabilityPolicy,
    deadlineAt,
  });
  const globalVisualAssignment = createGlobalVisualAssignment({
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
    globalVisualAssignmentFingerprint:
      globalVisualAssignment.assignmentFingerprint,
  });
  return { ...fixture, assignments, globalVisualAssignment };
};

const resolver =
  (
    assignments: readonly Extract<SceneAssignment, { schemaVersion: 3 }>[],
    globalVisualAssignment = createGlobalVisualAssignment({
      runId: assignments[0]!.runId,
      requirementsFingerprint: assignments[0]!.requirementsFingerprint,
      deadlineAt: assignments[0]!.deadlineAt,
    }),
  ) =>
  async () => ({ assignments, globalVisualAssignment });

test("accepts GlobalVisual first, waits for Scenes, and triggers render-ready once", async (context) => {
  const fixture = await createFixture(context);
  const [opening, conclusion] = fixture.assignments;
  await writeSceneProductionResult({
    rootDir: fixture.rootDir,
    result: successResult(conclusion),
  });
  await writeGlobalVisualProductionResult({
    rootDir: fixture.rootDir,
    result: successGlobalVisualResult(fixture.globalVisualAssignment),
  });
  let sleeps = 0;
  let renderReadyCalls = 0;
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
    resolveAssignments: resolver(
      fixture.assignments,
      fixture.globalVisualAssignment,
    ),
    verifySuccess: async () => undefined,
    verifyGlobalVisualSuccess: async () => undefined,
    renderReady: async () => {
      renderReadyCalls += 1;
    },
  });
  assert.equal(watched.status, "render-ready-running");
  assert.equal(sleeps, 1);
  assert.equal(renderReadyCalls, 1);
  const loaded = await readProductionRunStore(fixture);
  assert.equal(loaded.state.state, "render-ready-running");
  assert.deepEqual(
    new Set(
      loaded.state.acceptedSceneResults.map(({ meaningId }) => meaningId),
    ),
    new Set(["opening", "conclusion"]),
  );
  assert.equal(loaded.state.schemaVersion, 1);
  assert.equal(
    loaded.state.acceptedGlobalVisualResult?.resultFingerprint,
    successGlobalVisualResult(fixture.globalVisualAssignment).resultFingerprint,
  );

  const repeated = await runProductionWatch({
    rootDir: fixture.rootDir,
    runId: fixture.runId,
    clock: () => FIXED_PRODUCTION_NOW,
    scheduler: { sleep: async () => assert.fail("must not wait") },
    resolveAssignments: resolver(
      fixture.assignments,
      fixture.globalVisualAssignment,
    ),
    verifySuccess: async () => undefined,
    verifyGlobalVisualSuccess: async () => undefined,
    renderReady: async () => {
      renderReadyCalls += 1;
    },
  });
  assert.equal(repeated.noOp, true);
  assert.equal(renderReadyCalls, 2);
});

test("keeps all Scenes accepted until the GlobalVisual result arrives", async (context) => {
  const fixture = await createFixture(context);
  for (const assignment of fixture.assignments) {
    await writeSceneProductionResult({
      rootDir: fixture.rootDir,
      result: successResult(assignment),
    });
  }
  let sleeps = 0;
  const watched = await runProductionWatch({
    rootDir: fixture.rootDir,
    runId: fixture.runId,
    clock: () => FIXED_PRODUCTION_NOW,
    scheduler: {
      sleep: async () => {
        sleeps += 1;
        await writeGlobalVisualProductionResult({
          rootDir: fixture.rootDir,
          result: successGlobalVisualResult(fixture.globalVisualAssignment),
        });
      },
    },
    resolveAssignments: resolver(
      fixture.assignments,
      fixture.globalVisualAssignment,
    ),
    verifySuccess: async () => undefined,
    verifyGlobalVisualSuccess: async () => undefined,
    renderReady: async () => undefined,
  });
  assert.equal(sleeps, 1);
  assert.equal(watched.status, "render-ready-running");
});

test("accepts interleaved Scene, GlobalVisual, and Scene results", async (context) => {
  const fixture = await createFixture(context);
  await writeSceneProductionResult({
    rootDir: fixture.rootDir,
    result: successResult(fixture.assignments[0]),
  });
  let sleeps = 0;
  const watched = await runProductionWatch({
    rootDir: fixture.rootDir,
    runId: fixture.runId,
    clock: () => FIXED_PRODUCTION_NOW,
    scheduler: {
      sleep: async () => {
        sleeps += 1;
        await writeGlobalVisualProductionResult({
          rootDir: fixture.rootDir,
          result: successGlobalVisualResult(fixture.globalVisualAssignment),
        });
        await writeSceneProductionResult({
          rootDir: fixture.rootDir,
          result: successResult(fixture.assignments[1]),
        });
      },
    },
    resolveAssignments: resolver(
      fixture.assignments,
      fixture.globalVisualAssignment,
    ),
    verifySuccess: async () => undefined,
    verifyGlobalVisualSuccess: async () => undefined,
    renderReady: async () => undefined,
  });
  assert.equal(sleeps, 1);
  assert.equal(watched.status, "render-ready-running");
});

test("times out a missing GlobalVisual result after all Scenes", async (context) => {
  const fixture = await createFixture(context, "2026-08-04T00:00:01.000Z");
  for (const assignment of fixture.assignments) {
    await writeSceneProductionResult({
      rootDir: fixture.rootDir,
      result: successResult(assignment),
    });
  }
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
      resolveAssignments: resolver(
        fixture.assignments,
        fixture.globalVisualAssignment,
      ),
      verifySuccess: async () => undefined,
      verifyGlobalVisualSuccess: async () => undefined,
      renderReady: async () => undefined,
    }),
  );
  const loaded = await readProductionRunStore(fixture);
  assert.equal(loaded.state.failure?.code, "GLOBAL_VISUAL_RESULT_TIMEOUT");
  assert.equal(loaded.state.failure?.scope, "global-visual");
});

test("fails immediately on an explicit GlobalVisual failure", async (context) => {
  const fixture = await createFixture(context);
  await writeGlobalVisualProductionResult({
    rootDir: fixture.rootDir,
    result: createGlobalVisualFailureResult({
      assignment: fixture.globalVisualAssignment,
      code: "GLOBAL_VISUAL_BLOCKED",
      description: "The frozen global visual contract cannot be satisfied.",
      redactionApplied: false,
      commandId: "production-global-visual-fail",
    }),
  });
  await assert.rejects(() =>
    runProductionWatch({
      rootDir: fixture.rootDir,
      runId: fixture.runId,
      clock: () => FIXED_PRODUCTION_NOW,
      scheduler: { sleep: async () => undefined },
      resolveAssignments: resolver(
        fixture.assignments,
        fixture.globalVisualAssignment,
      ),
      verifySuccess: async () => undefined,
      verifyGlobalVisualSuccess: async () => undefined,
      renderReady: async () => undefined,
    }),
  );
  assert.equal(
    (await readProductionRunStore(fixture)).state.failure?.code,
    "GLOBAL_VISUAL_BLOCKED",
  );
});

test("fails closed for malformed stale and symlink GlobalVisual results", async (context) => {
  for (const variant of ["malformed", "stale", "symlink"] as const) {
    await context.test(variant, async (child) => {
      const fixture = await createFixture(child);
      const resultPath = join(
        fixture.rootDir,
        ".producer-runs",
        fixture.runId,
        "global-visual-result.json",
      );
      if (variant === "malformed") {
        await writeFile(resultPath, "{malformed\n");
      } else if (variant === "stale") {
        const stale = buildGlobalVisualProductionResult({
          ...successGlobalVisualResult(fixture.globalVisualAssignment),
          assignmentFingerprint: sha("0"),
        });
        await writeFile(resultPath, `${JSON.stringify(stale)}\n`);
      } else {
        const target = join(fixture.rootDir, "global-result-target.json");
        await writeFile(
          target,
          `${JSON.stringify(successGlobalVisualResult(fixture.globalVisualAssignment))}\n`,
        );
        await symlink(target, resultPath);
      }
      await assert.rejects(() =>
        runProductionWatch({
          rootDir: fixture.rootDir,
          runId: fixture.runId,
          clock: () => FIXED_PRODUCTION_NOW,
          scheduler: { sleep: async () => undefined },
          resolveAssignments: resolver(
            fixture.assignments,
            fixture.globalVisualAssignment,
          ),
          verifySuccess: async () => undefined,
          verifyGlobalVisualSuccess: async () => undefined,
          renderReady: async () => undefined,
        }),
      );
      assert.equal(
        (await readProductionRunStore(fixture)).state.failure?.code,
        variant === "stale"
          ? "STALE_GLOBAL_VISUAL_RESULT"
          : "GLOBAL_VISUAL_RESULT_MALFORMED",
      );
    });
  }
});

test("detects mutation after accepting a GlobalVisual result", async (context) => {
  const fixture = await createFixture(context);
  await writeGlobalVisualProductionResult({
    rootDir: fixture.rootDir,
    result: successGlobalVisualResult(fixture.globalVisualAssignment),
  });
  const resultPath = join(
    fixture.rootDir,
    ".producer-runs",
    fixture.runId,
    "global-visual-result.json",
  );
  let sleeps = 0;
  await assert.rejects(() =>
    runProductionWatch({
      rootDir: fixture.rootDir,
      runId: fixture.runId,
      clock: () => FIXED_PRODUCTION_NOW,
      scheduler: {
        sleep: async () => {
          sleeps += 1;
          const changed = buildGlobalVisualProductionResult({
            ...successGlobalVisualResult(fixture.globalVisualAssignment),
            mechanicalCheckFingerprint: sha("0"),
          });
          await writeFile(resultPath, `${JSON.stringify(changed)}\n`);
        },
      },
      resolveAssignments: resolver(
        fixture.assignments,
        fixture.globalVisualAssignment,
      ),
      verifySuccess: async () => undefined,
      verifyGlobalVisualSuccess: async () => undefined,
      renderReady: async () => undefined,
    }),
  );
  assert.equal(sleeps, 1);
  assert.equal(
    (await readProductionRunStore(fixture)).state.failure?.code,
    "STALE_GLOBAL_VISUAL_RESULT",
  );
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
  let renderReadyCalls = 0;
  await assert.rejects(() =>
    runProductionWatch({
      rootDir: fixture.rootDir,
      runId: fixture.runId,
      clock: () => FIXED_PRODUCTION_NOW,
      scheduler: { sleep: async () => assert.fail("must not wait") },
      resolveAssignments: resolver(fixture.assignments),
      verifySuccess: async () => undefined,
      renderReady: async () => {
        renderReadyCalls += 1;
      },
    }),
  );
  const loaded = await readProductionRunStore(fixture);
  assert.equal(loaded.state.state, "failed");
  assert.equal(loaded.state.failure?.code, "SCENE_BLOCKED");
  assert.equal(renderReadyCalls, 0);
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
        renderReady: async () => undefined,
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
        renderReady: async () => undefined,
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
        renderReady: async () => undefined,
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
      renderReady: async () => undefined,
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
    verifyGlobalVisualSuccess: async () => undefined,
    renderReady: async () => undefined,
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
        verifyGlobalVisualSuccess: async () => undefined,
        renderReady: async () => undefined,
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
  await writeGlobalVisualProductionResult({
    rootDir: fixture.rootDir,
    result: successGlobalVisualResult(fixture.globalVisualAssignment),
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
      renderReady: async () => undefined,
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
      renderReady: async () => undefined,
    }),
  );
  assert.deepEqual(await readFile(written.resultPath), before);
});

import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";

import {
  buildGlobalVisualAssignment,
  buildGlobalVisualProductionResult,
  buildProductionOwnerReceipt,
  buildProductionOwnerResult,
  buildSceneAssignment,
  buildSceneProductionResult,
  buildSceneTaskInputV5,
  buildSilentScenePreset,
  type GlobalVisualAssignment,
  type ProductionReadabilityPolicy,
  type SceneAssignment,
} from "../../src/contracts";
import {
  acquireProductionRunLock,
  appendProductionRunEvent,
  readProductionRunStore,
} from "../../scripts/production/adapters/run-store";
import { writeOwnerResult } from "../../scripts/production/adapters/owner-inbox";
import { createProductionStageEvent } from "../../scripts/production/domain/events";
import {
  createSceneFailureResult,
  writeSceneProductionResult,
} from "../../scripts/production/application/scene-submit";
import { writeGlobalVisualProductionResult } from "../../scripts/production/application/global-visual-submit";
import { runProductionFinalize } from "../../scripts/production/application/finalize";
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
  includeTemplate = false,
}: {
  readonly runId: string;
  readonly requirementsFingerprint: string;
  readonly readabilityPolicy: ProductionReadabilityPolicy;
  readonly includeTemplate?: boolean;
}) => {
  const authored = (["opening", "conclusion"] as const).map(
    (meaningId, index) => {
      const taskInput = buildSceneTaskInputV5({
        storyId: "story-example",
        meaningId,
        storyBeat: {
          kind: "narrated-scene",
          meaningId,
          narrativePurpose: "Explain one immutable step.",
          ttsChunks: [{ chunkId: `${meaningId}-01`, ttsText: "A" }],
          explicitPauses: [{ afterChunkId: `${meaningId}-01`, pauseMs: 250 }],
        },
        sourceReferences: [],
        timingBeat: {
          kind: "narrated-scene",
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
          previousSummary: index === 0 ? null : "Opening.",
          nextMeaningId: index === 0 ? "conclusion" : null,
          nextSummary: index === 0 ? "Conclusion." : null,
          continuityBrief: "Keep one visual system.",
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
          visualIntent: "Show the step.",
          compositionIntent: "Use one axis.",
          motionIntent: "Reveal by frame.",
          soundIntent: "No local sound.",
          continuityBrief: "Keep one visual system.",
          candidateResourceIds: [],
          allowedSnapshotCards: [],
        },
        additionalRequirements: [],
      });
    },
  );
  if (!includeTemplate) return authored;
  const preset = buildSilentScenePreset({
    presetId: "copied-template-v1",
    durationInFrames: 15,
    visualIntent: "Render the copied template.",
    soundIntent: "No local sound.",
    resourceIds: [],
    implementation: {
      kind: "template-copy",
      templateId: "copied-template-v1",
      templateFingerprint: sha("8"),
      instanceFingerprint: sha("9"),
      rendererSourceFingerprint: sha("a"),
      soundCues: [],
    },
  });
  const meaningId = "configured-template-scene";
  const taskInput = buildSceneTaskInputV5({
    storyId: "story-example",
    meaningId,
    storyBeat: {
      kind: "silent-scene",
      meaningId,
      narrativePurpose: "Render one copied Scene template.",
      preset,
    },
    sourceReferences: [],
    timingBeat: {
      kind: "silent-scene",
      meaningId,
      presetFingerprint: preset.presetFingerprint,
      presetDurationInFrames: 15,
      startFrame: 0,
      endFrame: 15,
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
      previousMeaningId: null,
      previousSummary: null,
      nextMeaningId: "opening",
      nextSummary: "Opening.",
      continuityBrief: "Hand the copied Scene to the authored opening.",
    },
    allowedDirectories: {
      sceneRoot: `src/projects/story-example/scenes/${meaningId}`,
      publicAssetRoot: `public/projects/story-example/scenes/${meaningId}`,
    },
  });
  const template = buildSceneAssignment({
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
      visualIntent: preset.visualIntent,
      compositionIntent: "Use the copied composition.",
      motionIntent: "Use the copied motion.",
      soundIntent: preset.soundIntent,
      continuityBrief: "Hand the copied Scene to content.",
      candidateResourceIds: [],
      allowedSnapshotCards: [],
    },
    additionalRequirements: [],
  });
  return [template, ...authored];
};

const createGlobalAssignment = ({
  runId,
  requirementsFingerprint,
}: {
  readonly runId: string;
  readonly requirementsFingerprint: string;
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
  });

const createFixture = async (
  context: TestContext,
  options: { readonly includeTemplate?: boolean } = {},
) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-owner-finalize-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const fixture = await createProductionFixture(context, rootDir);
  await markProductionBaselineReady(fixture);
  const assignments = createAssignments({
    runId: fixture.runId,
    requirementsFingerprint: fixture.requirements.requirementsFingerprint,
    readabilityPolicy: fixture.requirements.readabilityPolicy,
    includeTemplate: options.includeTemplate,
  });
  const globalVisualAssignment = createGlobalAssignment({
    runId: fixture.runId,
    requirementsFingerprint: fixture.requirements.requirementsFingerprint,
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

const successScene = (
  assignment: Extract<SceneAssignment, { schemaVersion: 5 }>,
) =>
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
    sceneCompositionBoundaryVersion: assignment.sceneCompositionBoundaryVersion,
    occurredAt: FIXED_PRODUCTION_NOW.toISOString(),
    status: "success",
    scenePackage: {
      repositoryPath: `src/projects/story-example/scenes/${assignment.meaningId}/generated/scene-package.generated.json`,
      packageFingerprint: sha(assignment.meaningId === "opening" ? "8" : "9"),
    },
    rendererSourceGraphFingerprint: sha("a"),
    selectedResourcesFingerprint: sha("b"),
    fidelityReceiptFingerprint: sha("c"),
    mechanicalCheckFingerprint: sha("d"),
  });

const successGlobal = (assignment: GlobalVisualAssignment) =>
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

const readyReceipt = ({
  fixture,
  owner,
}: {
  readonly fixture: Awaited<ReturnType<typeof createFixture>>;
  readonly owner: {
    ownerKind: "scene" | "global-visual" | "cover";
    meaningId: string | null;
    assignmentFingerprint: string;
  };
}) => {
  const scene =
    owner.ownerKind === "scene"
      ? fixture.assignments.find(
          ({ meaningId }) => meaningId === owner.meaningId,
        )!
      : null;
  return buildProductionOwnerReceipt({
    runId: fixture.runId,
    storyId: fixture.source.story.storyId,
    ...owner,
    taskInputFingerprint: scene?.taskInput.taskInputFingerprint ?? null,
    requirementsFingerprint:
      owner.ownerKind === "cover"
        ? null
        : fixture.requirements.requirementsFingerprint,
    inputFingerprints: [
      { artifactId: "assignment", fingerprint: owner.assignmentFingerprint },
    ],
    outputManifest: [],
    occurredAt: FIXED_PRODUCTION_NOW.toISOString(),
    status: "owner-ready",
  });
};

const storeReadyOutcome = async ({
  fixture,
  owner,
}: {
  readonly fixture: Awaited<ReturnType<typeof createFixture>>;
  readonly owner: {
    ownerKind: "scene" | "global-visual" | "cover";
    meaningId: string | null;
    assignmentFingerprint: string;
  };
}) => {
  const receipt = readyReceipt({ fixture, owner });
  let formalResult: Readonly<{
    repositoryPath: string;
    fingerprint: string;
  }> | null = null;
  if (owner.ownerKind === "scene") {
    const assignment = fixture.assignments.find(
      ({ meaningId }) => meaningId === owner.meaningId,
    )!;
    const result = successScene(assignment);
    await writeSceneProductionResult({ rootDir: fixture.rootDir, result });
    formalResult = {
      repositoryPath: `.producer-runs/${fixture.runId}/scene-results/${owner.meaningId}.json`,
      fingerprint: result.resultFingerprint,
    };
  } else if (owner.ownerKind === "global-visual") {
    const result = successGlobal(fixture.globalVisualAssignment);
    await writeGlobalVisualProductionResult({
      rootDir: fixture.rootDir,
      result,
    });
    formalResult = {
      repositoryPath: `.producer-runs/${fixture.runId}/global-visual-result.json`,
      fingerprint: result.resultFingerprint,
    };
  } else {
    formalResult = {
      repositoryPath:
        "src/projects/story-example/delivery/cover/results/result.json",
      fingerprint: sha("f"),
    };
  }
  const result = buildProductionOwnerResult({
    runId: fixture.runId,
    storyId: fixture.source.story.storyId,
    ...owner,
    receiptFingerprint: receipt.receiptFingerprint,
    status: "accepted-ready",
    formalResult,
    occurredAt: FIXED_PRODUCTION_NOW.toISOString(),
  });
  await writeOwnerResult({ rootDir: fixture.rootDir, result });
  return { receipt, result } as const;
};

const markRenderReady = async ({
  rootDir,
  runId,
  lock: providedLock,
}: {
  rootDir: string;
  runId: string;
  lock?: Awaited<ReturnType<typeof acquireProductionRunLock>>;
}) => {
  const loaded = await readProductionRunStore({ rootDir, runId });
  const ownsLock = providedLock === undefined;
  const lock =
    providedLock ??
    (await acquireProductionRunLock({
      rootDir,
      runId,
      ownerId: "test-render-ready",
      acquiredAt: FIXED_PRODUCTION_NOW.toISOString(),
    }));
  try {
    await appendProductionRunEvent({
      rootDir,
      runId,
      lock,
      event: createProductionStageEvent({
        schemaVersion: loaded.run.schemaVersion,
        type: "render-ready",
        runId,
        storyId: loaded.run.storyId,
        sequence: loaded.state.lastSequence + 1,
        eventId: `render-ready-${loaded.state.lastSequence + 1}`,
        stageId: "render-ready",
        attempt: 1,
        occurredAt: FIXED_PRODUCTION_NOW.toISOString(),
        commandId: "production-render-ready",
        previousStateFingerprint: loaded.state.stateFingerprint,
        inputFingerprints: [
          {
            artifactId: "requirements",
            fingerprint: loaded.run.requirementsFingerprint,
          },
        ],
        outputArtifacts: [
          {
            artifactId: "production-render-plan",
            repositoryPath: "plan.json",
            fingerprint: sha("1"),
          },
          {
            artifactId: "production-render-ready",
            repositoryPath: "ready.json",
            fingerprint: sha("2"),
          },
        ],
        status: "render-ready",
        handoff: "awaiting-automatic-delivery",
      }),
    });
  } finally {
    if (ownsLock) await lock.release();
  }
  return { runId, status: "render-ready", noOp: false } as const;
};

const dependenciesFor = (
  fixture: Awaited<ReturnType<typeof createFixture>>,
  processOwner: NonNullable<
    Parameters<typeof runProductionFinalize>[0]["dependencies"]
  >["processOwner"],
) => ({
  checkAgentBoundary: async () => ({ status: "current" as const }),
  writeAgentBoundary: async () => undefined,
  readReceipt: async ({
    ownerKind,
    meaningId,
    assignmentFingerprint,
  }: {
    ownerKind: "scene" | "global-visual" | "cover";
    meaningId: string | null;
    assignmentFingerprint: string;
  }) =>
    readyReceipt({
      fixture,
      owner: { ownerKind, meaningId, assignmentFingerprint },
    }),
  resolveAssignments: async () => ({
    assignments: fixture.assignments,
    globalVisualAssignment: fixture.globalVisualAssignment,
  }),
  resolveCoverOwner: async () => ({
    ownerKind: "cover" as const,
    meaningId: null,
    assignmentFingerprint: sha("f"),
  }),
  processOwner,
  renderReady: markRenderReady,
});

test("agent write boundary violation returns before receipt or ledger mutation", async (context) => {
  const fixture = await createFixture(context);
  const runRoot = join(fixture.rootDir, `.producer-runs/${fixture.runId}`);
  const beforeState = await readFile(join(runRoot, "state.generated.json"));
  const beforeEvents = await readdir(join(runRoot, "events"));
  const beforeResults = await readdir(join(runRoot, "owner-results"));
  const result = await runProductionFinalize({
    rootDir: fixture.rootDir,
    runId: fixture.runId,
    clock: () => FIXED_PRODUCTION_NOW,
    dependencies: {
      ...dependenciesFor(fixture, async () => assert.fail("must not process")),
      checkAgentBoundary: async () => ({ status: "violated" as const }),
    },
  });
  assert.deepEqual(result, {
    runId: fixture.runId,
    storyId: fixture.source.story.storyId,
    status: "agent-write-boundary-violated",
    phase: "owner-authoring",
  });
  assert.deepEqual(
    await readFile(join(runRoot, "state.generated.json")),
    beforeState,
  );
  assert.deepEqual(await readdir(join(runRoot, "events")), beforeEvents);
  assert.deepEqual(
    await readdir(join(runRoot, "owner-results")),
    beforeResults,
  );
});

test("missing required receipts return once with stable order and no ledger mutation", async (context) => {
  const fixture = await createFixture(context);
  const runRoot = join(fixture.rootDir, `.producer-runs/${fixture.runId}`);
  const beforeState = await readFile(join(runRoot, "state.generated.json"));
  const beforeEvents = await readdir(join(runRoot, "events"));
  const beforeResults = await readdir(join(runRoot, "owner-results"));
  const result = await runProductionFinalize({
    rootDir: fixture.rootDir,
    runId: fixture.runId,
    clock: () => new Date("2036-08-04T00:00:00.000Z"),
    dependencies: {
      ...dependenciesFor(fixture, async () => assert.fail("must not process")),
      readReceipt: async () => null,
    },
  });
  assert.equal(result.status, "owner-receipts-incomplete");
  assert.deepEqual(
    "missingOwnerAssignments" in result
      ? result.missingOwnerAssignments.map(
          ({ ownerKind, meaningId }) =>
            `${ownerKind}:${meaningId ?? "story"}`,
        )
      : [],
    ["scene:conclusion", "scene:opening", "global-visual:story"],
  );
  const loaded = await readProductionRunStore(fixture);
  assert.equal(loaded.state.state, "scene-inputs-frozen");
  assert.equal(loaded.state.failure, null);
  assert.deepEqual(
    await readFile(join(runRoot, "state.generated.json")),
    beforeState,
  );
  assert.deepEqual(await readdir(join(runRoot, "events")), beforeEvents);
  assert.deepEqual(await readdir(join(runRoot, "owner-results")), beforeResults);
});

test("template-copied Scene results converge without an owner task or receipt", async (context) => {
  const fixture = await createFixture(context, { includeTemplate: true });
  const templateAssignment = fixture.assignments[0];
  assert.equal(
    templateAssignment.taskInput.storyBeat.kind === "silent-scene"
      ? templateAssignment.taskInput.storyBeat.preset.implementation.kind
      : null,
    "template-copy",
  );
  await writeSceneProductionResult({
    rootDir: fixture.rootDir,
    result: successScene(templateAssignment),
  });
  const processedOwners: string[] = [];
  const processOwner = async (request: {
    owner: {
      ownerKind: "scene" | "global-visual" | "cover";
      meaningId: string | null;
      assignmentFingerprint: string;
    };
  }) => {
    processedOwners.push(
      `${request.owner.ownerKind}:${request.owner.meaningId ?? "story"}`,
    );
    return storeReadyOutcome({ fixture, owner: request.owner });
  };
  const finalized = await runProductionFinalize({
    rootDir: fixture.rootDir,
    runId: fixture.runId,
    clock: () => FIXED_PRODUCTION_NOW,
    dependencies: {
      ...dependenciesFor(fixture, processOwner as never),
      deliveryBuild: async () => ({
        projectId: fixture.source.story.storyId,
        deliveryId: "story-example-delivery-test",
        status: "delivery-render-started",
        noOp: false,
      }),
    },
  });
  assert.equal(finalized.status, "delivery-render-started", JSON.stringify(finalized));
  assert.equal(
    processedOwners.includes("scene:configured-template-scene"),
    false,
  );
  const loaded = await readProductionRunStore(fixture);
  assert.deepEqual(
    loaded.state.acceptedSceneResults.map(({ meaningId }) => meaningId),
    ["configured-template-scene", "opening", "conclusion"],
  );
});

test("finalize remains a single writer and rejects an unknown inbox identity", async (context) => {
  await context.test("single writer lock", async (child) => {
    const fixture = await createFixture(child);
    const lock = await acquireProductionRunLock({
      rootDir: fixture.rootDir,
      runId: fixture.runId,
      ownerId: "competing-finalize",
      acquiredAt: FIXED_PRODUCTION_NOW.toISOString(),
    });
    try {
      await assert.rejects(
        runProductionFinalize({
          rootDir: fixture.rootDir,
          runId: fixture.runId,
          dependencies: dependenciesFor(fixture, async () => null),
        }),
        /active writer lock/iu,
      );
    } finally {
      await lock.release();
    }
  });
  await context.test("unknown inbox entry", async (child) => {
    const fixture = await createFixture(child);
    await writeFile(
      join(
        fixture.rootDir,
        `.producer-runs/${fixture.runId}/owner-receipts/unknown.json`,
      ),
      "{}\n",
    );
    await assert.rejects(
      runProductionFinalize({
        rootDir: fixture.rootDir,
        runId: fixture.runId,
        clock: () => FIXED_PRODUCTION_NOW,
        dependencies: dependenciesFor(fixture, async () => null),
      }),
      /unknown entry/iu,
    );
    assert.equal(
      (await readProductionRunStore(fixture)).state.state,
      "scene-inputs-frozen",
    );
  });
  await context.test("unknown formal result identity", async (child) => {
    const fixture = await createFixture(child);
    await writeFile(
      join(
        fixture.rootDir,
        `.producer-runs/${fixture.runId}/scene-results/unknown.json`,
      ),
      "{}\n",
    );
    await assert.rejects(
      runProductionFinalize({
        rootDir: fixture.rootDir,
        runId: fixture.runId,
        clock: () => FIXED_PRODUCTION_NOW,
        dependencies: dependenciesFor(fixture, async () => null),
      }),
      /unknown entry/iu,
    );
    assert.equal(
      (await readProductionRunStore(fixture)).state.state,
      "scene-inputs-frozen",
    );
  });
  await context.test("unknown pending identity", async (child) => {
    const fixture = await createFixture(child);
    await writeFile(
      join(
        fixture.rootDir,
        `.producer-runs/${fixture.runId}/owner-receipts/.unknown.json.pending`,
      ),
      "{}\n",
    );
    await assert.rejects(
      runProductionFinalize({
        rootDir: fixture.rootDir,
        runId: fixture.runId,
        clock: () => FIXED_PRODUCTION_NOW,
        dependencies: dependenciesFor(fixture, async () => null),
      }),
      /pending entry is unknown/iu,
    );
    assert.equal(
      (await readProductionRunStore(fixture)).state.state,
      "scene-inputs-frozen",
    );
  });
});

test("one foreground finalize processes owners serially and Cover gates delivery only", async (context) => {
  const fixture = await createFixture(context);
  const order: string[] = [];
  let coverAvailable = false;
  let deliveryCalls = 0;
  const processOwner = async (request: {
    owner: {
      ownerKind: "scene" | "global-visual" | "cover";
      meaningId: string | null;
      assignmentFingerprint: string;
    };
  }) => {
    order.push(
      `${request.owner.ownerKind}:${request.owner.meaningId ?? "story"}`,
    );
    if (request.owner.ownerKind === "cover") {
      assert.equal(
        (await readProductionRunStore(fixture)).state.state,
        "render-ready",
      );
      if (!coverAvailable) return null;
    }
    return storeReadyOutcome({ fixture, owner: request.owner });
  };
  const blocked = await runProductionFinalize({
    rootDir: fixture.rootDir,
    runId: fixture.runId,
    clock: () => FIXED_PRODUCTION_NOW,
    dependencies: {
      ...dependenciesFor(fixture, processOwner as never),
      deliveryBuild: async () => {
        deliveryCalls += 1;
        return {
          projectId: fixture.source.story.storyId,
          deliveryId: "story-example-delivery-test",
          status: "delivery-render-started" as const,
          noOp: false as const,
        };
      },
    },
  });
  assert.equal(
    blocked.status,
    "render-ready-delivery-blocked",
    JSON.stringify(blocked),
  );
  assert.equal(deliveryCalls, 0);
  coverAvailable = true;
  const delivered = await runProductionFinalize({
    rootDir: fixture.rootDir,
    runId: fixture.runId,
    clock: () => FIXED_PRODUCTION_NOW,
    dependencies: {
      ...dependenciesFor(fixture, processOwner as never),
      deliveryBuild: async () => {
        deliveryCalls += 1;
        return {
          projectId: fixture.source.story.storyId,
          deliveryId: "story-example-delivery-test",
          status: "delivery-render-started" as const,
          noOp: false as const,
        };
      },
    },
  });
  assert.equal(delivered.status, "delivery-render-started");
  assert.equal(deliveryCalls, 1);
  assert.deepEqual(order.slice(0, 4), [
    "scene:conclusion",
    "scene:opening",
    "global-visual:story",
    "cover:story",
  ]);
});

test("Cover fixed-check failure happens only after render-ready and blocks delivery without failing production", async (context) => {
  const fixture = await createFixture(context);
  let deliveryCalls = 0;
  const processOwner = async (request: {
    owner: {
      ownerKind: "scene" | "global-visual" | "cover";
      meaningId: string | null;
      assignmentFingerprint: string;
    };
  }) => {
    if (request.owner.ownerKind === "cover") {
      assert.equal(
        (await readProductionRunStore(fixture)).state.state,
        "render-ready",
      );
      throw new Error("injected Cover fixed-check failure");
    }
    return storeReadyOutcome({ fixture, owner: request.owner });
  };
  await assert.rejects(
    runProductionFinalize({
      rootDir: fixture.rootDir,
      runId: fixture.runId,
      clock: () => FIXED_PRODUCTION_NOW,
      dependencies: {
        ...dependenciesFor(fixture, processOwner as never),
        deliveryBuild: async () => {
          deliveryCalls += 1;
          throw new Error("must not deliver");
        },
      },
    }),
    /Cover fixed-check failure/iu,
  );
  const loaded = await readProductionRunStore(fixture);
  assert.equal(loaded.state.state, "render-ready");
  assert.equal(loaded.state.failure, null);
  assert.equal(deliveryCalls, 0);
});

test("idempotent replay accepts results once and a later Cover can launch delivery", async (context) => {
  const fixture = await createFixture(context);
  let coverAvailable = false;
  const processOwner = async (request: {
    owner: {
      ownerKind: "scene" | "global-visual" | "cover";
      meaningId: string | null;
      assignmentFingerprint: string;
    };
  }) => {
    if (request.owner.ownerKind === "cover" && !coverAvailable) return null;
    return storeReadyOutcome({ fixture, owner: request.owner });
  };
  const incomplete = await runProductionFinalize({
    rootDir: fixture.rootDir,
    runId: fixture.runId,
    clock: () => FIXED_PRODUCTION_NOW,
    dependencies: {
      ...dependenciesFor(fixture, processOwner as never),
      readReceipt: async (request) =>
        request.ownerKind === "scene" && request.meaningId === "conclusion"
          ? null
          : readyReceipt({
              fixture,
              owner: {
                ownerKind: request.ownerKind,
                meaningId: request.meaningId,
                assignmentFingerprint: request.assignmentFingerprint,
              },
            }),
    },
  });
  assert.equal(incomplete.status, "owner-receipts-incomplete");
  const partial = await readProductionRunStore(fixture);
  assert.equal(partial.state.state, "scene-inputs-frozen");
  assert.deepEqual(partial.state.acceptedSceneResults, []);
  let coverCheckpoint: unknown = null;
  const blocked = await runProductionFinalize({
    rootDir: fixture.rootDir,
    runId: fixture.runId,
    clock: () => FIXED_PRODUCTION_NOW,
    dependencies: {
      ...dependenciesFor(fixture, processOwner as never),
      writeAgentBoundary: async (request) => {
        coverCheckpoint = request;
      },
    },
  });
  assert.equal(blocked.status, "render-ready-delivery-blocked");
  assert.deepEqual(coverCheckpoint, {
    rootDir: fixture.rootDir,
    runId: fixture.runId,
    storyId: fixture.source.story.storyId,
    phase: "cover-authoring-after-render-ready",
    allowedWriteScopes: [
      {
        kind: "directory",
        repositoryPath: "src/projects/story-example/delivery/cover",
      },
    ],
  });
  const resumed = await readProductionRunStore(fixture);
  assert.equal(resumed.state.state, "render-ready");
  assert.equal(
    resumed.events.filter(
      (event) =>
        event.type === "scene-result-accepted" && event.meaningId === "opening",
    ).length,
    1,
  );
  const protectedReplay = await runProductionFinalize({
    rootDir: fixture.rootDir,
    runId: fixture.runId,
    clock: () => FIXED_PRODUCTION_NOW,
    dependencies: {
      ...dependenciesFor(fixture, processOwner as never),
      checkAgentBoundary: async () => ({ status: "violated" as const }),
    },
  });
  assert.equal(protectedReplay.status, "agent-write-boundary-violated");
  assert.equal(
    "phase" in protectedReplay ? protectedReplay.phase : null,
    "cover-authoring-after-render-ready",
  );
  assert.equal(
    (await readProductionRunStore(fixture)).state.state,
    "render-ready",
  );
  coverAvailable = true;
  const delivered = await runProductionFinalize({
    rootDir: fixture.rootDir,
    runId: fixture.runId,
    clock: () => FIXED_PRODUCTION_NOW,
    dependencies: {
      ...dependenciesFor(fixture, processOwner as never),
      checkAgentBoundary: async (request) => {
        assert.equal(request.phase, "cover-authoring-after-render-ready");
        return { status: "current" as const };
      },
      deliveryBuild: async () => ({
        projectId: fixture.source.story.storyId,
        deliveryId: "story-example-delivery-test",
        status: "delivery-render-started" as const,
        noOp: false,
      }),
    },
  });
  assert.equal(delivered.status, "delivery-render-started");
});

test("explicit failed owner outcome becomes one immutable terminal failure", async (context) => {
  const fixture = await createFixture(context);
  const failedAssignment = fixture.assignments[0];
  const failedOwner = {
    ownerKind: "scene" as const,
    meaningId: failedAssignment.meaningId,
    assignmentFingerprint: failedAssignment.assignmentFingerprint,
  };
  const processOwner = async (request: { owner: typeof failedOwner }) => {
    if (
      request.owner.ownerKind !== "scene" ||
      request.owner.meaningId !== failedAssignment.meaningId
    )
      return null;
    const formal = createSceneFailureResult({
      assignment: failedAssignment,
      code: "OWNER_EXPLICIT_FAILURE",
      description: "The immutable assignment cannot be completed.",
      redactionApplied: false,
      occurredAt: FIXED_PRODUCTION_NOW.toISOString(),
      commandId: "production-scene-fail",
    });
    await writeSceneProductionResult({
      rootDir: fixture.rootDir,
      result: formal,
    });
    const ready = readyReceipt({ fixture, owner: failedOwner });
    const result = buildProductionOwnerResult({
      runId: fixture.runId,
      storyId: fixture.source.story.storyId,
      ...failedOwner,
      receiptFingerprint: ready.receiptFingerprint,
      status: "accepted-failed",
      formalResult: {
        repositoryPath: `.producer-runs/${fixture.runId}/scene-results/${failedAssignment.meaningId}.json`,
        fingerprint: formal.resultFingerprint,
      },
      occurredAt: FIXED_PRODUCTION_NOW.toISOString(),
    });
    await writeOwnerResult({ rootDir: fixture.rootDir, result });
    return { receipt: ready, result };
  };
  const finalized = await runProductionFinalize({
    rootDir: fixture.rootDir,
    runId: fixture.runId,
    clock: () => FIXED_PRODUCTION_NOW,
    dependencies: dependenciesFor(fixture, processOwner as never),
  });
  assert.equal(finalized.status, "production-failed");
  const loaded = await readProductionRunStore(fixture);
  assert.equal(loaded.state.state, "failed");
  assert.equal(loaded.state.failure?.code, "OWNER_EXPLICIT_FAILURE");
  assert.equal(
    loaded.events.filter((event) => event.type === "stage-failed").length,
    1,
  );
});

test("failed Cover receipt preserves render-ready and blocks automatic delivery", async (context) => {
  const fixture = await createFixture(context);
  let deliveryCalls = 0;
  const processOwner = async (request: {
    owner: {
      ownerKind: "scene" | "global-visual" | "cover";
      meaningId: string | null;
      assignmentFingerprint: string;
    };
  }) => {
    if (request.owner.ownerKind !== "cover") {
      return storeReadyOutcome({ fixture, owner: request.owner });
    }
    const receipt = buildProductionOwnerReceipt({
      runId: fixture.runId,
      storyId: fixture.source.story.storyId,
      ...request.owner,
      taskInputFingerprint: null,
      requirementsFingerprint: null,
      inputFingerprints: [
        {
          artifactId: "assignment",
          fingerprint: request.owner.assignmentFingerprint,
        },
      ],
      outputManifest: [],
      occurredAt: FIXED_PRODUCTION_NOW.toISOString(),
      status: "owner-failed",
      error: {
        code: "COVER_OWNER_FAILED",
        description: "Cover assignment cannot be completed.",
        redactionApplied: false,
      },
    });
    const result = buildProductionOwnerResult({
      runId: fixture.runId,
      storyId: fixture.source.story.storyId,
      ...request.owner,
      receiptFingerprint: receipt.receiptFingerprint,
      status: "accepted-failed",
      formalResult: null,
      occurredAt: FIXED_PRODUCTION_NOW.toISOString(),
    });
    await writeOwnerResult({ rootDir: fixture.rootDir, result });
    return { receipt, result };
  };
  const finalized = await runProductionFinalize({
    rootDir: fixture.rootDir,
    runId: fixture.runId,
    clock: () => FIXED_PRODUCTION_NOW,
    dependencies: {
      ...dependenciesFor(fixture, processOwner as never),
      deliveryBuild: async () => {
        deliveryCalls += 1;
        throw new Error("must not deliver");
      },
    },
  });
  assert.deepEqual(
    "reason" in finalized
      ? { status: finalized.status, reason: finalized.reason }
      : null,
    {
      status: "render-ready-delivery-blocked",
      reason: "cover-owner-failed",
    },
  );
  const loaded = await readProductionRunStore(fixture);
  assert.equal(loaded.state.state, "render-ready");
  assert.equal(loaded.state.failure, null);
  assert.equal(deliveryCalls, 0);
});

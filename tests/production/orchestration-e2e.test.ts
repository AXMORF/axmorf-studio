import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";

import {
  SceneAssignmentSchema,
  VisualStyleSpecSchema,
  buildProductionPreviewAssembly,
  buildProductionPreviewEvidence,
  buildProductionPreviewMechanicalCheck,
  buildSceneProductionBrief,
  buildSceneProductionResult,
  buildSceneProductionResultV2,
  buildSceneProductionResultV3,
  buildStoryResourcePool,
  computeGenerationInputFingerprint,
  computeVisualStyleFingerprint,
  generateSemanticTiming,
  type SceneAssignment,
  type SceneProductionResult,
} from "../../src/contracts";
import { capabilityDescriptorDeclarations } from "../../src/remotion/catalog/capability-descriptors";
import { styleDescriptorDeclarations } from "../../src/remotion/catalog/style-descriptors";
import { buildResourceCatalog } from "../../scripts/catalog/domain";
import { readProductionRunStore } from "../../scripts/production/adapters/run-store";
import {
  runProductionNarrative,
  type NarrativeProductionDependencies,
} from "../../scripts/production/narrative";
import {
  runProductionPostScene,
  type PostSceneProductionDependencies,
} from "../../scripts/production/post-scene";
import { runProductionSceneFreeze } from "../../scripts/production/scene-freeze";
import {
  createSceneFailureResult,
  writeSceneProductionResult,
} from "../../scripts/production/scene-submit";
import { runProductionWatch } from "../../scripts/production/watch";
import { buildValidSealedNarrationManifest } from "../fixtures/narrative";
import {
  FIXED_PRODUCTION_NOW,
  createProductionFixture,
  writeProductionJson,
} from "./fixture";
import {
  validPreviewAssemblyInput,
  validPreviewEvidenceInput,
} from "./preview-fixture";

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;

const fakeNarrativeDependencies = ({
  generationInputFingerprint,
  sealedNarrationFingerprint,
  semanticTimingFingerprint,
  completeAudioChecksum,
  autoCheckFingerprint,
  calls,
}: {
  readonly generationInputFingerprint: string;
  readonly sealedNarrationFingerprint: string;
  readonly semanticTimingFingerprint: string;
  readonly completeAudioChecksum: string;
  readonly autoCheckFingerprint: string;
  readonly calls: string[];
}): NarrativeProductionDependencies => {
  const narrationResult = {
    generationInputFingerprint,
    sealedNarrationFingerprint,
    semanticTimingFingerprint,
    completeAudioChecksum,
  };
  return {
    generateNarration: async () => {
      calls.push("fake-provider");
      return {
        providerAttemptFingerprint: sha("a"),
        generationInputFingerprint,
      };
    },
    sealNarration: async () => narrationResult,
    checkNarration: async () => narrationResult,
    generateRegistry: async () => undefined,
    checkRegistry: async () => ({
      compositionId: "StoryExample",
      generatedRegistryChecksum: sha("b"),
      projectRegistryEntryFingerprint: sha("c"),
      narrativeBaselineFingerprint: sha("d"),
    }),
    listCompositions: async () => undefined,
    renderBaseline: async () => ({
      transparentStillPath: "out/story-example/m3-transparent.png",
      transparentStillChecksum: sha("e"),
      captionStillPath: "out/story-example/m3-caption.png",
      captionStillChecksum: sha("f"),
      renderPath: "out/story-example/m3-baseline.mp4",
      renderChecksum: sha("0"),
    }),
    writeEvidence: async () => ({ evidenceFingerprint: sha("1") }),
    checkEvidence: async () => ({ evidenceFingerprint: sha("1") }),
    writeAutoCheck: async () => ({ reportFingerprint: autoCheckFingerprint }),
    checkAutoCheck: async () => ({ reportFingerprint: autoCheckFingerprint }),
  };
};

const createE2eFixture = async (context: TestContext) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-orchestration-e2e-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const fixture = await createProductionFixture(context, rootDir);
  const sealedNarration = buildValidSealedNarrationManifest();
  const timing = generateSemanticTiming({
    story: fixture.source.story,
    narration: fixture.source.narration,
    render: fixture.source.render,
    sealedNarration,
  });
  const autoCheckFingerprint = sha("2");
  const narrativeCalls: string[] = [];
  await runProductionNarrative({
    rootDir,
    runId: fixture.runId,
    clock: () => FIXED_PRODUCTION_NOW,
    dependencies: fakeNarrativeDependencies({
      generationInputFingerprint: computeGenerationInputFingerprint(
        fixture.source.story,
        fixture.source.narration,
      ),
      sealedNarrationFingerprint: sealedNarration.sealedNarrationFingerprint,
      semanticTimingFingerprint: timing.fingerprint,
      completeAudioChecksum: sealedNarration.completeAudio.checksum,
      autoCheckFingerprint,
      calls: narrativeCalls,
    }),
  });
  assert.deepEqual(narrativeCalls, ["fake-provider"]);

  const catalog = buildResourceCatalog([
    styleDescriptorDeclarations.find(
      ({ styleProfileId }) => styleProfileId === "editorial-tech",
    )!,
    capabilityDescriptorDeclarations.find(
      ({ id }) => id === "capability.motion",
    )!,
  ]);
  await writeProductionJson(
    join(fixture.projectDir, "generated/resource-catalog.generated.json"),
    catalog,
  );
  const styleEntry = catalog.entries.find(
    ({ descriptor }) => descriptor.id === "style.editorial-tech",
  )!;
  const visualStyle = VisualStyleSpecSchema.parse({
    schemaVersion: 1,
    storyId: "story-example",
    styleProfileId: "editorial-tech",
    resourceCatalogFingerprint: catalog.catalogFingerprint,
    artDirection: {
      medium: "Project-local vector diagrams.",
      palette: "Navy, cyan, amber, and white.",
      lighting: "Flat technical glow.",
      texture: "Clean matte fields.",
      compositionGrammar: "One focal system per Scene.",
      motionLanguage: "Frame-driven causal motion.",
      typography: "Compact technical labels.",
    },
    continuityRules: ["Preserve the same timing axis across both Scenes."],
    forbiddenTreatments: ["No CSS animation or remote assets."],
  });
  const visualStyleFingerprint = computeVisualStyleFingerprint({
    visualStyle,
    resolvedStyleDescriptorFingerprint: styleEntry.descriptorFingerprint,
  });
  await writeProductionJson(
    join(fixture.projectDir, "visual-style.json"),
    visualStyle,
  );
  await writeProductionJson(
    join(fixture.projectDir, "generated/semantic-timing.generated.json"),
    timing,
  );
  const pool = buildStoryResourcePool({
    storyId: "story-example",
    requirementsFingerprint: fixture.requirements.requirementsFingerprint,
    resourceCatalogFingerprint: catalog.catalogFingerprint,
    allowedResourceIds: [],
    allowedSnapshots: [],
    selfAuthoredVisualsAllowed: true,
  });
  await writeProductionJson(
    join(fixture.projectDir, "production/story-resource-pool.json"),
    pool,
  );
  const brief = buildSceneProductionBrief({
    storyId: "story-example",
    requirementsFingerprint: fixture.requirements.requirementsFingerprint,
    semanticTimingFingerprint: timing.fingerprint,
    visualStyleFingerprint,
    resourcePoolFingerprint: pool.poolFingerprint,
    sceneLocalSoundPolicy: "allowed",
    reviewPolicy: "mechanical-only",
    scenes: fixture.source.story.beats.map(({ meaningId }, index) => ({
      meaningId,
      visualIntent: "Show the cumulative timing boundary.",
      compositionIntent: "Use one left-to-right timing axis.",
      motionIntent: "Reveal the boundary frame by frame.",
      soundIntent: "No Scene-local sound is required.",
      continuityBrief:
        index === 0
          ? "Hand the timing axis to the conclusion."
          : "Inherit the opening timing axis unchanged.",
      candidateResourceIds: [],
      allowedSnapshotCards: [],
    })),
  });
  await writeProductionJson(
    join(fixture.projectDir, "production/scene-production-brief.json"),
    brief,
  );
  const frozen = await runProductionSceneFreeze({
    rootDir,
    runId: fixture.runId,
    clock: () => FIXED_PRODUCTION_NOW,
    verifyNarrativeAutoCheck: async () => autoCheckFingerprint,
  });
  const assignments = await Promise.all(
    frozen.assignmentPaths.map(async (path) =>
      SceneAssignmentSchema.parse(
        JSON.parse(await readFile(join(rootDir, path), "utf8")),
      ),
    ),
  );
  return { ...fixture, assignments };
};

const successResult = (assignment: SceneAssignment, index: number) =>
  (assignment.schemaVersion === 3
    ? buildSceneProductionResultV3
    : assignment.schemaVersion === 2
      ? buildSceneProductionResultV2
      : buildSceneProductionResult)({
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
      packageFingerprint: index === 0 ? sha("3") : sha("4"),
    },
    rendererSourceGraphFingerprint: sha("5"),
    selectedResourcesFingerprint: sha("6"),
    fidelityReceiptFingerprint: sha("7"),
    mechanicalCheckFingerprint: sha("8"),
    ...(assignment.schemaVersion !== 1
      ? {
          readabilityPolicyFingerprint:
            assignment.readabilityPolicy.policyFingerprint,
        }
      : {}),
    ...(assignment.schemaVersion === 3
      ? {
          sceneCompositionBoundaryVersion:
            assignment.sceneCompositionBoundaryVersion,
        }
      : {}),
  }) as Extract<SceneProductionResult, { status: "success" }>;

const fakePostSceneDependencies = ({
  requirementsFingerprint,
  packageIdentities,
}: {
  readonly requirementsFingerprint: string;
  readonly packageIdentities: readonly {
    readonly meaningId: string;
    readonly packageFingerprint: string;
  }[];
}): PostSceneProductionDependencies => {
  const assembly = buildProductionPreviewAssembly({
    ...validPreviewAssemblyInput,
    requirementsFingerprint,
    scenePackages: packageIdentities,
  });
  const evidence = buildProductionPreviewEvidence({
    ...validPreviewEvidenceInput,
    requirementsFingerprint,
    previewAssemblyFingerprint: assembly.assemblyFingerprint,
    sceneCoverageFingerprint: assembly.sceneCoverageFingerprint,
    rendererRegistryFingerprint: assembly.rendererRegistryFingerprint,
    storyVisualProjectionFingerprint: assembly.storyVisualProjectionFingerprint,
  });
  const check = buildProductionPreviewMechanicalCheck({
    storyId: assembly.storyId,
    requirementsFingerprint,
    previewAssemblyFingerprint: assembly.assemblyFingerprint,
    evidenceFingerprint: evidence.evidenceFingerprint,
    checks: {
      contracts: "pass",
      sceneCoverage: "pass",
      rendererRegistry: "pass",
      projections: "pass",
      composition: "pass",
      media: "pass",
      completeDecode: "pass",
      enhancementAbsence: "pass",
    },
    aggregateStatus: "mechanically-ready",
    handoff: "awaiting explicit user preview decision",
  });
  return {
    assertCurrentFreeze: async () => undefined,
    preparePreview: async () => assembly,
    projectRegistry: async () => ({
      compositionId: assembly.compositionId,
      registryChecksum: sha("9"),
    }),
    listCompositions: async () => undefined,
    renderPreview: async () => evidence.media.fullPreview,
    generateReviewMedia: async () => ({
      representativeStills: evidence.media.representativeStills,
      contactSheet: evidence.media.contactSheet,
    }),
    previewEvidence: async () => evidence,
    mechanicalCheck: async () => check,
    checkCurrentPreview: async () => ({ assembly, evidence, check }),
  };
};

const protectedArtifactPaths = [
  "src/projects/gps-relativity/generated/final-assembly.generated.json",
  "src/projects/gps-relativity/generated/final-mechanical-check.generated.json",
  "src/projects/gps-relativity/generated/final-preview-approval.generated.json",
  "src/projects/gps-relativity/generated/m8-final-preview-evidence.generated.json",
  "out/m8-gps-final-assembly/gps-relativity-m8-final-preview.mp4",
  "src/projects/product-comic-vertical/generated/final-assembly.generated.json",
  "src/projects/product-comic-vertical/generated/final-mechanical-check.generated.json",
  "src/projects/product-comic-vertical/generated/final-preview-approval.generated.json",
  "src/projects/product-comic-vertical/generated/final-preview-evidence.generated.json",
  "out/m9-product-comic-vertical/product-comic-vertical-final-preview.mp4",
] as const;

const checksumProtectedArtifacts = async () =>
  Promise.all(
    protectedArtifactPaths.map(async (path) => ({
      path,
      checksum: createHash("sha256")
        .update(Uint8Array.from(await readFile(join(process.cwd(), path))))
        .digest("hex"),
    })),
  );

test("fake provider plus two Scene successes reaches preview-ready byte-stably", async (context) => {
  const protectedBefore = await checksumProtectedArtifacts();
  const fixture = await createE2eFixture(context);
  assert.ok(fixture.assignments.every(({ schemaVersion }) => schemaVersion === 3));
  assert.ok(
    fixture.assignments.every(
      (assignment) =>
        assignment.schemaVersion === 3 &&
        assignment.taskInput.schemaVersion === 3 &&
        assignment.sceneCompositionBoundaryVersion ===
          assignment.taskInput.sceneCompositionBoundaryVersion,
    ),
  );
  const results = fixture.assignments.map(successResult);
  assert.ok(results.every(({ schemaVersion }) => schemaVersion === 3));
  for (const result of results.slice().reverse()) {
    await writeSceneProductionResult({ rootDir: fixture.rootDir, result });
  }
  const dependencies = fakePostSceneDependencies({
    requirementsFingerprint: fixture.requirements.requirementsFingerprint,
    packageIdentities: results.map(({ meaningId, scenePackage }) => ({
      meaningId,
      packageFingerprint: scenePackage.packageFingerprint,
    })),
  });
  const watched = await runProductionWatch({
    rootDir: fixture.rootDir,
    runId: fixture.runId,
    clock: () => FIXED_PRODUCTION_NOW,
    scheduler: { sleep: async () => assert.fail("all results already exist") },
    resolveAssignments: async () => ({ assignments: fixture.assignments }),
    verifySuccess: async () => undefined,
    postScene: (request) =>
      runProductionPostScene({
        ...request,
        clock: () => FIXED_PRODUCTION_NOW,
        dependencies,
      }),
  });
  assert.equal((watched as { status: string }).status, "preview-ready");
  const statePath = join(
    fixture.rootDir,
    ".producer-runs",
    fixture.runId,
    "state.generated.json",
  );
  const before = {
    bytes: await readFile(statePath),
    mtime: (await stat(statePath)).mtimeMs,
  };
  const repeated = await runProductionWatch({
    rootDir: fixture.rootDir,
    runId: fixture.runId,
    clock: () => new Date("2026-08-04T01:00:00.000Z"),
    scheduler: { sleep: async () => assert.fail("current rerun cannot wait") },
    resolveAssignments: async () => ({ assignments: fixture.assignments }),
    verifySuccess: async () => undefined,
    postScene: (request) =>
      runProductionPostScene({
        ...request,
        clock: () => new Date("2026-08-04T01:00:00.000Z"),
        dependencies,
      }),
  });
  assert.equal((repeated as { noOp: boolean }).noOp, true);
  assert.deepEqual(await readFile(statePath), before.bytes);
  assert.equal((await stat(statePath)).mtimeMs, before.mtime);
  assert.deepEqual(await checksumProtectedArtifacts(), protectedBefore);
});

test("one Scene failure stops the run before assembly", async (context) => {
  const fixture = await createE2eFixture(context);
  await writeSceneProductionResult({
    rootDir: fixture.rootDir,
    result: successResult(fixture.assignments[0], 0),
  });
  await writeSceneProductionResult({
    rootDir: fixture.rootDir,
    result: createSceneFailureResult({
      assignment: fixture.assignments[1],
      code: "SCENE_BLOCKED",
      description: "The Scene cannot satisfy the frozen brief.",
      redactionApplied: false,
      occurredAt: FIXED_PRODUCTION_NOW.toISOString(),
      commandId: "production-scene-fail",
    }),
  });
  let postSceneCalls = 0;
  await assert.rejects(() =>
    runProductionWatch({
      rootDir: fixture.rootDir,
      runId: fixture.runId,
      clock: () => FIXED_PRODUCTION_NOW,
      scheduler: { sleep: async () => assert.fail("failure is immediate") },
      resolveAssignments: async () => ({ assignments: fixture.assignments }),
      verifySuccess: async () => undefined,
      postScene: async () => {
        postSceneCalls += 1;
      },
    }),
  );
  assert.equal((await readProductionRunStore(fixture)).state.state, "failed");
  assert.equal(postSceneCalls, 0);
});

test("missing malformed and stale Scene results fail closed", async (context) => {
  await context.test("missing timeout", async (child) => {
    const fixture = await createE2eFixture(child);
    let now = FIXED_PRODUCTION_NOW.getTime();
    await assert.rejects(() =>
      runProductionWatch({
        rootDir: fixture.rootDir,
        runId: fixture.runId,
        clock: () => new Date(now),
        scheduler: {
          sleep: async () => {
            now = Date.parse(fixture.assignments[0].deadlineAt);
          },
        },
        resolveAssignments: async () => ({ assignments: fixture.assignments }),
        verifySuccess: async () => undefined,
        postScene: async () => undefined,
      }),
    );
    assert.equal(
      (await readProductionRunStore(fixture)).state.failure?.code,
      "SCENE_TIMEOUT",
    );
  });
  await context.test("malformed", async (child) => {
    const fixture = await createE2eFixture(child);
    await writeFile(
      join(
        fixture.rootDir,
        `.producer-runs/${fixture.runId}/scene-results/opening.json`,
      ),
      "{not-json\n",
    );
    await assert.rejects(() =>
      runProductionWatch({
        rootDir: fixture.rootDir,
        runId: fixture.runId,
        clock: () => FIXED_PRODUCTION_NOW,
        scheduler: { sleep: async () => undefined },
        resolveAssignments: async () => ({ assignments: fixture.assignments }),
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
    const fixture = await createE2eFixture(child);
    await writeSceneProductionResult({
      rootDir: fixture.rootDir,
      result: buildSceneProductionResultV3({
        ...successResult(fixture.assignments[0], 0),
        assignmentFingerprint: sha("f"),
      }),
    });
    await assert.rejects(() =>
      runProductionWatch({
        rootDir: fixture.rootDir,
        runId: fixture.runId,
        clock: () => FIXED_PRODUCTION_NOW,
        scheduler: { sleep: async () => undefined },
        resolveAssignments: async () => ({ assignments: fixture.assignments }),
        verifySuccess: async () => undefined,
        postScene: async () => undefined,
      }),
    );
    assert.equal(
      (await readProductionRunStore(fixture)).state.failure?.code,
      "STALE_SCENE_RESULT",
    );
  });
});

test("shared requirements Catalog or timing drift while waiting fails", async (context) => {
  const fixture = await createE2eFixture(context);
  let polls = 0;
  await assert.rejects(() =>
    runProductionWatch({
      rootDir: fixture.rootDir,
      runId: fixture.runId,
      clock: () => FIXED_PRODUCTION_NOW,
      scheduler: { sleep: async () => undefined },
      resolveAssignments: async () => {
        polls += 1;
        if (polls > 1) throw new Error("Current shared fingerprint drifted.");
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

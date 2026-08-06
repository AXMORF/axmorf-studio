import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";

import {
  SceneAssignmentSchema,
  GlobalVisualAssignmentSchema,
  VisualStyleSpecSchema,
  buildProductionPreviewAssembly,
  buildProductionPreviewEvidence,
  buildProductionPreviewMechanicalCheck,
  buildGlobalVisualBrief,
  createGlobalVisualProjection,
  createGlobalVisualPlan,
  buildNotApplicableFidelityReceipt,
  buildSceneSoundPlan,
  buildSceneSyncAnchors,
  buildSceneVisualPlan,
  buildShotPlanSet,
  buildShotRecipeSelection,
  createFingerprint,
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
import { buildScenePackage } from "../../scripts/scene-package/domain";
import { readProductionRunStore } from "../../scripts/production/adapters/run-store";
import {
  runProductionNarrative,
  type NarrativeProductionDependencies,
} from "../../scripts/production/application/narrative";
import {
  runProductionPostScene,
  type PostSceneProductionDependencies,
} from "../../scripts/production/application/post-scene";
import { runProductionSceneFreeze } from "../../scripts/production/application/scene-freeze";
import {
  runProductionSceneCheck,
  runProductionSceneSubmit,
  createSceneFailureResult,
  writeSceneProductionResult,
} from "../../scripts/production/application/scene-submit";
import {
  runProductionGlobalVisualCheck,
  runProductionGlobalVisualSubmit,
} from "../../scripts/production/application/global-visual-submit";
import { runProductionWatch } from "../../scripts/production/application/watch";
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
  const globalVisualBrief = buildGlobalVisualBrief({
    storyId: "story-example",
    responsibility:
      "project-global-background-texture-decoration-continuity-v1",
    visualIntent: [
      {
        intentId: "timing-continuity",
        description:
          "Carry one restrained timing motif across the composition.",
        appliesTo: "full-composition",
      },
    ],
    constraints: {
      captionOwner: "caption-layer",
      sceneSemanticOwner: "scene-package",
      visibleText: "forbidden",
      motion: "remotion-frame-api-only",
      runtimeExternalAccess: "forbidden",
      genericDsl: "forbidden",
    },
  });
  await writeProductionJson(
    join(fixture.projectDir, "production/global-visual-brief.json"),
    globalVisualBrief,
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
  if (frozen.globalVisualAssignmentPath === null) {
    throw new Error("v4 E2E fixture requires GlobalVisualAssignment.");
  }
  const globalVisualAssignment = GlobalVisualAssignmentSchema.parse(
    JSON.parse(
      await readFile(join(rootDir, frozen.globalVisualAssignmentPath), "utf8"),
    ),
  );
  const globalVisualPlan = createGlobalVisualPlan({
    schemaVersion: 1,
    planVersion: "global-visual-plan-v1",
    storyId: "story-example",
    compositionId: globalVisualAssignment.compositionId,
    width: globalVisualAssignment.timeline.width,
    height: globalVisualAssignment.timeline.height,
    fps: globalVisualAssignment.timeline.fps,
    durationInFrames: globalVisualAssignment.timeline.durationInFrames,
    captionSafeArea: globalVisualAssignment.timeline.captionSafeArea,
    catalogFingerprint: globalVisualAssignment.resourceCatalogFingerprint,
    frameTreatment: {
      inset: 24,
      borderWidth: 2,
      borderColor: "#4dd9ff",
      borderOpacity: 0.35,
      vignetteOpacity: 0.12,
      grainOpacity: 0.04,
    },
    continuityMotif: {
      color: "#4dd9ff",
      strokeWidth: 2,
      opacity: 0.3,
      motionPolicy: "linear-frame-progress-v1",
      windows: [],
    },
  });
  await writeProductionJson(
    join(fixture.projectDir, "global-visual-plan.json"),
    globalVisualPlan,
  );
  await writeProductionJson(
    join(fixture.projectDir, "global-visual/selected-resources.json"),
    { schemaVersion: 1, selectedResources: [] },
  );
  await mkdir(join(fixture.projectDir, "global-visual"), { recursive: true });
  await writeFile(
    join(fixture.projectDir, "global-visual/GlobalVisualLayers.tsx"),
    `import type {FC} from "react";
import {AbsoluteFill, useCurrentFrame} from "remotion";

export const GlobalVisualLayers: FC<{readonly plan: unknown; readonly projection: unknown}> = () => {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{pointerEvents: "none", opacity: 0.2 + (frame % 30) / 300}} />;
};
`,
  );
  return { ...fixture, assignments, globalVisualAssignment };
};

const prepareGlobalVisualSubmission = async (
  fixture: Awaited<ReturnType<typeof createE2eFixture>>,
) => {
  const checked = await runProductionGlobalVisualCheck({
    rootDir: fixture.rootDir,
    runId: fixture.runId,
    resolveAssignment: async () => fixture.globalVisualAssignment,
  });
  assert.equal(checked.status, "ready-to-submit");
  return async () => {
    const submitted = await runProductionGlobalVisualSubmit({
      rootDir: fixture.rootDir,
      runId: fixture.runId,
      resolveAssignment: async () => fixture.globalVisualAssignment,
    });
    if (submitted.result.status !== "success") {
      throw new Error("GlobalVisual E2E submit must succeed.");
    }
    const result = submitted.result;
    const projection = createGlobalVisualProjection({
      storyId: fixture.globalVisualAssignment.storyId,
      compositionId: fixture.globalVisualAssignment.compositionId,
      durationInFrames:
        fixture.globalVisualAssignment.timeline.durationInFrames,
      requirementsFingerprint:
        fixture.globalVisualAssignment.requirementsFingerprint,
      assignmentFingerprint:
        fixture.globalVisualAssignment.assignmentFingerprint,
      packageFingerprint: result.globalVisualPackage.packageFingerprint,
      globalVisualPlanFingerprint: result.globalVisualPlanFingerprint,
      rendererSourceGraphFingerprint: result.rendererSourceGraphFingerprint,
      selectedResourcesFingerprint: result.selectedResourcesFingerprint,
      productionResultFingerprint: result.resultFingerprint,
    });
    return {
      result,
      identity: {
        assignmentFingerprint:
          fixture.globalVisualAssignment.assignmentFingerprint,
        packageFingerprint: result.globalVisualPackage.packageFingerprint,
        resultFingerprint: result.resultFingerprint,
        planFingerprint: result.globalVisualPlanFingerprint,
        projectionFingerprint: projection.projectionFingerprint,
        rendererSourceGraphFingerprint: result.rendererSourceGraphFingerprint,
      },
    } as const;
  };
};

const authorSceneValidation = async ({
  fixture,
  assignment,
  index,
}: {
  readonly fixture: Awaited<ReturnType<typeof createE2eFixture>>;
  readonly assignment: SceneAssignment;
  readonly index: number;
}) => {
  const task = assignment.taskInput;
  const durationInFrames =
    task.timingBeat.endFrame - task.timingBeat.startFrame;
  const shotId = `${assignment.meaningId}-shot`;
  const visual = buildSceneVisualPlan({
    taskInputFingerprint: task.taskInputFingerprint,
    meaningId: assignment.meaningId,
    semanticObjective: "Show one cumulative timing boundary.",
    subject: "A single deterministic timing span.",
    primaryAction: "Reveal the timing span from left to right.",
    causalLink: "The completed span establishes the next semantic handoff.",
    primaryComposition: "Use one restrained horizontal timing axis.",
    styleRealization: ["Use the frozen editorial technical style."],
    continuity: "Preserve the same axis across the adjacent Scene.",
    recipeDecision: "empty",
    visualResourceIds: [],
    orderedShotIds: [shotId],
    fallbackIntent: "Keep the timing boundary legible without assets.",
  });
  const shots = buildShotPlanSet({
    taskInputFingerprint: task.taskInputFingerprint,
    meaningId: assignment.meaningId,
    sceneDurationInFrames: durationInFrames,
    shots: [
      {
        shotId,
        order: 0,
        primaryRange: { startFrame: 0, endFrame: durationInFrames },
        purpose: "Show the frozen semantic boundary.",
        action: "Reveal one timing axis.",
        visualResourceIds: [],
        syncAnchorIds: [],
      },
    ],
  });
  const anchors = buildSceneSyncAnchors({
    taskInputFingerprint: task.taskInputFingerprint,
    meaningId: assignment.meaningId,
    sceneDurationInFrames: durationInFrames,
    anchors: [],
  });
  const sound = buildSceneSoundPlan({
    taskInputFingerprint: task.taskInputFingerprint,
    meaningId: assignment.meaningId,
    sceneDurationInFrames: durationInFrames,
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
  const rendererSourceGraphFingerprint = sha(index === 0 ? "3" : "4");
  const scenePackage = buildScenePackage({
    task,
    visual,
    shots,
    anchors,
    sound,
    selection,
    fidelityReceipt,
    selectedResources: [],
    rendererBinding: {
      rendererId: `${assignment.storyId}-${assignment.meaningId}`,
      rendererSourceFingerprint: rendererSourceGraphFingerprint,
    },
    current: {
      timingBeat: task.timingBeat,
      semanticTimingFingerprint: task.semanticTimingFingerprint,
      visualStyleFingerprint: task.visualStyleFingerprint,
      resourceCatalogFingerprint: task.resourceCatalogFingerprint,
      snapshotFingerprints: [],
      rendererSourceFingerprint: rendererSourceGraphFingerprint,
      visualRuntimeVersion: "story-visual-runtime-v2",
      sceneAudioRuntimeVersion: "scene-audio-runtime-v1",
    },
  });
  const sceneRoot = join(fixture.projectDir, "scenes", assignment.meaningId);
  for (const [relativePath, value] of [
    ["visual-plan.json", visual],
    ["shot-plan.json", shots],
    ["sync-anchors.json", anchors],
    ["sound-plan.json", sound],
    ["shot-recipe-selection.json", selection],
    ["generated/reference-fidelity.generated.json", fidelityReceipt],
    ["selected-resources.json", { schemaVersion: 1, selectedResources: [] }],
    ["generated/scene-package.generated.json", scenePackage],
  ] as const) {
    await writeProductionJson(join(sceneRoot, relativePath), value);
  }
  await writeFile(
    join(sceneRoot, "Renderer.tsx"),
    `import type {FC} from "react";
import {useCurrentFrame} from "remotion";

const Renderer: FC<Record<string, unknown>> = () => {
  const frame = useCurrentFrame();
  return <div style={{opacity: 0.8 + (frame % 10) / 100}} />;
};
export default Renderer;
`,
  );
  const mechanicalCheckFingerprint = createFingerprint({
    namespace: "production-scene-mechanical-check",
    version: 1,
    value: {
      assignmentFingerprint: assignment.assignmentFingerprint,
      packageFingerprint: scenePackage.packageFingerprint,
      rendererSourceGraphFingerprint,
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
    },
  });
  const validateScene = async () => ({
    scenePackage,
    rendererSourceGraphFingerprint,
    mechanicalCheckFingerprint,
  });
  await runProductionSceneCheck({
    rootDir: fixture.rootDir,
    runId: fixture.runId,
    meaningId: assignment.meaningId,
    resolveAssignment: async () => assignment,
    validateScene,
  });
  return () =>
    runProductionSceneSubmit({
      rootDir: fixture.rootDir,
      runId: fixture.runId,
      meaningId: assignment.meaningId,
      clock: () => FIXED_PRODUCTION_NOW,
      resolveAssignment: async () => assignment,
      validateScene,
    });
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
  globalVisual,
}: {
  readonly requirementsFingerprint: string;
  readonly packageIdentities: readonly {
    readonly meaningId: string;
    readonly packageFingerprint: string;
  }[];
  readonly globalVisual: Readonly<{
    assignmentFingerprint: string;
    packageFingerprint: string;
    resultFingerprint: string;
    planFingerprint: string;
    projectionFingerprint: string;
    rendererSourceGraphFingerprint: string;
  }>;
}): PostSceneProductionDependencies => {
  const assembly = buildProductionPreviewAssembly({
    ...validPreviewAssemblyInput,
    requirementsFingerprint,
    scenePackages: packageIdentities,
    globalVisual,
    enhancements: {
      ...validPreviewAssemblyInput.enhancements,
      globalVisualLayers: "present",
    },
    layerOrder: [
      "story-visual",
      "global-visual",
      "narrative-core",
      "scene-local-sound",
    ],
  });
  const evidence = buildProductionPreviewEvidence({
    ...validPreviewEvidenceInput,
    requirementsFingerprint,
    previewAssemblyFingerprint: assembly.assemblyFingerprint,
    sceneCoverageFingerprint: assembly.sceneCoverageFingerprint,
    rendererRegistryFingerprint: assembly.rendererRegistryFingerprint,
    storyVisualProjectionFingerprint: assembly.storyVisualProjectionFingerprint,
    globalVisual,
    currentChecks: {
      ...validPreviewEvidenceInput.currentChecks,
      globalVisual: "current",
    },
    absentEnhancements: {
      globalSoundPlan: true,
      bgm: true,
      crossSceneAmbience: true,
      ducking: true,
    },
    presentEnhancements: { globalVisualLayers: true },
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
      globalVisual: "pass",
      composition: "pass",
      media: "pass",
      completeDecode: "pass",
      enhancementPolicy: "pass",
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

test("N+1 result contracts reach one byte-stable Preview identity in three arrival orders", async (context) => {
  const protectedBefore = await checksumProtectedArtifacts();
  const previewFingerprints: string[] = [];
  for (const arrivalOrder of [
    "global-first",
    "scenes-first",
    "interleaved",
  ] as const) {
    await context.test(arrivalOrder, async (child) => {
      const fixture = await createE2eFixture(child);
      assert.ok(
        fixture.assignments.every(({ schemaVersion }) => schemaVersion === 3),
      );
      const submitGlobal = await prepareGlobalVisualSubmission(fixture);
      const submitScenes = await Promise.all(
        fixture.assignments.map((assignment, index) =>
          authorSceneValidation({ fixture, assignment, index }),
        ),
      );
      const sceneResults = new Map<
        string,
        Extract<SceneProductionResult, { status: "success" }>
      >();
      let globalSubmission:
        | Awaited<ReturnType<typeof submitGlobal>>
        | undefined;
      const submitScene = async (index: number) => {
        const submitted = await submitScenes[index]!();
        if (submitted.result.status !== "success") {
          throw new Error("Scene E2E submit must succeed.");
        }
        sceneResults.set(submitted.result.meaningId, submitted.result);
      };
      const submitGlobalResult = async () => {
        globalSubmission = await submitGlobal();
      };
      let phase = 0;
      if (arrivalOrder === "global-first") await submitGlobalResult();
      if (arrivalOrder === "scenes-first") {
        await submitScene(0);
        await submitScene(1);
      }
      if (arrivalOrder === "interleaved") await submitScene(0);

      const postScene = async (request: {
        readonly rootDir: string;
        readonly runId: string;
      }) => {
        if (globalSubmission === undefined || sceneResults.size !== 2) {
          throw new Error("Post-scene requires all N+1 submitted contracts.");
        }
        return runProductionPostScene({
          ...request,
          clock: () => FIXED_PRODUCTION_NOW,
          dependencies: fakePostSceneDependencies({
            requirementsFingerprint:
              fixture.requirements.requirementsFingerprint,
            packageIdentities: fixture.assignments.map((assignment) => {
              const result = sceneResults.get(assignment.meaningId);
              if (result === undefined)
                throw new Error("Scene result missing.");
              return {
                meaningId: result.meaningId,
                packageFingerprint: result.scenePackage.packageFingerprint,
              };
            }),
            globalVisual: globalSubmission.identity,
          }),
        });
      };
      const watched = await runProductionWatch({
        rootDir: fixture.rootDir,
        runId: fixture.runId,
        clock: () => FIXED_PRODUCTION_NOW,
        scheduler: {
          sleep: async () => {
            phase += 1;
            if (arrivalOrder === "global-first") {
              await submitScene(0);
              await submitScene(1);
            } else if (arrivalOrder === "scenes-first") {
              await submitGlobalResult();
            } else if (phase === 1) {
              await submitGlobalResult();
            } else {
              await submitScene(1);
            }
          },
        },
        resolveAssignments: async () => ({
          assignments: fixture.assignments,
          globalVisualAssignment: fixture.globalVisualAssignment,
        }),
        verifySuccess: async () => undefined,
        postScene,
      });
      assert.equal((watched as { status: string }).status, "preview-ready");
      assert.equal(typeof watched.previewEvidenceFingerprint, "string");
      previewFingerprints.push(watched.previewEvidenceFingerprint as string);
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
        scheduler: {
          sleep: async () => assert.fail("current rerun cannot wait"),
        },
        resolveAssignments: async () => ({
          assignments: fixture.assignments,
          globalVisualAssignment: fixture.globalVisualAssignment,
        }),
        verifySuccess: async () => undefined,
        postScene,
      });
      assert.equal((repeated as { noOp: boolean }).noOp, true);
      assert.deepEqual(await readFile(statePath), before.bytes);
      assert.equal((await stat(statePath)).mtimeMs, before.mtime);
    });
  }
  assert.equal(new Set(previewFingerprints).size, 1);
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
      resolveAssignments: async () => ({
        assignments: fixture.assignments,
        globalVisualAssignment: fixture.globalVisualAssignment,
      }),
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
        resolveAssignments: async () => ({
          assignments: fixture.assignments,
          globalVisualAssignment: fixture.globalVisualAssignment,
        }),
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
        resolveAssignments: async () => ({
          assignments: fixture.assignments,
          globalVisualAssignment: fixture.globalVisualAssignment,
        }),
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
        resolveAssignments: async () => ({
          assignments: fixture.assignments,
          globalVisualAssignment: fixture.globalVisualAssignment,
        }),
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

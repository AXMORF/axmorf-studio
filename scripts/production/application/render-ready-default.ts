import { createHash } from "node:crypto";
import { join } from "node:path";

import {
  GlobalVisualProductionResultSchema,
  NarrativeAutoCheckReportSchema,
  ProductionRenderPlanSchema,
  ProductionRenderReadySchema,
  RenderSpecSchema,
  SceneCoverageMapSchema,
  ScenePackageSchema,
  SceneProductionResultSchema,
  SceneSoundPlanSchema,
  SceneSyncAnchorSetSchema,
  SealedNarrationManifestSchema,
  SemanticTimingSchema,
  StorySpecSchema,
  buildProductionRenderPlan,
  buildProductionRenderReady,
  computeStoryFingerprint,
  createFingerprint,
  createGlobalVisualProjection,
} from "../../../src/contracts";
import { resolveSceneSound } from "../../../src/remotion/runtime/scene-sound";
import { buildSoundDesignProjection } from "../../../src/remotion/runtime/sound-design";
import { buildStoryVisualProjection } from "../../../src/remotion/runtime/story-visual";
import { resolveCurrentM3Entry } from "../../baseline/evidence";
import { generateProjectRegistry } from "../../registry/generate";
import { collectRendererSourceGraph } from "../../renderer-registry/domain";
import { generateRendererRegistryFromProjectFiles } from "../../renderer-registry/generate";
import {
  generateSceneCoverageFromProjectFiles,
  parseSceneSelectedResourcesFile,
} from "../../scene-package/generate";
import {
  readJsonFile,
  writeOrCheckSceneArtifact,
} from "../../scene-package/project-files";
import { readProductionRunStore } from "../adapters/run-store";
import { readExistingGlobalVisualResult } from "./global-visual-check";
import { validateGlobalVisualFromProjectFiles } from "./global-visual-validator";
import {
  ensureProductionRenderScaffold,
  renderProductionRenderProjectScaffold,
} from "./project-scaffold";
import { validateSceneReadability } from "./readability-validator";
import { resolveCurrentSceneAssignments } from "./scene-freeze";

const checksumText = (value: string) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}` as const;

const loadRenderSources = async (rootDir: string, storyId: string) => {
  const projectRoot = join(rootDir, "src/projects", storyId);
  const [story, timing, render, sealedNarration, autoCheck] = await Promise.all([
    readJsonFile(join(projectRoot, "story.json")).then(StorySpecSchema.parse),
    readJsonFile(
      join(projectRoot, "generated/semantic-timing.generated.json"),
    ).then(SemanticTimingSchema.parse),
    readJsonFile(join(projectRoot, "render.json")).then(RenderSpecSchema.parse),
    readJsonFile(
      join(projectRoot, "generated/sealed-narration.generated.json"),
    ).then(SealedNarrationManifestSchema.parse),
    readJsonFile(
      join(projectRoot, "generated/narrative-auto-check.generated.json"),
    ).then(NarrativeAutoCheckReportSchema.parse),
  ]);
  if (
    story.storyId !== storyId ||
    timing.storyId !== storyId ||
    sealedNarration.storyId !== storyId ||
    autoCheck.storyId !== storyId
  ) {
    throw new Error("Production render narrative identities are stale.");
  }
  return { projectRoot, story, timing, render, sealedNarration, autoCheck } as const;
};

const resolveCurrentGlobalVisual = async ({
  rootDir,
  runId,
  assignment,
}: {
  readonly rootDir: string;
  readonly runId: string;
  readonly assignment: NonNullable<
    Awaited<
      ReturnType<typeof resolveCurrentSceneAssignments>
    >["globalVisualAssignment"]
  >;
}) => {
  const [loaded, rawResult, validated] = await Promise.all([
    readProductionRunStore({ rootDir, runId }),
    readExistingGlobalVisualResult({ rootDir, runId }),
    validateGlobalVisualFromProjectFiles({ rootDir, assignment, mode: "check" }),
  ]);
  const result = GlobalVisualProductionResultSchema.parse(rawResult);
  if (
    loaded.state.acceptedGlobalVisualResult?.resultFingerprint !==
      result.resultFingerprint ||
    result.status !== "success" ||
    result.runId !== assignment.runId ||
    result.storyId !== assignment.storyId ||
    result.assignmentFingerprint !== assignment.assignmentFingerprint ||
    result.requirementsFingerprint !== assignment.requirementsFingerprint ||
    result.globalVisualPackage.packageFingerprint !==
      validated.globalVisualPackage.packageFingerprint ||
    result.globalVisualPlanFingerprint !==
      validated.globalVisualPackage.globalVisualPlanFingerprint ||
    result.rendererSourceGraphFingerprint !==
      validated.globalVisualPackage.rendererSourceGraphFingerprint ||
    result.selectedResourcesFingerprint !==
      validated.globalVisualPackage.selectedResourcesFingerprint ||
    result.mechanicalCheckFingerprint !== validated.mechanicalCheckFingerprint
  ) {
    throw new Error("Accepted GlobalVisual result is stale.");
  }
  return { assignment, result, package: validated.globalVisualPackage } as const;
};

const writeOrCheckGlobalVisualProjection = async ({
  rootDir,
  storyId,
  current,
  mode,
}: {
  readonly rootDir: string;
  readonly storyId: string;
  readonly current: Awaited<ReturnType<typeof resolveCurrentGlobalVisual>>;
  readonly mode: "write" | "check";
}) => {
  const projection = createGlobalVisualProjection({
    storyId,
    compositionId: current.assignment.compositionId,
    durationInFrames: current.assignment.timeline.durationInFrames,
    requirementsFingerprint: current.assignment.requirementsFingerprint,
    assignmentFingerprint: current.assignment.assignmentFingerprint,
    packageFingerprint: current.package.packageFingerprint,
    globalVisualPlanFingerprint: current.package.globalVisualPlanFingerprint,
    rendererSourceGraphFingerprint:
      current.package.rendererSourceGraphFingerprint,
    selectedResourcesFingerprint: current.package.selectedResourcesFingerprint,
    productionResultFingerprint: current.result.resultFingerprint,
  });
  await writeOrCheckSceneArtifact({
    destination: join(
      rootDir,
      `src/projects/${storyId}/generated/global-visual-projection.generated.json`,
    ),
    value: projection,
    mode,
  });
  return projection;
};

export const prepareProductionRenderPlan = async ({
  rootDir,
  runId,
  storyId,
  requirementsFingerprint,
  mode,
}: {
  readonly rootDir: string;
  readonly runId: string;
  readonly storyId: string;
  readonly requirementsFingerprint: string;
  readonly mode: "write" | "check";
}) => {
  const resolved = await resolveCurrentSceneAssignments({ rootDir, runId });
  if (
    resolved.inputs.current.requirements.requirementsFingerprint !==
      requirementsFingerprint ||
    resolved.inputs.story.storyId !== storyId ||
    resolved.globalVisualAssignment === null
  ) {
    throw new Error("Production render freeze is stale or incomplete.");
  }
  if (
    resolved.assignments.some(
      (assignment) =>
        assignment.schemaVersion !== 3 ||
        assignment.sceneCompositionBoundaryVersion !==
          resolved.inputs.current.requirements.sceneBoundaryOwnership
            .sceneCompositionBoundaryVersion,
    )
  ) {
    throw new Error("Production render Scene boundary identity is stale.");
  }
  const currentGlobalVisual = await resolveCurrentGlobalVisual({
    rootDir,
    runId,
    assignment: resolved.globalVisualAssignment,
  });
  const globalVisualProjection = await writeOrCheckGlobalVisualProjection({
    rootDir,
    storyId,
    current: currentGlobalVisual,
    mode,
  });
  const coverage = SceneCoverageMapSchema.parse(
    await generateSceneCoverageFromProjectFiles({
      rootDir,
      projectId: storyId,
      mode,
    }),
  );
  if (
    coverage.entries.length !== resolved.assignments.length ||
    coverage.entries.some(({ status }) => status !== "ready")
  ) {
    throw new Error("Production render requires all-ready Scene coverage.");
  }
  const packages = await Promise.all(
    resolved.assignments.map((assignment) =>
      readJsonFile(
        join(
          rootDir,
          `src/projects/${storyId}/scenes/${assignment.meaningId}/generated/scene-package.generated.json`,
        ),
      ).then(ScenePackageSchema.parse),
    ),
  );
  const registry = await generateRendererRegistryFromProjectFiles({
    rootDir,
    projectId: storyId,
    mode,
  });
  if (registry === null) {
    throw new Error("Production render requires a RendererRegistry.");
  }
  for (const assignment of resolved.assignments) {
    const graph = await collectRendererSourceGraph({
      rootDir,
      projectId: assignment.storyId,
      rendererPath: `src/projects/${assignment.storyId}/scenes/${assignment.meaningId}/Renderer.tsx`,
    });
    await validateSceneReadability({ rootDir, assignment, graph });
  }
  const sources = await loadRenderSources(rootDir, storyId);
  const transitions = sources.timing.storyBeats.slice(1).map((beat, index) => ({
    fromMeaningId: sources.timing.storyBeats[index]?.meaningId,
    toMeaningId: beat.meaningId,
    kind: "hard-cut" as const,
    durationInFrames: 0,
    boundaryFrame: beat.startFrame,
  }));
  const visualProjection = buildStoryVisualProjection({
    storyId,
    leadInFrames: sources.timing.leadInFrames,
    tailFrames: sources.timing.tailFrames,
    durationInFrames: sources.timing.durationInFrames,
    storyBeatTimings: sources.timing.storyBeats,
    coverage,
    packages,
    registryFingerprint: registry.registryFingerprint,
    transitions,
  });
  const sceneSoundProjections = [];
  for (const assignment of resolved.assignments) {
    const sceneRoot = join(
      rootDir,
      "src/projects",
      storyId,
      "scenes",
      assignment.meaningId,
    );
    const [sound, anchors, resources] = await Promise.all([
      readJsonFile(join(sceneRoot, "sound-plan.json")).then(
        SceneSoundPlanSchema.parse,
      ),
      readJsonFile(join(sceneRoot, "sync-anchors.json")).then(
        SceneSyncAnchorSetSchema.parse,
      ),
      readJsonFile(join(sceneRoot, "selected-resources.json")).then(
        parseSceneSelectedResourcesFile,
      ),
    ]);
    const scenePackage = packages.find(
      ({ meaningId }) => meaningId === assignment.meaningId,
    );
    if (scenePackage === undefined) {
      throw new Error("Production render ScenePackage order is stale.");
    }
    sceneSoundProjections.push(
      resolveSceneSound({
        scenePackage,
        soundPlan: sound,
        syncAnchors: anchors,
        resources: resources.selectedResources.filter(
          ({ selected }) =>
            selected.role === "scene-ambience" ||
            selected.role === "scene-sfx",
        ),
      }),
    );
  }
  const soundProjection = buildSoundDesignProjection({
    storyId,
    coverage,
    storyBeatTimings: sources.timing.storyBeats,
    sceneSoundProjections,
  });
  const sceneLocalSoundPresent = sceneSoundProjections.some(
    ({ contributions }) => contributions.length > 0,
  );
  if (
    sceneLocalSoundPresent &&
    resolved.inputs.current.requirements.enhancementSelection.sceneLocalSound ===
      "none"
  ) {
    throw new Error("Scene-local sound violates current requirements.");
  }
  const scaffold = await ensureProductionRenderScaffold({
    rootDir,
    storyId,
    meaningIds: resolved.assignments.map(({ meaningId }) => meaningId),
    sceneLocalSoundPresent,
    mode,
  });
  const expectedSource = renderProductionRenderProjectScaffold({
    storyId,
    sceneLocalSoundPresent,
  });
  if (scaffold.source !== expectedSource) {
    throw new Error("Production render Composition source drifted.");
  }
  const plan = buildProductionRenderPlan({
    runId,
    storyId,
    requirementsFingerprint,
    storyFingerprint: computeStoryFingerprint(sources.story),
    sealedNarrationFingerprint:
      sources.sealedNarration.sealedNarrationFingerprint,
    semanticTimingFingerprint: sources.timing.fingerprint,
    captionCuesFingerprint: createFingerprint({
      namespace: "production-render-caption-cues",
      version: 1,
      value: sources.timing.captionCues,
    }),
    sceneCoverageFingerprint: coverage.coverageFingerprint,
    scenePackages: packages.map(({ meaningId, packageFingerprint }) => ({
      meaningId,
      packageFingerprint,
    })),
    rendererRegistryFingerprint: registry.registryFingerprint,
    storyVisualProjectionFingerprint: visualProjection.projectionFingerprint,
    sceneSoundProjectionFingerprint:
      soundProjection.soundDesignProjectionFingerprint,
    globalVisual: {
      assignmentFingerprint: currentGlobalVisual.assignment.assignmentFingerprint,
      packageFingerprint: currentGlobalVisual.package.packageFingerprint,
      resultFingerprint: currentGlobalVisual.result.resultFingerprint,
      planFingerprint: currentGlobalVisual.package.globalVisualPlanFingerprint,
      projectionFingerprint: globalVisualProjection.projectionFingerprint,
      rendererSourceGraphFingerprint:
        currentGlobalVisual.package.rendererSourceGraphFingerprint,
    },
    compositionId: sources.render.compositionId,
    compositionSourceChecksum: checksumText(expectedSource),
    width: sources.render.width,
    height: sources.render.height,
    fps: sources.render.fps,
    frameCount: sources.timing.durationInFrames,
    layerOrder: ["global-visual", "story-visual", "narrative-core"],
    mixOrder: ["narration", "scene-local-sound"],
    remotionVersion: "4.0.489",
  });
  await writeOrCheckSceneArtifact({
    destination: join(
      sources.projectRoot,
      "generated/production-render-plan.generated.json",
    ),
    value: plan,
    mode,
  });
  return ProductionRenderPlanSchema.parse(plan);
};

export const createDefaultRenderReadyDependencies = () => ({
  assertCurrentFreeze: async ({
    rootDir,
    runId,
    storyId,
    requirementsFingerprint,
  }: {
    readonly rootDir: string;
    readonly runId: string;
    readonly storyId: string;
    readonly requirementsFingerprint: string;
  }) => {
    const [resolved, loaded] = await Promise.all([
      resolveCurrentSceneAssignments({ rootDir, runId }),
      readProductionRunStore({ rootDir, runId }),
    ]);
    if (
      resolved.inputs.story.storyId !== storyId ||
      resolved.inputs.current.requirements.requirementsFingerprint !==
        requirementsFingerprint ||
      loaded.state.acceptedSceneResults.length !== resolved.assignments.length ||
      loaded.state.acceptedGlobalVisualResult === null
    ) {
      throw new Error("Accepted production freeze is stale.");
    }
    for (const assignment of resolved.assignments) {
      const result = SceneProductionResultSchema.parse(
        await readJsonFile(
          join(
            rootDir,
            `.producer-runs/${runId}/scene-results/${assignment.meaningId}.json`,
          ),
        ),
      );
      const accepted = loaded.state.acceptedSceneResults.find(
        ({ meaningId }) => meaningId === assignment.meaningId,
      );
      if (
        result.status !== "success" ||
        result.assignmentFingerprint !== assignment.assignmentFingerprint ||
        accepted?.resultFingerprint !== result.resultFingerprint
      ) {
        throw new Error("Accepted Scene result is stale.");
      }
    }
  },
  prepareRenderPlan: prepareProductionRenderPlan,
  projectRegistry: async ({
    rootDir,
    storyId,
    mode,
  }: {
    readonly rootDir: string;
    readonly storyId: string;
    readonly mode: "write" | "check";
  }) => {
    await generateProjectRegistry({ rootDir, mode });
    const entry = await resolveCurrentM3Entry(rootDir, storyId);
    return {
      compositionId: entry.descriptor.id,
      registryChecksum: entry.generatedEntryChecksum,
    } as const;
  },
  writeOrCheckRenderReady: async ({
    rootDir,
    storyId,
    plan,
    mode,
  }: {
    readonly rootDir: string;
    readonly storyId: string;
    readonly plan: unknown;
    readonly mode: "write" | "check";
  }) => {
    const ready = buildProductionRenderReady({ plan });
    await writeOrCheckSceneArtifact({
      destination: join(
        rootDir,
        `src/projects/${storyId}/generated/production-render-ready.generated.json`,
      ),
      value: ready,
      mode,
    });
    return ProductionRenderReadySchema.parse(ready);
  },
});

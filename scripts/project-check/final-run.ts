import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import {
  FINAL_MECHANICAL_CHECK_IDS,
  FINAL_MECHANICAL_CHECK_V2_IDS,
  FinalAssemblyPlanSchema,
  GlobalVisualPlanSchema,
  ProjectSoundPlanSchema,
  ReferenceFidelityEvidenceSchema,
  ReferenceFidelityReceiptSchema,
  ResourceCatalogSchema,
  ResourceDescriptorSchema,
  SCENE_AUDIO_RUNTIME_VERSION,
  SCENE_VISUAL_RUNTIME_VERSION,
  SceneCoverageMapSchema,
  ScenePackageSchema,
  SceneSoundPlanSchema,
  SceneSyncAnchorSetSchema,
  SceneTaskInputSchema,
  SceneVisualPlanSchema,
  SelectedResourceRefSchema,
  ShotPlanSetSchema,
  ShotRecipeSelectionSchema,
  VisualStyleSpecSchema,
  computeVisualStyleFingerprint,
  createFinalMechanicalCheckReport,
  createFinalMechanicalCheckV2Report,
  type FinalMechanicalCheckId,
  type FinalMechanicalCheckReportInput,
  type FinalMechanicalCheckV2Id,
  type FinalMechanicalCheckV2ReportInput,
  type Sha256Digest,
} from "../../src/contracts";
import {
  resolveSceneSound,
  type SceneSoundProjection,
} from "../../src/remotion/runtime/scene-sound";
import { buildSoundDesignProjection } from "../../src/remotion/runtime/sound-design";
import { buildStoryVisualProjection } from "../../src/remotion/runtime/story-visual";
import { checkPersistedNarrativeAutoCheck } from "./report-files";
import { runNarrativeAutoCheck } from "./run";
import type { ProcessRunner } from "../baseline/evidence";
import {
  buildResourceCatalog,
  deriveCatalogWithoutProjectOwnedDescriptors,
} from "../catalog/domain";
import { generateResourceCatalog } from "../catalog/generate";
import { readGeneratedResourceCatalog } from "../catalog/project-files";
import { checksumExternalBytes } from "../external-references/project-files";
import { loadNarrationProjectFiles } from "../narration/project-files";
import { collectRendererSourceGraph } from "../renderer-registry/domain";
import { generateRendererRegistryFromProjectFiles } from "../renderer-registry/generate";
import { buildScenePackage } from "../scene-package/domain";
import {
  checksumFile,
  getProjectCheckPaths,
  loadProjectCheckJson,
  loadProjectCheckSemanticTiming,
  loadProjectCheckText,
} from "./project-files";

type SceneCheckId = Exclude<FinalMechanicalCheckId, "narrative">;
type FinalStatus = "pass" | "fail" | "not-applicable";

type AssemblyCheckId = Extract<
  FinalMechanicalCheckV2Id,
  "global-visual" | "final-assembly"
>;

export type FinalAssemblyBranchResult = Readonly<{
  globalVisualPlanFingerprint: string | null;
  globalVisualProjectionFingerprint: string | null;
  finalAssemblyFingerprint: string | null;
  checkStatuses: Readonly<Record<AssemblyCheckId, "pass" | "fail">>;
  checkErrors: Readonly<Record<AssemblyCheckId, unknown>>;
}>;

export type FinalSceneBranchResult = Readonly<{
  referenceModes: readonly (
    | "empty"
    | "inspiration-only"
    | "exact-demo-localized"
  )[];
  visualStyleFingerprint: string | null;
  resourceCatalogFingerprint: string | null;
  externalSnapshotFingerprints: readonly string[];
  fidelityReceiptFingerprints: readonly string[];
  sceneCoverageFingerprint: string | null;
  scenePackageFingerprints: readonly string[];
  rendererRegistryFingerprint: string | null;
  storyVisualProjectionFingerprint: string | null;
  soundDesignProjectionFingerprint: string | null;
  compositionAssemblyChecksum: string | null;
  checkStatuses: Readonly<Record<SceneCheckId, FinalStatus>>;
}>;

type MutableBranch = {
  -readonly [Key in keyof FinalSceneBranchResult]: FinalSceneBranchResult[Key];
};

const SelectedResourcesFileSchema = z
  .object({
    schemaVersion: z.literal(1),
    selectedResources: z
      .array(
        z
          .object({
            selected: SelectedResourceRefSchema,
            descriptor: ResourceDescriptorSchema,
          })
          .strict(),
      )
      .readonly(),
  })
  .strict();

const failedSceneBranch = (): MutableBranch => ({
  referenceModes: [],
  visualStyleFingerprint: null,
  resourceCatalogFingerprint: null,
  externalSnapshotFingerprints: [],
  fidelityReceiptFingerprints: [],
  sceneCoverageFingerprint: null,
  scenePackageFingerprints: [],
  rendererRegistryFingerprint: null,
  storyVisualProjectionFingerprint: null,
  soundDesignProjectionFingerprint: null,
  compositionAssemblyChecksum: null,
  checkStatuses: Object.fromEntries(
    FINAL_MECHANICAL_CHECK_IDS.filter(
      (checkId): checkId is SceneCheckId => checkId !== "narrative",
    ).map((checkId) => [checkId, "fail"]),
  ) as Record<SceneCheckId, FinalStatus>,
});

export const selectCurrentCatalogByFingerprint = <
  Catalog extends Readonly<{ catalogFingerprint: string }>,
>({
  catalogs,
  fingerprint,
  authority,
}: {
  readonly catalogs: readonly Catalog[];
  readonly fingerprint: string;
  readonly authority: string;
}): Catalog => {
  const matches = catalogs.filter(
    ({ catalogFingerprint }) => catalogFingerprint === fingerprint,
  );
  if (matches.length !== 1 || matches[0] === undefined) {
    throw new Error(
      `${authority} identity must match exactly one current Catalog.`,
    );
  }
  return matches[0];
};

export const selectCurrentSceneResourceCatalog = <
  Catalog extends Readonly<{ catalogFingerprint: string }>,
>({
  catalogs,
  taskCatalogFingerprints,
}: {
  readonly catalogs: readonly Catalog[];
  readonly taskCatalogFingerprints: readonly string[];
}): Catalog => {
  const taskIdentities = [...new Set(taskCatalogFingerprints)];
  if (taskIdentities.length !== 1) {
    throw new Error(
      "Ready Scene tasks must bind one current ResourceCatalog identity.",
    );
  }
  return selectCurrentCatalogByFingerprint({
    catalogs,
    fingerprint: taskIdentities[0]!,
    authority: "Ready Scene ResourceCatalog",
  });
};

const FINAL_OWNED_MEDIA_ROLES = new Set(["background-music", "global-visual"]);

export const derivePreFinalSceneCatalog = (rawCatalog: unknown) => {
  const catalog = ResourceCatalogSchema.parse(rawCatalog);
  return buildResourceCatalog(
    catalog.entries
      .map((entry) => entry.descriptor)
      .filter(
        (descriptor) =>
          descriptor.kind !== "asset" ||
          !FINAL_OWNED_MEDIA_ROLES.has(descriptor.mediaRole),
      ),
  );
};

export const deduplicateCatalogCandidates = <
  Catalog extends Readonly<{ catalogFingerprint: string }>,
>(
  catalogs: readonly Catalog[],
): readonly Catalog[] =>
  catalogs.filter(
    (catalog, index) =>
      catalogs.findIndex(
        (candidate) =>
          candidate.catalogFingerprint === catalog.catalogFingerprint,
      ) === index,
  );

const scenePath = (
  rootDir: string,
  storyId: string,
  meaningId: string,
  path: string,
) => join(rootDir, "src/projects", storyId, "scenes", meaningId, path);

const validateFidelityEvidenceArtifacts = async ({
  rootDir,
  evidence,
}: {
  readonly rootDir: string;
  readonly evidence: ReturnType<typeof ReferenceFidelityEvidenceSchema.parse>;
}) => {
  for (const item of evidence.items) {
    const artifacts = [
      item.sourcePreview,
      item.adaptationPreview,
      ...item.phasePairs.flatMap((pair) => [
        pair.sourceEvidence,
        pair.adaptationEvidence,
      ]),
    ];
    for (const artifact of artifacts) {
      if (
        (await checksumFile(join(rootDir, artifact.artifactPath))) !==
        artifact.checksum
      ) {
        throw new Error("Reference fidelity evidence checksum is stale.");
      }
    }
  }
};

export const loadCurrentFinalSceneBranch = async ({
  rootDir,
  projectId,
  includeMediaEvidence = true,
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly includeMediaEvidence?: boolean;
}): Promise<FinalSceneBranchResult> => {
  const result = failedSceneBranch();
  const paths = getProjectCheckPaths({ rootDir, projectId });
  await generateResourceCatalog({ rootDir, mode: "check" });
  const baseCatalog = ResourceCatalogSchema.parse(
    await readGeneratedResourceCatalog(rootDir),
  );
  const [{ projectSource }, semanticTiming, coverage] = await Promise.all([
    loadNarrationProjectFiles({ rootDir, projectId: paths.storyId }),
    loadProjectCheckSemanticTiming(paths.semanticTiming),
    loadProjectCheckJson(
      paths.sceneCoverage,
      "scene-coverage.generated.json",
    ).then((value) => SceneCoverageMapSchema.parse(value)),
  ]);
  const storyBeatOrder = projectSource.story.beats.map(
    (beat) => beat.meaningId,
  );
  if (
    coverage.storyId !== paths.storyId ||
    JSON.stringify(coverage.storyBeatOrder) !==
      JSON.stringify(storyBeatOrder) ||
    coverage.entries.some(
      (entry) => entry.status === "missing" || entry.status === "stale",
    )
  ) {
    throw new Error("Scene coverage is missing stale or out of Story order.");
  }
  result.sceneCoverageFingerprint = coverage.coverageFingerprint;
  result.checkStatuses = { ...result.checkStatuses, "scene-coverage": "pass" };
  const ready = coverage.entries.filter((entry) => entry.status === "ready");
  const taskCatalogFingerprints = await Promise.all(
    ready.map(
      async ({ meaningId }) =>
        SceneTaskInputSchema.parse(
          await loadProjectCheckJson(
            scenePath(
              rootDir,
              paths.storyId,
              meaningId,
              "task-input.generated.json",
            ),
            "task-input.generated.json",
          ),
        ).resourceCatalogFingerprint,
    ),
  );
  const rawCatalogCandidates = [baseCatalog];
  const projectCatalogPath = projectArtifactPath(
    rootDir,
    paths.storyId,
    "generated/resource-catalog.generated.json",
  );
  if (await pathExists(projectCatalogPath)) {
    const projectCatalog = ResourceCatalogSchema.parse(
      await loadProjectCheckJson(
        projectCatalogPath,
        "resource-catalog.generated.json",
      ),
    );
    rawCatalogCandidates.push(
      projectCatalog,
      derivePreFinalSceneCatalog(projectCatalog),
      deriveCatalogWithoutProjectOwnedDescriptors(
        projectCatalog,
        paths.storyId,
      ),
    );
  }
  const catalogCandidates = deduplicateCatalogCandidates(rawCatalogCandidates);
  const catalog =
    ready.length === 0
      ? baseCatalog
      : selectCurrentSceneResourceCatalog({
          catalogs: catalogCandidates,
          taskCatalogFingerprints,
        });
  result.resourceCatalogFingerprint = catalog.catalogFingerprint;
  result.checkStatuses = {
    ...result.checkStatuses,
    "resource-catalog": "pass",
  };
  const visualStyle = VisualStyleSpecSchema.parse(
    await loadProjectCheckJson(paths.visualStyle, "visual-style.json"),
  );
  const visualStyleCatalog = selectCurrentCatalogByFingerprint({
    catalogs: catalogCandidates,
    fingerprint: visualStyle.resourceCatalogFingerprint,
    authority: "VisualStyleSpec",
  });
  const styleEntry = visualStyleCatalog.entries.find(
    (entry) =>
      entry.descriptor.kind === "style-profile" &&
      entry.descriptor.styleProfileId === visualStyle.styleProfileId,
  );
  const sceneStyleEntry = catalog.entries.find(
    (entry) =>
      entry.descriptor.kind === "style-profile" &&
      entry.descriptor.styleProfileId === visualStyle.styleProfileId,
  );
  if (
    visualStyle.storyId !== paths.storyId ||
    styleEntry === undefined ||
    sceneStyleEntry === undefined ||
    sceneStyleEntry.descriptorFingerprint !== styleEntry.descriptorFingerprint
  ) {
    throw new Error("VisualStyleSpec identity is stale.");
  }
  result.visualStyleFingerprint = computeVisualStyleFingerprint({
    visualStyle,
    resolvedStyleDescriptorFingerprint: styleEntry.descriptorFingerprint,
  });
  result.checkStatuses = { ...result.checkStatuses, "visual-style": "pass" };

  if (ready.length === 0) {
    result.referenceModes = coverage.entries.map(() => "empty" as const);
    result.checkStatuses = {
      ...result.checkStatuses,
      "external-references": "not-applicable",
      "reference-fidelity": "not-applicable",
      "scene-packages": "not-applicable",
      "renderer-registry": "not-applicable",
      "scene-projections": "not-applicable",
    };
    try {
      await readFile(paths.rendererRegistry);
      throw new Error("All-fallback project cannot retain a RendererRegistry.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  const packages = [];
  const soundProjections: SceneSoundProjection[] = [];
  for (const coverageEntry of ready) {
    const meaningId = coverageEntry.meaningId;
    const [
      rawTask,
      rawVisual,
      rawShots,
      rawAnchors,
      rawSound,
      rawSelection,
      rawFidelity,
      rawSelectedResources,
      rawPersistedPackage,
    ] = await Promise.all([
      loadProjectCheckJson(
        scenePath(
          rootDir,
          paths.storyId,
          meaningId,
          "task-input.generated.json",
        ),
        "task-input.generated.json",
      ),
      loadProjectCheckJson(
        scenePath(rootDir, paths.storyId, meaningId, "visual-plan.json"),
        "visual-plan.json",
      ),
      loadProjectCheckJson(
        scenePath(rootDir, paths.storyId, meaningId, "shot-plan.json"),
        "shot-plan.json",
      ),
      loadProjectCheckJson(
        scenePath(rootDir, paths.storyId, meaningId, "sync-anchors.json"),
        "sync-anchors.json",
      ),
      loadProjectCheckJson(
        scenePath(rootDir, paths.storyId, meaningId, "sound-plan.json"),
        "sound-plan.json",
      ),
      loadProjectCheckJson(
        scenePath(
          rootDir,
          paths.storyId,
          meaningId,
          "shot-recipe-selection.json",
        ),
        "shot-recipe-selection.json",
      ),
      loadProjectCheckJson(
        scenePath(
          rootDir,
          paths.storyId,
          meaningId,
          "generated/reference-fidelity.generated.json",
        ),
        "reference-fidelity.generated.json",
      ),
      loadProjectCheckJson(
        scenePath(rootDir, paths.storyId, meaningId, "selected-resources.json"),
        "selected-resources.json",
      ),
      loadProjectCheckJson(
        scenePath(
          rootDir,
          paths.storyId,
          meaningId,
          "generated/scene-package.generated.json",
        ),
        "scene-package.generated.json",
      ),
    ]);
    const task = SceneTaskInputSchema.parse(rawTask);
    const visual = SceneVisualPlanSchema.parse(rawVisual);
    const shots = ShotPlanSetSchema.parse(rawShots);
    const anchors = SceneSyncAnchorSetSchema.parse(rawAnchors);
    const sound = SceneSoundPlanSchema.parse(rawSound);
    const selection = ShotRecipeSelectionSchema.parse(rawSelection);
    const fidelity = ReferenceFidelityReceiptSchema.parse(rawFidelity);
    const selectedResources =
      SelectedResourcesFileSchema.parse(rawSelectedResources).selectedResources;
    const persistedPackage = ScenePackageSchema.parse(rawPersistedPackage);
    const graph = await collectRendererSourceGraph({
      rootDir,
      projectId: paths.storyId,
      rendererPath: `src/projects/${paths.storyId}/scenes/${meaningId}/Renderer.tsx`,
    });
    const rebuiltPackage = buildScenePackage({
      task,
      visual,
      shots,
      anchors,
      sound,
      selection,
      fidelityReceipt: fidelity,
      selectedResources,
      rendererBinding: {
        rendererId: persistedPackage.rendererBinding.rendererId,
        rendererSourceFingerprint: graph.sourceGraphFingerprint,
      },
      current: {
        timingBeat: semanticTiming.storyBeats.find(
          (beat) => beat.meaningId === meaningId,
        ),
        semanticTimingFingerprint: semanticTiming.fingerprint,
        visualStyleFingerprint: result.visualStyleFingerprint,
        resourceCatalogFingerprint: catalog.catalogFingerprint,
        snapshotFingerprints: task.allowedSnapshots.map(
          (snapshot) => snapshot.snapshotFingerprint,
        ),
        rendererSourceFingerprint: graph.sourceGraphFingerprint,
        visualRuntimeVersion: SCENE_VISUAL_RUNTIME_VERSION,
        sceneAudioRuntimeVersion: SCENE_AUDIO_RUNTIME_VERSION,
      },
    });
    if (
      rebuiltPackage.packageFingerprint !==
        persistedPackage.packageFingerprint ||
      coverageEntry.packageFingerprint !== persistedPackage.packageFingerprint
    ) {
      throw new Error("ScenePackage generated identity is stale.");
    }
    packages.push(rebuiltPackage);
    soundProjections.push(
      resolveSceneSound({
        scenePackage: rebuiltPackage,
        soundPlan: sound,
        syncAnchors: anchors,
        resources: selectedResources.filter(
          ({ selected }) =>
            selected.role === "sound-effect" ||
            selected.role === "background-music",
        ),
      }),
    );
    const modes = selection.selections.map((entry) => entry.mode);
    const mode =
      modes.length === 0
        ? "empty"
        : modes.every((candidate) => candidate === "inspiration-only")
          ? "inspiration-only"
          : modes.every((candidate) => candidate === "exact-demo-localized")
            ? "exact-demo-localized"
            : null;
    if (mode === null) throw new Error("Scene reference modes are mixed.");
    result.referenceModes = [...result.referenceModes, mode];
    result.externalSnapshotFingerprints = [
      ...result.externalSnapshotFingerprints,
      ...task.allowedSnapshots.map((snapshot) => snapshot.snapshotFingerprint),
    ];
    if (mode === "exact-demo-localized") {
      if (fidelity.status !== "pass") {
        throw new Error("Exact Scene reference fidelity is missing.");
      }
      const evidence = ReferenceFidelityEvidenceSchema.parse(
        await loadProjectCheckJson(
          scenePath(
            rootDir,
            paths.storyId,
            meaningId,
            "generated/reference-fidelity-evidence.generated.json",
          ),
          "reference-fidelity-evidence.generated.json",
        ),
      );
      if (evidence.evidenceFingerprint !== fidelity.evidenceFingerprint) {
        throw new Error("Reference fidelity evidence identity is stale.");
      }
      if (includeMediaEvidence) {
        await validateFidelityEvidenceArtifacts({ rootDir, evidence });
      }
      for (const item of fidelity.items) {
        for (const source of item.localizedSourceChecksums) {
          if (
            (await checksumFile(join(rootDir, source.sourcePath))) !==
            source.checksum
          ) {
            throw new Error("Localized reference source checksum is stale.");
          }
        }
        for (const source of [
          {
            path: item.rendererBinding.rendererPath,
            checksum: item.rendererBinding.rendererSourceChecksum,
          },
          {
            path: item.rendererBinding.adaptedShotPath,
            checksum: item.rendererBinding.adaptedShotSourceChecksum,
          },
        ]) {
          if (
            (await checksumFile(join(rootDir, source.path))) !== source.checksum
          ) {
            throw new Error("Reference Renderer binding checksum is stale.");
          }
        }
      }
      result.fidelityReceiptFingerprints = [
        ...result.fidelityReceiptFingerprints,
        fidelity.receiptFingerprint,
      ];
    } else if (
      fidelity.status !== "not-applicable" ||
      fidelity.reason !== mode
    ) {
      throw new Error("Reference fidelity applicability is stale.");
    }
  }

  if (ready.length > 0) {
    result.scenePackageFingerprints = packages.map(
      (scenePackage) => scenePackage.packageFingerprint,
    );
    result.externalSnapshotFingerprints = [
      ...new Set(result.externalSnapshotFingerprints),
    ];
    result.checkStatuses = {
      ...result.checkStatuses,
      "external-references": result.referenceModes.every(
        (mode) => mode === "empty",
      )
        ? "not-applicable"
        : "pass",
      "reference-fidelity": result.referenceModes.includes(
        "exact-demo-localized",
      )
        ? "pass"
        : "not-applicable",
      "scene-packages": "pass",
    };
    const registry = await generateRendererRegistryFromProjectFiles({
      rootDir,
      projectId: paths.storyId,
      mode: "check",
    });
    if (registry === null) {
      throw new Error("Ready Scene coverage requires a RendererRegistry.");
    }
    result.rendererRegistryFingerprint = registry.registryFingerprint;
    result.checkStatuses = {
      ...result.checkStatuses,
      "renderer-registry": "pass",
    };
    const hardCuts = semanticTiming.storyBeats.slice(1).map((beat, index) => ({
      fromMeaningId: semanticTiming.storyBeats[index]?.meaningId,
      toMeaningId: beat.meaningId,
      kind: "hard-cut" as const,
      durationInFrames: 0,
    }));
    const visualProjection = buildStoryVisualProjection({
      storyId: paths.storyId,
      leadInFrames: semanticTiming.leadInFrames,
      tailFrames: semanticTiming.tailFrames,
      durationInFrames: semanticTiming.durationInFrames,
      storyBeatTimings: semanticTiming.storyBeats,
      coverage,
      packages,
      registryFingerprint: registry.registryFingerprint,
      transitions: hardCuts,
    });
    const projectSound = ProjectSoundPlanSchema.parse(
      await loadProjectCheckJson(
        projectArtifactPath(rootDir, paths.storyId, "sound.json"),
        "sound.json",
      ),
    );
    const projectSoundResourceIds = new Set(
      projectSound.contributions.map(({ resourceId }) => resourceId),
    );
    const soundProjection = buildSoundDesignProjection({
      storyId: paths.storyId,
      coverage,
      storyBeatTimings: semanticTiming.storyBeats,
      sceneSoundProjections: soundProjections,
      projectSoundPlan: projectSound,
      projectSoundResources: catalog.entries
        .map(({ descriptor }) => descriptor)
        .filter(
          (descriptor) =>
            descriptor.kind === "asset" &&
            descriptor.mediaRole === "background-music" &&
            projectSoundResourceIds.has(descriptor.id),
        ),
    });
    result.storyVisualProjectionFingerprint =
      visualProjection.projectionFingerprint;
    result.soundDesignProjectionFingerprint =
      soundProjection.soundDesignProjectionFingerprint;
    result.checkStatuses = {
      ...result.checkStatuses,
      "scene-projections": "pass",
    };
  }

  const compositionSource = await loadProjectCheckText(
    paths.composition,
    "Composition.tsx",
  );
  const hasReadyScenes = ready.length > 0;
  if (
    (hasReadyScenes &&
      (!compositionSource.includes("storyVisualTrack=") ||
        !compositionSource.includes("soundDesignTrack="))) ||
    (!hasReadyScenes &&
      (compositionSource.includes("storyVisualTrack=") ||
        compositionSource.includes("soundDesignTrack=")))
  ) {
    throw new Error("CompositionAssembly Scene slot wiring is stale.");
  }
  result.compositionAssemblyChecksum = checksumExternalBytes(
    Buffer.from(compositionSource, "utf8"),
  );
  result.checkStatuses = {
    ...result.checkStatuses,
    "composition-assembly": "pass",
  };
  return result;
};

const SAFE_FAILURE = {
  missing: "Required final mechanical artifact is missing.",
  malformed: "Required final mechanical artifact is malformed.",
  stale: "Required final mechanical artifact is stale.",
  "checksum-mismatch": "Final mechanical artifact checksum does not match.",
  "identity-mismatch": "Final mechanical artifact identity does not match.",
  "registry-drift": "RendererRegistry generated bytes are stale.",
  unexpected: "Unexpected final mechanical validation failure.",
} as const;

const failureReason = (error: unknown) => {
  const raw = error instanceof Error ? error.message.toLowerCase() : "";
  const code = /missing|unreadable|enoent|not found/.test(raw)
    ? "missing"
    : /malformed|json|invalid|unrecognized/.test(raw)
      ? "malformed"
      : /checksum/.test(raw)
        ? "checksum-mismatch"
        : /registry/.test(raw) && /stale|drift/.test(raw)
          ? "registry-drift"
          : /does not match|mismatch/.test(raw)
            ? "identity-mismatch"
            : /stale|drift/.test(raw)
              ? "stale"
              : "unexpected";
  return { code, message: SAFE_FAILURE[code] } as const;
};

const failedAssemblyBranch = (): FinalAssemblyBranchResult => {
  const missing = new Error("Required final mechanical artifact is missing.");
  return {
    globalVisualPlanFingerprint: null,
    globalVisualProjectionFingerprint: null,
    finalAssemblyFingerprint: null,
    checkStatuses: {
      "global-visual": "fail",
      "final-assembly": "fail",
    },
    checkErrors: {
      "global-visual": missing,
      "final-assembly": missing,
    },
  };
};

const projectArtifactPath = (
  rootDir: string,
  projectId: string,
  path: string,
) => join(rootDir, "src", "projects", projectId, path);

const pathExists = async (path: string) => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

export const loadCurrentFinalAssemblyBranch = async ({
  rootDir,
  projectId,
  sceneBranch,
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly sceneBranch: FinalSceneBranchResult;
  readonly includeMediaEvidence?: boolean;
}): Promise<FinalAssemblyBranchResult> => {
  const result = failedAssemblyBranch();
  const statuses = { ...result.checkStatuses };
  const errors = { ...result.checkErrors };
  let globalVisual: ReturnType<typeof GlobalVisualPlanSchema.parse> | null =
    null;
  let assembly: ReturnType<typeof FinalAssemblyPlanSchema.parse> | null = null;
  let assemblyCatalog: ReturnType<typeof ResourceCatalogSchema.parse> | null =
    null;

  try {
    assemblyCatalog = ResourceCatalogSchema.parse(
      await loadProjectCheckJson(
        projectArtifactPath(
          rootDir,
          projectId,
          "generated/resource-catalog.generated.json",
        ),
        "resource-catalog.generated.json",
      ),
    );
  } catch (error) {
    errors["global-visual"] = error;
  }

  try {
    globalVisual = GlobalVisualPlanSchema.parse(
      await loadProjectCheckJson(
        projectArtifactPath(rootDir, projectId, "global-visual-plan.json"),
        "global-visual-plan.json",
      ),
    );
    if (
      globalVisual.storyId !== projectId ||
      assemblyCatalog === null ||
      globalVisual.catalogFingerprint !== assemblyCatalog.catalogFingerprint
    ) {
      throw new Error(
        "GlobalVisualPlan identity does not match current project.",
      );
    }
    statuses["global-visual"] = "pass";
  } catch (error) {
    errors["global-visual"] = error;
  }

  try {
    assembly = FinalAssemblyPlanSchema.parse(
      await loadProjectCheckJson(
        projectArtifactPath(
          rootDir,
          projectId,
          "generated/final-assembly.generated.json",
        ),
        "final-assembly.generated.json",
      ),
    );
    if (
      globalVisual === null ||
      assembly.storyId !== projectId ||
      assembly.globalVisualPlanFingerprint !== globalVisual.planFingerprint ||
      assemblyCatalog === null ||
      assembly.resourceCatalogFingerprint !==
        assemblyCatalog.catalogFingerprint ||
      assembly.sceneCoverageFingerprint !==
        sceneBranch.sceneCoverageFingerprint ||
      assembly.rendererRegistryFingerprint !==
        sceneBranch.rendererRegistryFingerprint ||
      assembly.storyVisualProjectionFingerprint !==
        sceneBranch.storyVisualProjectionFingerprint ||
      assembly.soundDesignProjectionFingerprint !==
        sceneBranch.soundDesignProjectionFingerprint ||
      assembly.compositionSourceChecksum !==
        (await checksumFile(
          projectArtifactPath(rootDir, projectId, "Composition.tsx"),
        ))
    ) {
      throw new Error("FinalAssembly identity does not match current inputs.");
    }
    statuses["final-assembly"] = "pass";
  } catch (error) {
    errors["final-assembly"] = error;
  }

  return {
    globalVisualPlanFingerprint: globalVisual?.planFingerprint ?? null,
    globalVisualProjectionFingerprint:
      assembly?.globalVisualProjectionFingerprint ?? null,
    finalAssemblyFingerprint: assembly?.finalAssemblyFingerprint ?? null,
    checkStatuses: statuses,
    checkErrors: errors,
  };
};

export const checkFinalSourceHealth = async ({
  rootDir,
  projectId,
  loadSceneBranch = loadCurrentFinalSceneBranch,
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly loadSceneBranch?: (input: {
    readonly rootDir: string;
    readonly projectId: string;
    readonly includeMediaEvidence?: boolean;
  }) => Promise<FinalSceneBranchResult>;
}) => {
  const sceneBranch = await loadSceneBranch({
    rootDir,
    projectId,
    includeMediaEvidence: false,
  });
  const failedScene = Object.entries(sceneBranch.checkStatuses).find(
    ([, status]) => status === "fail",
  );
  if (failedScene !== undefined) {
    throw new Error(`Final source Scene check failed: ${failedScene[0]}.`);
  }
  if (
    !(await pathExists(
      projectArtifactPath(rootDir, projectId, "final-assembly-plan.json"),
    ))
  ) {
    return { storyId: projectId, aggregateStatus: "pass" as const };
  }
  const assemblyBranch = await loadCurrentFinalAssemblyBranch({
    rootDir,
    projectId,
    sceneBranch,
    includeMediaEvidence: false,
  });
  for (const checkId of ["global-visual", "final-assembly"] as const) {
    if (assemblyBranch.checkStatuses[checkId] !== "pass") {
      throw new Error(`Final source assembly check failed: ${checkId}.`, {
        cause: assemblyBranch.checkErrors[checkId],
      });
    }
  }
  return { storyId: projectId, aggregateStatus: "pass" as const };
};

export const runFinalMechanicalCheck = async ({
  rootDir,
  projectId,
  runNarrativeBaselineEvidenceProcess,
  loadSceneBranch = loadCurrentFinalSceneBranch,
  loadAssemblyBranch = loadCurrentFinalAssemblyBranch,
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly runNarrativeBaselineEvidenceProcess?: ProcessRunner;
  readonly loadSceneBranch?: (input: {
    readonly rootDir: string;
    readonly projectId: string;
  }) => Promise<FinalSceneBranchResult>;
  readonly loadAssemblyBranch?: (input: {
    readonly rootDir: string;
    readonly projectId: string;
    readonly sceneBranch: FinalSceneBranchResult;
  }) => Promise<FinalAssemblyBranchResult>;
}) => {
  let narrativeReportFingerprint: Sha256Digest | null = null;
  let narrativeStatus: "pass" | "fail" = "fail";
  let narrativeError: unknown;
  try {
    const narrative = await runNarrativeAutoCheck({
      rootDir,
      projectId,
      runNarrativeBaselineEvidenceProcess,
    });
    if (narrative.aggregateStatus !== "pass") {
      throw new Error("Narrative project check is stale.");
    }
    await checkPersistedNarrativeAutoCheck({
      rootDir,
      expectedReport: narrative,
    });
    narrativeReportFingerprint = narrative.reportFingerprint;
    narrativeStatus = "pass";
  } catch (error) {
    narrativeError = error;
  }
  let sceneBranch = failedSceneBranch();
  let sceneError: unknown;
  try {
    sceneBranch = { ...(await loadSceneBranch({ rootDir, projectId })) };
  } catch (error) {
    sceneError = error;
  }
  const checks: FinalMechanicalCheckReportInput["checks"] =
    FINAL_MECHANICAL_CHECK_IDS.map((checkId) => {
      if (checkId === "narrative") {
        return {
          checkId,
          status: narrativeStatus,
          failureReasons:
            narrativeStatus === "pass" ? [] : [failureReason(narrativeError)],
        };
      }
      const status = sceneBranch.checkStatuses[checkId];
      return {
        checkId,
        status,
        failureReasons: status === "fail" ? [failureReason(sceneError)] : [],
      };
    });
  const aggregateStatus = checks.some((check) => check.status === "fail")
    ? "fail"
    : "pass";
  let assemblyDeclared = false;
  try {
    await access(
      projectArtifactPath(rootDir, projectId, "final-assembly-plan.json"),
    );
    assemblyDeclared = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT")
      assemblyDeclared = true;
  }
  if (!assemblyDeclared) {
    return createFinalMechanicalCheckReport({
      schemaVersion: 1,
      reportVersion: "final-mechanical-check-v1",
      storyId: projectId,
      level: "final",
      aggregateStatus,
      inputIdentity: {
        narrativeReportFingerprint,
        visualStyleFingerprint: sceneBranch.visualStyleFingerprint,
        resourceCatalogFingerprint: sceneBranch.resourceCatalogFingerprint,
        referenceModes: sceneBranch.referenceModes,
        externalSnapshotFingerprints: sceneBranch.externalSnapshotFingerprints,
        fidelityReceiptFingerprints: sceneBranch.fidelityReceiptFingerprints,
        sceneCoverageFingerprint: sceneBranch.sceneCoverageFingerprint,
        scenePackageFingerprints: sceneBranch.scenePackageFingerprints,
        rendererRegistryFingerprint: sceneBranch.rendererRegistryFingerprint,
        storyVisualProjectionFingerprint:
          sceneBranch.storyVisualProjectionFingerprint,
        soundDesignProjectionFingerprint:
          sceneBranch.soundDesignProjectionFingerprint,
        compositionAssemblyChecksum: sceneBranch.compositionAssemblyChecksum,
      },
      checks,
    });
  }

  let assemblyBranch = failedAssemblyBranch();
  try {
    assemblyBranch = await loadAssemblyBranch({
      rootDir,
      projectId,
      sceneBranch,
    });
  } catch (error) {
    assemblyBranch = {
      ...assemblyBranch,
      checkErrors: Object.fromEntries(
        Object.keys(assemblyBranch.checkErrors).map((checkId) => [
          checkId,
          error,
        ]),
      ) as Record<AssemblyCheckId, unknown>,
    };
  }
  const assemblyCheckIds = FINAL_MECHANICAL_CHECK_V2_IDS.slice(
    FINAL_MECHANICAL_CHECK_IDS.length,
  ) as readonly AssemblyCheckId[];
  const assemblyChecks = assemblyCheckIds.map((checkId) => {
    const status = assemblyBranch.checkStatuses[checkId];
    return {
      checkId,
      status,
      failureReasons:
        status === "pass"
          ? []
          : [failureReason(assemblyBranch.checkErrors[checkId])],
    };
  });
  const v2Checks = [
    ...checks,
    ...assemblyChecks,
  ] as FinalMechanicalCheckV2ReportInput["checks"];
  const v2AggregateStatus = v2Checks.some((check) => check.status === "fail")
    ? "fail"
    : "pass";
  return createFinalMechanicalCheckV2Report({
    schemaVersion: 2,
    reportVersion: "final-mechanical-check-v2",
    storyId: projectId,
    level: "final",
    aggregateStatus: v2AggregateStatus,
    inputIdentity: {
      narrativeReportFingerprint,
      visualStyleFingerprint: sceneBranch.visualStyleFingerprint,
      resourceCatalogFingerprint: sceneBranch.resourceCatalogFingerprint,
      referenceModes: sceneBranch.referenceModes,
      externalSnapshotFingerprints: sceneBranch.externalSnapshotFingerprints,
      fidelityReceiptFingerprints: sceneBranch.fidelityReceiptFingerprints,
      sceneCoverageFingerprint: sceneBranch.sceneCoverageFingerprint,
      scenePackageFingerprints: sceneBranch.scenePackageFingerprints,
      rendererRegistryFingerprint: sceneBranch.rendererRegistryFingerprint,
      storyVisualProjectionFingerprint:
        sceneBranch.storyVisualProjectionFingerprint,
      soundDesignProjectionFingerprint:
        sceneBranch.soundDesignProjectionFingerprint,
      compositionAssemblyChecksum: sceneBranch.compositionAssemblyChecksum,
      globalVisualPlanFingerprint: assemblyBranch.globalVisualPlanFingerprint,
      globalVisualProjectionFingerprint:
        assemblyBranch.globalVisualProjectionFingerprint,
      finalAssemblyFingerprint: assemblyBranch.finalAssemblyFingerprint,
    },
    checks: v2Checks,
  });
};

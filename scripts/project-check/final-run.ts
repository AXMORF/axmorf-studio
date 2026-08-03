import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import {
  FINAL_MECHANICAL_CHECK_IDS,
  FINAL_MECHANICAL_CHECK_V2_IDS,
  FinalAssemblyPlanSchema,
  FinalPreviewApprovalSchema,
  FinalPreviewEvidenceSchema,
  GlobalSoundPlanSchema,
  GlobalVisualPlanSchema,
  ReferenceFidelityReceiptSchema,
  ReferenceFidelityReviewSchema,
  ResourceCatalogSchema,
  ResourceDescriptorSchema,
  SCENE_AUDIO_RUNTIME_VERSION,
  STORY_VISUAL_RUNTIME_VERSION,
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

type M8CheckId = Extract<
  FinalMechanicalCheckV2Id,
  | "global-sound"
  | "global-visual"
  | "final-assembly"
  | "final-preview-evidence"
  | "final-preview-approval"
>;

export type FinalM8BranchResult = Readonly<{
  globalSoundPlanFingerprint: string | null;
  finalSoundProjectionFingerprint: string | null;
  globalVisualPlanFingerprint: string | null;
  globalVisualProjectionFingerprint: string | null;
  finalAssemblyFingerprint: string | null;
  finalPreviewEvidenceFingerprint: string | null;
  finalPreviewApprovalFingerprint: string | null;
  checkStatuses: Readonly<Record<M8CheckId, "pass" | "fail">>;
  checkErrors: Readonly<Record<M8CheckId, unknown>>;
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

const scenePath = (
  rootDir: string,
  storyId: string,
  meaningId: string,
  path: string,
) => join(rootDir, "src/projects", storyId, "scenes", meaningId, path);

const validateReviewArtifacts = async ({
  rootDir,
  review,
}: {
  readonly rootDir: string;
  readonly review: ReturnType<typeof ReferenceFidelityReviewSchema.parse>;
}) => {
  for (const item of review.items) {
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
        throw new Error("Reference review evidence checksum is stale.");
      }
    }
  }
};

export const loadCurrentFinalSceneBranch = async ({
  rootDir,
  projectId,
}: {
  readonly rootDir: string;
  readonly projectId: string;
}): Promise<FinalSceneBranchResult> => {
  const result = failedSceneBranch();
  const paths = getProjectCheckPaths({ rootDir, projectId });
  await generateResourceCatalog({ rootDir, mode: "check" });
  const catalog = ResourceCatalogSchema.parse(
    await readGeneratedResourceCatalog(rootDir),
  );
  result.resourceCatalogFingerprint = catalog.catalogFingerprint;
  result.checkStatuses = {
    ...result.checkStatuses,
    "resource-catalog": "pass",
  };
  const visualStyle = VisualStyleSpecSchema.parse(
    await loadProjectCheckJson(paths.visualStyle, "visual-style.json"),
  );
  const styleEntry = catalog.entries.find(
    (entry) =>
      entry.descriptor.kind === "style-profile" &&
      entry.descriptor.styleProfileId === visualStyle.styleProfileId,
  );
  if (
    visualStyle.storyId !== paths.storyId ||
    visualStyle.resourceCatalogFingerprint !== catalog.catalogFingerprint ||
    styleEntry === undefined
  ) {
    throw new Error("VisualStyleSpec identity is stale.");
  }
  result.visualStyleFingerprint = computeVisualStyleFingerprint({
    visualStyle,
    resolvedStyleDescriptorFingerprint: styleEntry.descriptorFingerprint,
  });
  result.checkStatuses = { ...result.checkStatuses, "visual-style": "pass" };

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
        visualRuntimeVersion: STORY_VISUAL_RUNTIME_VERSION,
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
            selected.role === "scene-ambience" || selected.role === "scene-sfx",
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
      const review = ReferenceFidelityReviewSchema.parse(
        await loadProjectCheckJson(
          scenePath(
            rootDir,
            paths.storyId,
            meaningId,
            "generated/reference-fidelity-review.generated.json",
          ),
          "reference-fidelity-review.generated.json",
        ),
      );
      if (review.reviewFingerprint !== fidelity.reviewFingerprint) {
        throw new Error("Reference fidelity review identity is stale.");
      }
      await validateReviewArtifacts({ rootDir, review });
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
    const soundProjection = buildSoundDesignProjection({
      storyId: paths.storyId,
      coverage,
      storyBeatTimings: semanticTiming.storyBeats,
      sceneSoundProjections: soundProjections,
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

const failedM8Branch = (): FinalM8BranchResult => {
  const missing = new Error("Required M8 final mechanical artifact is missing.");
  return {
    globalSoundPlanFingerprint: null,
    finalSoundProjectionFingerprint: null,
    globalVisualPlanFingerprint: null,
    globalVisualProjectionFingerprint: null,
    finalAssemblyFingerprint: null,
    finalPreviewEvidenceFingerprint: null,
    finalPreviewApprovalFingerprint: null,
    checkStatuses: {
      "global-sound": "fail",
      "global-visual": "fail",
      "final-assembly": "fail",
      "final-preview-evidence": "fail",
      "final-preview-approval": "fail",
    },
    checkErrors: {
      "global-sound": missing,
      "global-visual": missing,
      "final-assembly": missing,
      "final-preview-evidence": missing,
      "final-preview-approval": new Error("FinalPreviewApproval is missing."),
    },
  };
};

const projectM8Path = (
  rootDir: string,
  projectId: string,
  path: string,
) => join(rootDir, "src", "projects", projectId, path);

export const loadCurrentFinalM8Branch = async ({
  rootDir,
  projectId,
  sceneBranch,
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly sceneBranch: FinalSceneBranchResult;
}): Promise<FinalM8BranchResult> => {
  const result = failedM8Branch();
  const statuses = {...result.checkStatuses};
  const errors = {...result.checkErrors};
  let globalSound: ReturnType<typeof GlobalSoundPlanSchema.parse> | null = null;
  let globalVisual: ReturnType<typeof GlobalVisualPlanSchema.parse> | null = null;
  let assembly: ReturnType<typeof FinalAssemblyPlanSchema.parse> | null = null;
  let evidence: ReturnType<typeof FinalPreviewEvidenceSchema.parse> | null = null;

  try {
    globalSound = GlobalSoundPlanSchema.parse(
      await loadProjectCheckJson(
        projectM8Path(rootDir, projectId, "global-sound-plan.json"),
        "global-sound-plan.json",
      ),
    );
    if (
      globalSound.storyId !== projectId ||
      globalSound.catalogFingerprint !== sceneBranch.resourceCatalogFingerprint
    ) {
      throw new Error("GlobalSoundPlan identity does not match current project.");
    }
    statuses["global-sound"] = "pass";
  } catch (error) {
    errors["global-sound"] = error;
  }

  try {
    globalVisual = GlobalVisualPlanSchema.parse(
      await loadProjectCheckJson(
        projectM8Path(rootDir, projectId, "global-visual-plan.json"),
        "global-visual-plan.json",
      ),
    );
    if (
      globalVisual.storyId !== projectId ||
      globalVisual.catalogFingerprint !== sceneBranch.resourceCatalogFingerprint
    ) {
      throw new Error("GlobalVisualPlan identity does not match current project.");
    }
    statuses["global-visual"] = "pass";
  } catch (error) {
    errors["global-visual"] = error;
  }

  try {
    assembly = FinalAssemblyPlanSchema.parse(
      await loadProjectCheckJson(
        projectM8Path(
          rootDir,
          projectId,
          "generated/final-assembly.generated.json",
        ),
        "final-assembly.generated.json",
      ),
    );
    if (
      globalSound === null ||
      globalVisual === null ||
      assembly.storyId !== projectId ||
      assembly.globalSoundPlanFingerprint !== globalSound.planFingerprint ||
      assembly.globalVisualPlanFingerprint !== globalVisual.planFingerprint ||
      assembly.resourceCatalogFingerprint !==
        sceneBranch.resourceCatalogFingerprint ||
      assembly.sceneCoverageFingerprint !==
        sceneBranch.sceneCoverageFingerprint ||
      assembly.rendererRegistryFingerprint !==
        sceneBranch.rendererRegistryFingerprint ||
      assembly.storyVisualProjectionFingerprint !==
        sceneBranch.storyVisualProjectionFingerprint ||
      assembly.soundDesignProjectionFingerprint !==
        sceneBranch.soundDesignProjectionFingerprint ||
      assembly.compositionSourceChecksum !==
        (await checksumFile(projectM8Path(rootDir, projectId, "Composition.tsx")))
    ) {
      throw new Error("FinalAssembly identity does not match current inputs.");
    }
    statuses["final-assembly"] = "pass";
  } catch (error) {
    errors["final-assembly"] = error;
  }

  try {
    evidence = FinalPreviewEvidenceSchema.parse(
      await loadProjectCheckJson(
        projectM8Path(
          rootDir,
          projectId,
          "generated/m8-final-preview-evidence.generated.json",
        ),
        "m8-final-preview-evidence.generated.json",
      ),
    );
    if (
      assembly === null ||
      evidence.storyId !== projectId ||
      evidence.finalAssemblyFingerprint !==
        assembly.finalAssemblyFingerprint ||
      evidence.resourceCatalogFingerprint !==
        sceneBranch.resourceCatalogFingerprint
    ) {
      throw new Error("FinalPreviewEvidence identity does not match assembly.");
    }
    statuses["final-preview-evidence"] = "pass";
  } catch (error) {
    errors["final-preview-evidence"] = error;
  }

  let approvalFingerprint: string | null = null;
  try {
    const approval = FinalPreviewApprovalSchema.parse(
      await loadProjectCheckJson(
        projectM8Path(
          rootDir,
          projectId,
          "generated/final-preview-approval.generated.json",
        ),
        "final-preview-approval.generated.json",
      ),
    );
    if (
      evidence === null ||
      assembly === null ||
      approval.storyId !== projectId ||
      approval.previewChecksum !== evidence.media.fullPreview.checksum ||
      approval.evidenceFingerprint !== evidence.evidenceFingerprint ||
      approval.finalAssemblyFingerprint !== assembly.finalAssemblyFingerprint
    ) {
      throw new Error("FinalPreviewApproval identity does not match preview.");
    }
    approvalFingerprint = approval.approvalFingerprint;
    statuses["final-preview-approval"] = "pass";
  } catch (error) {
    errors["final-preview-approval"] = error;
  }

  return {
    globalSoundPlanFingerprint: globalSound?.planFingerprint ?? null,
    finalSoundProjectionFingerprint:
      assembly?.finalSoundProjectionFingerprint ?? null,
    globalVisualPlanFingerprint: globalVisual?.planFingerprint ?? null,
    globalVisualProjectionFingerprint:
      assembly?.globalVisualProjectionFingerprint ?? null,
    finalAssemblyFingerprint: assembly?.finalAssemblyFingerprint ?? null,
    finalPreviewEvidenceFingerprint: evidence?.evidenceFingerprint ?? null,
    finalPreviewApprovalFingerprint: approvalFingerprint,
    checkStatuses: statuses,
    checkErrors: errors,
  };
};

export const runFinalMechanicalCheck = async ({
  rootDir,
  projectId,
  runM3EvidenceProcess,
  loadSceneBranch = loadCurrentFinalSceneBranch,
  loadM8Branch = loadCurrentFinalM8Branch,
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly runM3EvidenceProcess?: ProcessRunner;
  readonly loadSceneBranch?: (input: {
    readonly rootDir: string;
    readonly projectId: string;
  }) => Promise<FinalSceneBranchResult>;
  readonly loadM8Branch?: (input: {
    readonly rootDir: string;
    readonly projectId: string;
    readonly sceneBranch: FinalSceneBranchResult;
  }) => Promise<FinalM8BranchResult>;
}) => {
  let narrativeReportFingerprint: Sha256Digest | null = null;
  let narrativeStatus: "pass" | "fail" = "fail";
  let narrativeError: unknown;
  try {
    const narrative = await runNarrativeAutoCheck({
      rootDir,
      projectId,
      runM3EvidenceProcess,
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
  let m8Declared = false;
  try {
    await access(projectM8Path(rootDir, projectId, "final-assembly-plan.json"));
    m8Declared = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") m8Declared = true;
  }
  if (!m8Declared) {
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

  let m8Branch = failedM8Branch();
  try {
    m8Branch = await loadM8Branch({rootDir, projectId, sceneBranch});
  } catch (error) {
    m8Branch = {
      ...m8Branch,
      checkErrors: Object.fromEntries(
        Object.keys(m8Branch.checkErrors).map((checkId) => [checkId, error]),
      ) as Record<M8CheckId, unknown>,
    };
  }
  const m8CheckIds = FINAL_MECHANICAL_CHECK_V2_IDS.slice(
    FINAL_MECHANICAL_CHECK_IDS.length,
  ) as readonly M8CheckId[];
  const m8Checks = m8CheckIds.map((checkId) => {
    const status = m8Branch.checkStatuses[checkId];
    return {
      checkId,
      status,
      failureReasons:
        status === "pass" ? [] : [failureReason(m8Branch.checkErrors[checkId])],
    };
  });
  const v2Checks = [...checks, ...m8Checks] as FinalMechanicalCheckV2ReportInput["checks"];
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
      globalSoundPlanFingerprint: m8Branch.globalSoundPlanFingerprint,
      finalSoundProjectionFingerprint:
        m8Branch.finalSoundProjectionFingerprint,
      globalVisualPlanFingerprint: m8Branch.globalVisualPlanFingerprint,
      globalVisualProjectionFingerprint:
        m8Branch.globalVisualProjectionFingerprint,
      finalAssemblyFingerprint: m8Branch.finalAssemblyFingerprint,
      finalPreviewEvidenceFingerprint:
        m8Branch.finalPreviewEvidenceFingerprint,
      finalPreviewApprovalFingerprint:
        m8Branch.finalPreviewApprovalFingerprint,
    },
    checks: v2Checks,
  });
};

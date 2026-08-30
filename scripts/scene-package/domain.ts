import {
  ReferenceFidelityReceiptSchema,
  ResourceDescriptorSchema,
  SCENE_AUDIO_RUNTIME_VERSION,
  SCENE_VISUAL_RUNTIME_VERSION,
  ScenePackageSchema,
  SceneRendererBindingSchema,
  SceneSoundPlanSchema,
  SceneSyncAnchorSetSchema,
  SceneTaskInputSchema,
  SceneVisualPlanSchema,
  ShotPlanSetSchema,
  ShotRecipeSelectionSchema,
  Sha256DigestSchema,
  computeScenePackageFingerprint,
  computeSceneSoundFingerprint,
  computeSceneVisualFingerprint,
  serializeCanonicalJson,
  validateScenePlanBundle,
  validateSelectedResourceRef,
  type ScenePackage,
} from "@axmorf/studio/contracts";

type SceneArtifactBundleInput = {
  readonly task: unknown;
  readonly visual: unknown;
  readonly shots: unknown;
  readonly anchors: unknown;
  readonly sound: unknown;
  readonly selection: unknown;
  readonly fidelityReceipt: unknown;
  readonly selectedResources: readonly {
    readonly selected: unknown;
    readonly descriptor: unknown;
  }[];
};

export const validateSceneArtifactBundle = (
  rawInput: SceneArtifactBundleInput,
) => {
  const task = SceneTaskInputSchema.parse(rawInput.task);
  const visual = SceneVisualPlanSchema.parse(rawInput.visual);
  const shots = ShotPlanSetSchema.parse(rawInput.shots);
  const anchors = SceneSyncAnchorSetSchema.parse(rawInput.anchors);
  const sound = SceneSoundPlanSchema.parse(rawInput.sound);
  const selection = ShotRecipeSelectionSchema.parse(rawInput.selection);
  const fidelityReceipt = ReferenceFidelityReceiptSchema.parse(
    rawInput.fidelityReceipt,
  );
  validateScenePlanBundle({
    taskInputFingerprint: task.taskInputFingerprint,
    meaningId: task.meaningId,
    sceneDurationInFrames:
      task.timingBeat.endFrame - task.timingBeat.startFrame,
    allowedResourceIds: task.allowedResourceIds,
    visualPlan: visual,
    shotPlan: shots,
    syncAnchors: anchors,
    soundPlan: sound,
  });
  if (
    selection.taskInputFingerprint !== task.taskInputFingerprint ||
    fidelityReceipt.selectionFingerprint !== selection.selectionFingerprint
  ) {
    throw new Error("Scene recipe or fidelity identity is stale.");
  }
  const modes = new Set(selection.selections.map((entry) => entry.mode));
  const mode =
    selection.selections.length === 0
      ? "empty"
      : modes.size === 1
        ? selection.selections[0].mode
        : "mixed";
  if (mode === "mixed" || visual.recipeDecision !== mode) {
    throw new Error(
      "Scene recipe decision does not match its selection state.",
    );
  }
  if (
    (mode === "exact-demo-localized" && fidelityReceipt.status !== "pass") ||
    (mode !== "exact-demo-localized" &&
      (fidelityReceipt.status !== "not-applicable" ||
        fidelityReceipt.reason !== mode))
  ) {
    throw new Error(
      "Scene fidelity applicability does not match its recipe mode.",
    );
  }
  const allowedSnapshots = new Set(
    task.allowedSnapshots.map(({ snapshotFingerprint }) => snapshotFingerprint),
  );
  if (
    selection.selections.some(
      (entry) => !allowedSnapshots.has(entry.snapshotFingerprint),
    )
  ) {
    throw new Error(
      "Scene recipe snapshot is outside the frozen task allowlist.",
    );
  }
  const selectedResources = rawInput.selectedResources
    .map(({ selected, descriptor }) => {
      const parsedDescriptor = ResourceDescriptorSchema.parse(descriptor);
      return validateSelectedResourceRef({
        selected,
        descriptor: parsedDescriptor,
        currentCatalogFingerprint: task.resourceCatalogFingerprint,
      });
    })
    .sort((left, right) => left.resourceId.localeCompare(right.resourceId));
  const requiredResourceIds = new Set([
    ...visual.visualResourceIds,
    ...shots.shots.flatMap((shot) => shot.visualResourceIds),
    ...sound.contributions.map(
      (contribution) => contribution.resource.resourceId,
    ),
  ]);
  if (
    selectedResources.length !== requiredResourceIds.size ||
    selectedResources.some(
      (resource) => !requiredResourceIds.has(resource.resourceId),
    )
  ) {
    throw new Error(
      "Scene package selected resources do not exactly cover authored plans.",
    );
  }
  if (
    task.storyBeat.kind === "silent-scene" &&
    JSON.stringify(selectedResources.map(({ resourceId }) => resourceId)) !==
      JSON.stringify(task.storyBeat.preset.resourceIds)
  ) {
    throw new Error(
      "Silent Scene package resources must exactly consume its selected preset.",
    );
  }
  return {
    task,
    visual,
    shots,
    anchors,
    sound,
    selection,
    fidelityReceipt,
    selectedResources,
  } as const;
};

export const buildScenePackage = (
  rawInput: SceneArtifactBundleInput & {
    readonly rendererBinding: {
      readonly rendererId: unknown;
      readonly rendererSourceFingerprint: unknown;
    };
    readonly current: {
      readonly timingBeat: unknown;
      readonly semanticTimingFingerprint: unknown;
      readonly visualStyleFingerprint: unknown;
      readonly resourceCatalogFingerprint: unknown;
      readonly snapshotFingerprints: readonly unknown[];
      readonly rendererSourceFingerprint: unknown;
      readonly visualRuntimeVersion: unknown;
      readonly sceneAudioRuntimeVersion: unknown;
    };
  },
): ScenePackage => {
  const {
    task,
    visual,
    shots,
    anchors,
    sound,
    selection,
    fidelityReceipt,
    selectedResources,
  } = validateSceneArtifactBundle(rawInput);
  const rendererBinding = SceneRendererBindingSchema.parse(
    rawInput.rendererBinding,
  );
  const currentSnapshotFingerprints = rawInput.current.snapshotFingerprints.map(
    (fingerprint) => Sha256DigestSchema.parse(fingerprint),
  );
  const currentSemanticTimingFingerprint = Sha256DigestSchema.parse(
    rawInput.current.semanticTimingFingerprint,
  );
  if (
    serializeCanonicalJson(rawInput.current.timingBeat) !==
      serializeCanonicalJson(task.timingBeat) ||
    rawInput.current.visualStyleFingerprint !== task.visualStyleFingerprint ||
    rawInput.current.resourceCatalogFingerprint !==
      task.resourceCatalogFingerprint ||
    JSON.stringify(currentSnapshotFingerprints) !==
      JSON.stringify(
        task.allowedSnapshots.map((snapshot) => snapshot.snapshotFingerprint),
      ) ||
    rawInput.current.rendererSourceFingerprint !==
      rendererBinding.rendererSourceFingerprint ||
    rawInput.current.visualRuntimeVersion !== SCENE_VISUAL_RUNTIME_VERSION ||
    rawInput.current.sceneAudioRuntimeVersion !== SCENE_AUDIO_RUNTIME_VERSION
  ) {
    throw new Error("Scene package current authority inputs are stale.");
  }
  const currentSnapshots = new Set(currentSnapshotFingerprints);
  if (
    selection.selections.some(
      (entry) => !currentSnapshots.has(entry.snapshotFingerprint),
    )
  ) {
    throw new Error(
      "Scene recipe snapshot is outside the current frozen allowlist.",
    );
  }
  const commonBase = {
    storyId: task.storyId,
    meaningId: task.meaningId,
    beatFrameRange: {
      startFrame: task.timingBeat.startFrame,
      endFrame: task.timingBeat.endFrame,
    },
    taskInputFingerprint: task.taskInputFingerprint,
    semanticTimingFingerprint: currentSemanticTimingFingerprint,
    visualStyleFingerprint: task.visualStyleFingerprint,
    resourceCatalogFingerprint: task.resourceCatalogFingerprint,
    externalSnapshotFingerprints: currentSnapshotFingerprints,
    selectionFingerprint: selection.selectionFingerprint,
    fidelityReceiptFingerprint: fidelityReceipt.receiptFingerprint,
    visualPlanFingerprint: visual.visualPlanFingerprint,
    shotPlanFingerprint: shots.shotPlanFingerprint,
    syncAnchorFingerprint: anchors.syncAnchorFingerprint,
    soundPlanFingerprint: sound.soundPlanFingerprint,
    rendererBinding,
    selectedResources,
    visualRuntimeVersion: SCENE_VISUAL_RUNTIME_VERSION,
    sceneAudioRuntimeVersion: SCENE_AUDIO_RUNTIME_VERSION,
  };
  const base = {
    schemaVersion: 6 as const,
    ...commonBase,
    visualRuntimeVersion: SCENE_VISUAL_RUNTIME_VERSION,
    sceneViewportFingerprint: task.sceneViewport.viewportFingerprint,
    sceneCompositionBoundaryVersion: task.sceneCompositionBoundaryVersion,
    scenePresetFingerprint:
      task.storyBeat.kind === "silent-scene"
        ? task.storyBeat.preset.presetFingerprint
        : null,
  };
  const visualInput = {
    taskInputFingerprint: base.taskInputFingerprint,
    visualStyleFingerprint: base.visualStyleFingerprint,
    resourceCatalogFingerprint: base.resourceCatalogFingerprint,
    externalSnapshotFingerprints: base.externalSnapshotFingerprints,
    selectionFingerprint: base.selectionFingerprint,
    fidelityReceiptFingerprint: base.fidelityReceiptFingerprint,
    visualPlanFingerprint: base.visualPlanFingerprint,
    shotPlanFingerprint: base.shotPlanFingerprint,
    syncAnchorFingerprint: base.syncAnchorFingerprint,
    rendererBinding: base.rendererBinding,
    selectedResources: base.selectedResources.filter(
      (resource) => resource.role === "scene-visual",
    ),
    visualRuntimeVersion: base.visualRuntimeVersion,
  };
  const soundInput = {
    taskInputFingerprint: base.taskInputFingerprint,
    resourceCatalogFingerprint: base.resourceCatalogFingerprint,
    syncAnchorFingerprint: base.syncAnchorFingerprint,
    soundPlanFingerprint: base.soundPlanFingerprint,
    selectedResources: base.selectedResources.filter(
      (resource) =>
        resource.role === "sound-effect" ||
        resource.role === "background-music",
    ),
    sceneAudioRuntimeVersion: base.sceneAudioRuntimeVersion,
  };
  const input = {
    ...base,
    sceneVisualFingerprint: computeSceneVisualFingerprint(visualInput),
    sceneSoundFingerprint: computeSceneSoundFingerprint(soundInput),
  };
  return ScenePackageSchema.parse({
    ...input,
    packageFingerprint: computeScenePackageFingerprint(input),
  });
};

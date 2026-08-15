import {
  SCENE_AUDIO_RUNTIME_VERSION,
  ScenePackageSchema,
  computeSceneSoundFingerprint,
} from "../../../contracts/scene-package";
import {
  SceneSoundPlanSchema,
  SceneSyncAnchorSetSchema,
  resolveSceneSoundCues,
} from "../../../contracts/scene-plan";
import {
  ResourceAssetDescriptorSchema,
  validateSelectedResourceRef,
  type ResourceAssetDescriptor,
  type SelectedResourceRef,
} from "../../../contracts/resource-catalog";
import { createFingerprint } from "../../../contracts/fingerprint";
import type { Sha256Digest } from "../../../contracts/primitives";

export type SceneSoundContributionValue = Readonly<{
  contributionId: string;
  kind: "ambience" | "cue";
  resourceId: string;
  publicPath: string;
  checksum: Sha256Digest;
  startFrame: number;
  endFrame: number;
  volume: number;
}>;

export type SceneSoundProjection = Readonly<{
  schemaVersion: 1;
  storyId: string;
  meaningId: string;
  beatStartFrame: number;
  beatEndFrame: number;
  packageFingerprint: Sha256Digest;
  sceneSoundFingerprint: Sha256Digest;
  contributions: readonly SceneSoundContributionValue[];
  runtimeVersion: "scene-audio-runtime-v1";
  sceneSoundProjectionFingerprint: Sha256Digest;
}>;

type SoundResource = Readonly<{
  selected: unknown;
  descriptor: unknown;
}>;

const resolveResource = ({
  selected,
  descriptor,
  catalogFingerprint,
}: {
  readonly selected: unknown;
  readonly descriptor: unknown;
  readonly catalogFingerprint: unknown;
}): {
  readonly selected: SelectedResourceRef;
  readonly descriptor: ResourceAssetDescriptor;
} => {
  const current = validateSelectedResourceRef({
    selected,
    descriptor,
    currentCatalogFingerprint: catalogFingerprint,
  });
  if (
    current.kind !== "asset" ||
    (current.role !== "scene-ambience" && current.role !== "scene-sfx")
  ) {
    throw new Error("Scene sound must resolve a current local audio asset.");
  }
  return {
    selected: current,
    descriptor: ResourceAssetDescriptorSchema.parse(descriptor),
  };
};

export const resolveSceneSound = ({
  scenePackage: rawScenePackage,
  soundPlan: rawSoundPlan,
  syncAnchors: rawSyncAnchors,
  resources: rawResources,
}: {
  readonly scenePackage: unknown;
  readonly soundPlan: unknown;
  readonly syncAnchors: unknown;
  readonly resources: readonly SoundResource[];
}): SceneSoundProjection => {
  const scenePackage = ScenePackageSchema.parse(rawScenePackage);
  const soundPlan = SceneSoundPlanSchema.parse(rawSoundPlan);
  const syncAnchors = SceneSyncAnchorSetSchema.parse(rawSyncAnchors);
  const durationInFrames =
    scenePackage.beatFrameRange.endFrame -
    scenePackage.beatFrameRange.startFrame;
  if (
    scenePackage.meaningId !== soundPlan.meaningId ||
    scenePackage.meaningId !== syncAnchors.meaningId ||
    scenePackage.taskInputFingerprint !== soundPlan.taskInputFingerprint ||
    scenePackage.taskInputFingerprint !== syncAnchors.taskInputFingerprint ||
    scenePackage.soundPlanFingerprint !== soundPlan.soundPlanFingerprint ||
    scenePackage.syncAnchorFingerprint !== syncAnchors.syncAnchorFingerprint ||
    soundPlan.sceneDurationInFrames !== durationInFrames ||
    syncAnchors.sceneDurationInFrames !== durationInFrames ||
    scenePackage.sceneAudioRuntimeVersion !== SCENE_AUDIO_RUNTIME_VERSION
  ) {
    throw new Error("Scene sound projection inputs are stale or mismatched.");
  }
  const selectedSoundResources = scenePackage.selectedResources.filter(
    (resource) =>
      resource.role === "scene-ambience" || resource.role === "scene-sfx",
  );
  if (
    scenePackage.sceneSoundFingerprint !==
    computeSceneSoundFingerprint({
      taskInputFingerprint: scenePackage.taskInputFingerprint,
      resourceCatalogFingerprint: scenePackage.resourceCatalogFingerprint,
      syncAnchorFingerprint: scenePackage.syncAnchorFingerprint,
      soundPlanFingerprint: scenePackage.soundPlanFingerprint,
      selectedResources: selectedSoundResources,
      sceneAudioRuntimeVersion: scenePackage.sceneAudioRuntimeVersion,
    })
  ) {
    throw new Error("Scene sound package fingerprint is stale.");
  }
  const resources = new Map<string, ReturnType<typeof resolveResource>>();
  for (const resource of rawResources) {
    const resolved = resolveResource({
      ...resource,
      catalogFingerprint: scenePackage.resourceCatalogFingerprint,
    });
    if (resources.has(resolved.selected.resourceId)) {
      throw new Error("Scene sound resources must be unique.");
    }
    resources.set(resolved.selected.resourceId, resolved);
  }
  if (
    resources.size !== selectedSoundResources.length ||
    selectedSoundResources.some((selected) => {
      const resolved = resources.get(selected.resourceId);
      return (
        resolved === undefined ||
        resolved.selected.descriptorFingerprint !==
          selected.descriptorFingerprint ||
        resolved.selected.role !== selected.role
      );
    })
  ) {
    throw new Error("Scene sound resources do not match the ScenePackage.");
  }
  const toContribution = ({
    contributionId,
    kind,
    selected,
    startFrame,
    endFrame,
    volume,
  }: {
    readonly contributionId: string;
    readonly kind: "ambience" | "cue";
    readonly selected: SelectedResourceRef;
    readonly startFrame: number;
    readonly endFrame: number;
    readonly volume: number;
  }): SceneSoundContributionValue => {
    const resource = resources.get(selected.resourceId);
    if (
      resource === undefined ||
      resource.selected.role !== selected.role ||
      resource.descriptor.kind !== "asset" ||
      resource.descriptor.assetKind !== "audio" ||
      resource.descriptor.mediaRole !== selected.role ||
      !resource.descriptor.localPath.startsWith("public/") ||
      !Number.isFinite(volume) ||
      volume < 0 ||
      volume > 1 ||
      startFrame < 0 ||
      endFrame <= startFrame ||
      endFrame > durationInFrames
    ) {
      throw new Error("Scene sound contribution is not runtime-safe.");
    }
    return {
      contributionId,
      kind,
      resourceId: selected.resourceId,
      publicPath: resource.descriptor.localPath,
      checksum: resource.descriptor.checksum,
      startFrame,
      endFrame,
      volume,
    };
  };
  const resolvedCues = resolveSceneSoundCues({ soundPlan, syncAnchors });
  const contributions: SceneSoundContributionValue[] = [
    ...(soundPlan.ambience
      ? [
          toContribution({
            contributionId: "ambience",
            kind: "ambience",
            selected: soundPlan.ambience,
            startFrame: 0,
            endFrame: durationInFrames,
            volume: 1,
          }),
        ]
      : []),
    ...soundPlan.cues.map((cue, index) => {
      const frames = resolvedCues[index];
      if (frames === undefined || frames.cueId !== cue.cueId) {
        throw new Error("Scene sound cue resolution order is stale.");
      }
      return toContribution({
        contributionId: cue.cueId,
        kind: "cue",
        selected: cue.resource,
        startFrame: frames.startFrame,
        endFrame: frames.endFrame,
        volume: cue.volume,
      });
    }),
  ];
  const identity = {
    schemaVersion: 1 as const,
    storyId: scenePackage.storyId,
    meaningId: scenePackage.meaningId,
    beatStartFrame: scenePackage.beatFrameRange.startFrame,
    beatEndFrame: scenePackage.beatFrameRange.endFrame,
    sceneSoundFingerprint: scenePackage.sceneSoundFingerprint,
    contributions,
    runtimeVersion: SCENE_AUDIO_RUNTIME_VERSION,
  };
  return {
    ...identity,
    packageFingerprint: scenePackage.packageFingerprint,
    sceneSoundProjectionFingerprint: createFingerprint({
      namespace: "scene-sound-projection",
      version: 1,
      value: identity,
    }),
  };
};

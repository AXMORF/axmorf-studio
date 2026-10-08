import {
  StorySpecSchema,
  VisualStyleSpecSchema,
  aggregateSceneStoryBeat,
  aggregateSceneTimingBeat,
  buildNotApplicableFidelityReceipt,
  buildSceneCoverageMap,
  buildSceneSoundPlan,
  buildSceneSyncAnchors,
  buildSceneTaskInputV8,
  buildSceneVisualPlan,
  buildShotPlanSet,
  buildShotRecipeSelection,
  buildSilentScenePreset,
  computeResourceDescriptorFingerprint,
  computeStoryFingerprint,
  createFingerprint,
  generateAuthoredFrameTiming,
  parseNarrativeProjectSource,
  resolveSceneReadabilityPolicy,
  resolveSceneViewport,
} from "@axmorf/studio/contracts";
import {
  buildSoundDesignProjection,
  buildStoryVisualProjection,
  resolveSceneSound,
} from "@axmorf/studio/remotion";
import { buildScenePackage } from "../../../scripts/scene-package/domain";
import { validNarrationSpec, validRenderSpec } from "../narrative";
import { createScenePackageInput } from "./package-input";
import { sha } from "./scene-input";

export const AUTHORED_GROUPED_PULSE_CHECKSUM =
  "sha256:32c6cdb25c0d9428aac4ab779247d186f2c879b2140d472c8f839ae8ab08ba43" as const;

/** Synthetic engineering inputs. This fixture never reads a Workspace Project. */
export const createAuthoredGroupedRuntimeFixture = () => {
  const base = createScenePackageInput();
  const story = StorySpecSchema.parse({
    schemaVersion: 3,
    storyId: "synthetic-proof",
    title: "One continuous Scene, two semantic Beats",
    timingSource: "authored-frames",
    beats: ["meaning-one", "meaning-two"].map((meaningId) => ({
      kind: "silent-scene",
      meaningId,
      narrativePurpose: "Move one subject through the shared Scene.",
      preset: buildSilentScenePreset({
        presetId: meaningId,
        durationInFrames: 60,
        visualIntent: "Keep one subject moving across the semantic boundary.",
        soundIntent: "One authored pulse crosses the semantic boundary.",
        resourceIds: ["asset.proof-sfx"],
        implementation: { kind: "scene-owner" },
      }),
    })),
    visualScenes: [{ meaningIds: ["meaning-one", "meaning-two"] }],
  });
  const projectSource = parseNarrativeProjectSource({
    brief: {
      schemaVersion: 1,
      storyId: story.storyId,
      title: story.title,
      sourceMaterial: "Synthetic grouped Scene timing and sound regression.",
      sourceReferences: [],
      audience: "AXMORF Studio engineers",
      targetDurationSeconds: 4,
      deliveryConstraints: ["Use frame authority with no narration."],
    },
    story,
    narration: validNarrationSpec,
    render: {
      ...validRenderSpec,
      width: 640,
      height: 360,
      leadInFrames: 0,
      tailFrames: 0,
    },
  });
  const semanticTiming = generateAuthoredFrameTiming(projectSource);
  const readabilityPolicy = resolveSceneReadabilityPolicy({
    ...projectSource.render,
    edgeInsetPx: 24,
    timingSource: story.timingSource,
  });
  const visualStyle = VisualStyleSpecSchema.parse({
    schemaVersion: 1,
    storyId: story.storyId,
    styleProfileId: "cinematic-3d",
    resourceCatalogFingerprint: base.task.resourceCatalogFingerprint,
    artDirection: {
      medium: "flat geometric proof",
      palette: "dark blue, warm white and cyan",
      lighting: "uniform",
      texture: "solid fills",
      compositionGrammar: "single subject on one horizontal axis",
      motionLanguage: "continuous frame-driven translation",
      typography: "system sans-serif",
    },
    continuityRules: ["Preserve the owning Scene frame across both Beats."],
    forbiddenTreatments: ["No caption or narration track."],
  });
  const storyBeat = aggregateSceneStoryBeat(story.beats);
  const task = buildSceneTaskInputV8({
    ...base.task,
    storyBeat,
    timingBeat: aggregateSceneTimingBeat(
      semanticTiming.storyBeats,
      story.beats.map(({ meaningId }) => meaningId),
      storyBeat,
    ),
    coveredBeats: story.beats.map((member, index) => ({
      storyBeat: member,
      timingBeat: semanticTiming.storyBeats[index],
    })),
    storyFingerprint: computeStoryFingerprint(story),
    renderFingerprint: createFingerprint({
      namespace: "proof-render",
      version: 1,
      value: projectSource.render,
    }),
    visualStyleFingerprint: createFingerprint({
      namespace: "proof-style",
      version: 1,
      value: visualStyle,
    }),
    allowedResourceIds: ["asset.proof-sfx"],
    allowedSnapshots: [],
    sceneViewport: resolveSceneViewport(readabilityPolicy),
  });
  const anchors = buildSceneSyncAnchors({
    taskInputFingerprint: task.taskInputFingerprint,
    meaningId: task.meaningId,
    sceneDurationInFrames: 120,
    anchors: [
      {
        eventId: "boundary-crossing",
        sceneLocalFrame: 54,
        purpose: "Start one pulse six frames before the semantic boundary.",
      },
    ],
  });
  const shots = buildShotPlanSet({
    taskInputFingerprint: task.taskInputFingerprint,
    meaningId: task.meaningId,
    sceneDurationInFrames: 120,
    shots: [
      {
        shotId: "continuous",
        order: 0,
        primaryRange: { startFrame: 0, endFrame: 120 },
        purpose: "Keep one subject continuous.",
        action: "Translate one circle along a fixed horizontal axis.",
        visualResourceIds: [],
        syncAnchorIds: ["boundary-crossing"],
      },
    ],
  });
  const visual = buildSceneVisualPlan({
    taskInputFingerprint: task.taskInputFingerprint,
    meaningId: task.meaningId,
    semanticObjective:
      "Show uninterrupted ownership through two semantic Beats.",
    subject: "One circle.",
    primaryAction: "Translate the circle from left to right.",
    causalLink: "One continuous Scene clock drives the subject.",
    primaryComposition: "A fixed horizontal axis.",
    styleRealization: ["Warm white axis and cyan subject."],
    continuity: "No owner clock reset at the semantic boundary.",
    orderedShotIds: ["continuous"],
    visualResourceIds: [],
    recipeDecision: "empty",
    fallbackIntent: "Reject incomplete ownership.",
  });
  const descriptor = {
    schemaVersion: 1,
    id: "asset.proof-sfx",
    kind: "asset",
    status: "approved",
    title: "Authored engineering pulse",
    description: "Locally synthesized 440 Hz pulse.",
    useCases: ["scene cue"],
    tags: ["proof", "sfx"],
    authority: {
      kind: "repository-file",
      repositoryPath: "tests/fixtures/scene/authored-grouped.ts",
    },
    allowedUse: "runtime-approved",
    assetKind: "audio",
    mediaRole: "sound-effect",
    localPath: "public/proofs/authored-frames/pulse.wav",
    checksum: AUTHORED_GROUPED_PULSE_CHECKSUM,
    license: {
      id: "Project-Authored",
      verificationStatus: "verified",
      sourceUrl: null,
      attributionRequired: false,
      attributionText: null,
      verifiedAt: "2026-10-07T00:00:00.000Z",
      sourceEvidenceFingerprint: sha("f"),
    },
  } as const;
  const selected = {
    schemaVersion: 1,
    resourceId: descriptor.id,
    kind: "asset",
    role: "sound-effect",
    descriptorFingerprint: computeResourceDescriptorFingerprint(descriptor),
    catalogFingerprint: task.resourceCatalogFingerprint,
  } as const;
  const sound = buildSceneSoundPlan({
    taskInputFingerprint: task.taskInputFingerprint,
    meaningId: task.meaningId,
    sceneDurationInFrames: 120,
    contributions: [
      {
        contributionId: "pulse",
        resource: selected,
        timing: {
          kind: "anchor",
          eventId: "boundary-crossing",
          offsetFrames: 0,
        },
        durationInFrames: 12,
        volume: 0.5,
      },
    ],
  });
  const selection = buildShotRecipeSelection({
    taskInputFingerprint: task.taskInputFingerprint,
    selections: [],
  });
  const fidelityReceipt = buildNotApplicableFidelityReceipt({
    selectionFingerprint: selection.selectionFingerprint,
    reason: "empty",
  });
  const scenePackage = buildScenePackage({
    task,
    anchors,
    shots,
    visual,
    sound,
    selection,
    fidelityReceipt,
    selectedResources: [{ selected, descriptor }],
    rendererBinding: base.rendererBinding,
    current: {
      ...base.current,
      timingBeat: task.timingBeat,
      semanticTimingFingerprint: semanticTiming.fingerprint,
      visualStyleFingerprint: task.visualStyleFingerprint,
      snapshotFingerprints: [],
    },
  });
  const coverage = buildSceneCoverageMap({
    storyId: story.storyId,
    storyBeatOrder: story.beats.map(({ meaningId }) => meaningId),
    packages: [scenePackage],
    fallbacks: [],
    stalePackages: [],
  });
  const sceneSoundProjection = resolveSceneSound({
    scenePackage,
    soundPlan: sound,
    syncAnchors: anchors,
    resources: [{ selected, descriptor }],
  });
  const soundDesign = buildSoundDesignProjection({
    storyId: story.storyId,
    coverage,
    storyBeatTimings: semanticTiming.storyBeats,
    semanticTiming,
    sceneSoundProjections: [sceneSoundProjection],
  });
  const storyVisual = buildStoryVisualProjection({
    storyId: story.storyId,
    leadInFrames: 0,
    tailFrames: 0,
    durationInFrames: semanticTiming.durationInFrames,
    storyBeatTimings: semanticTiming.storyBeats,
    coverage,
    packages: [scenePackage],
    registryFingerprint: sha("c"),
    transitions: [
      {
        fromMeaningId: "meaning-one",
        toMeaningId: "meaning-two",
        kind: "hard-cut",
        durationInFrames: 0,
      },
    ],
  });
  return {
    projectSource,
    semanticTiming,
    task,
    anchors,
    shots,
    visual,
    visualStyle,
    readabilityPolicy,
    scenePackage,
    coverage,
    soundDesign,
    storyVisual,
  };
};

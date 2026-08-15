import {
  buildSceneSoundPlan,
  buildSceneSyncAnchors,
  buildSceneTaskInputV5,
  buildSceneVisualPlan,
  buildShotPlanSet,
  resolveProductionReadabilityPolicy,
  Sha256DigestSchema,
} from "../../../src/contracts";

export const sha = (character: string) =>
  Sha256DigestSchema.parse(`sha256:${character.repeat(64)}`);

export const createM6SceneTaskInput = () =>
  buildSceneTaskInputV5({
    storyId: "synthetic-proof",
    meaningId: "meaning-one",
    storyBeat: {
      kind: "narrated-scene",
      meaningId: "meaning-one",
      narrativePurpose: "Demonstrate one deterministic Scene runtime slot.",
      ttsChunks: [{ chunkId: "chunk-one", ttsText: "A synthetic proof." }],
      explicitPauses: [],
    },
    sourceReferences: [],
    timingBeat: {
      kind: "narrated-scene",
      meaningId: "meaning-one",
      startFrame: 20,
      endFrame: 140,
    },
    storyFingerprint: sha("1"),
    semanticTimingFingerprint: sha("2"),
    renderFingerprint: sha("3"),
    visualStyleFingerprint: sha("4"),
    resourceCatalogFingerprint: sha("5"),
    allowedSnapshots: [
      {
        sourceId: "video-shotcraft",
        snapshotFingerprint: sha("6"),
        allowedCardIds: ["draw-svg-trace"],
      },
    ],
    allowedResourceIds: ["asset.proof-shape", "asset.proof-sfx"],
    continuity: {
      previousMeaningId: null,
      previousSummary: null,
      nextMeaningId: null,
      nextSummary: null,
      continuityBrief: "This standalone proof has no adjacent Scene.",
    },
    allowedDirectories: {
      sceneRoot: "src/projects/synthetic-proof/scenes/meaning-one",
      publicAssetRoot: "public/assets/library/synthetic-proof/meaning-one",
    },
    readabilityPolicy: resolveProductionReadabilityPolicy({
      width: 1920,
      height: 1080,
    }),
    sceneCompositionBoundaryVersion: "scene-composition-boundary-v1",
  });

export const createM6ScenePlans = (
  recipeDecision:
    | "empty"
    | "inspiration-only"
    | "exact-demo-localized" = "exact-demo-localized",
) => {
  const task = createM6SceneTaskInput();
  const anchors = buildSceneSyncAnchors({
    taskInputFingerprint: task.taskInputFingerprint,
    meaningId: task.meaningId,
    sceneDurationInFrames: 120,
    anchors: [
      {
        eventId: "outline-closes",
        sceneLocalFrame: 54,
        purpose: "Trigger the local handoff sound when the outline closes.",
      },
    ],
  });
  const shots = buildShotPlanSet({
    taskInputFingerprint: task.taskInputFingerprint,
    meaningId: task.meaningId,
    sceneDurationInFrames: 120,
    shots: [
      {
        shotId: "trace-shot",
        order: 0,
        primaryRange: { startFrame: 0, endFrame: 120 },
        purpose: "Trace and reveal the proof shape.",
        action: "A visible pen traces the outline before the shape fills.",
        visualResourceIds: ["asset.proof-shape"],
        syncAnchorIds: ["outline-closes"],
      },
    ],
  });
  const visual = buildSceneVisualPlan({
    taskInputFingerprint: task.taskInputFingerprint,
    meaningId: task.meaningId,
    semanticObjective: "Make the deterministic Scene boundary visible.",
    subject: "A synthetic geometric proof shape.",
    primaryAction: "The shape is traced and then revealed.",
    causalLink: "The completed trace causes the fill handoff.",
    primaryComposition:
      "Centered proof shape with a single readable focal point.",
    styleRealization: [
      "High contrast monochrome trace",
      "Restrained cyan accent",
    ],
    continuity: "No adjacent Scene; enter and exit on the baseline background.",
    orderedShotIds: ["trace-shot"],
    visualResourceIds: ["asset.proof-shape"],
    recipeDecision,
    fallbackIntent:
      "If exact fidelity is stale, omit the Scene instead of approximating it.",
  });
  const sound = buildSceneSoundPlan({
    taskInputFingerprint: task.taskInputFingerprint,
    meaningId: task.meaningId,
    sceneDurationInFrames: 120,
    ambience: null,
    cues: [],
  });
  return { task, anchors, shots, visual, sound };
};

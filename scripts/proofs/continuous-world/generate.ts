import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  buildSceneTaskInputV8,
  StoryBeatSchema,
  aggregateSceneStoryBeat,
  aggregateSceneTimingBeat,
  buildSilentScenePreset,
  buildSceneVisualPlan,
  buildShotPlanSet,
  buildSceneSyncAnchors,
  buildSceneSoundPlan,
  buildShotRecipeSelection,
  buildNotApplicableFidelityReceipt,
  createFingerprint,
  resolveSceneReadabilityPolicy,
  resolveSceneViewport,
  VisualStyleSpecSchema,
} from "@axmorf/studio/contracts";
import { buildScenePackage } from "../../scene-package/domain";

const root = process.cwd();
const sha = (value: unknown) =>
  createFingerprint({ namespace: "continuous-world-proof", version: 1, value });
const storyId = "continuous-world-proof";
const beats = ["choose", "step"].map((meaningId, index) =>
  StoryBeatSchema.parse({
    kind: "silent-scene",
    meaningId,
    narrativePurpose: index === 0 ? "Choose one route" : "Walk the first step",
    preset: buildSilentScenePreset({
      presetId: meaningId,
      durationInFrames: index === 0 ? 80 : 70,
      visualIntent: "One subject and a continuous route.",
      soundIntent: "Silent engineering fixture.",
      resourceIds: [],
      implementation: { kind: "scene-owner" },
    }),
  }),
);
const coveredBeats = beats.map((storyBeat, index) => {
  if (storyBeat.kind !== "silent-scene")
    throw new Error("Proof must use authored frames.");
  return {
    storyBeat,
    timingBeat: {
      kind: "silent-scene" as const,
      meaningId: storyBeat.meaningId,
      startFrame: index === 0 ? 0 : 80,
      endFrame: index === 0 ? 80 : 150,
      presetDurationInFrames: storyBeat.preset.durationInFrames,
      presetFingerprint: storyBeat.preset.presetFingerprint,
    },
  };
});
const storyBeat = aggregateSceneStoryBeat(beats);
const task = buildSceneTaskInputV8({
  storyId,
  meaningId: "choose",
  storyBeat,
  coveredBeats,
  timingBeat: aggregateSceneTimingBeat(
    coveredBeats.map(({ timingBeat }) => timingBeat),
    ["choose", "step"],
    storyBeat,
  ),
  sourceReferences: [],
  storyFingerprint: sha(beats),
  renderFingerprint: sha({ width: 1920, height: 1080, fps: 30 }),
  visualStyleFingerprint: sha("proof-style"),
  resourceCatalogFingerprint: sha("no-media"),
  allowedSnapshots: [],
  allowedResourceIds: [],
  allowedDirectories: {
    sceneRoot: `src/projects/${storyId}/scenes/choose`,
    publicAssetRoot: `public/projects/${storyId}/scenes/choose`,
  },
  continuity: {
    previousMeaningId: null,
    previousSummary: null,
    nextMeaningId: null,
    nextSummary: null,
    continuityBrief: "Continuous within this one owner.",
  },
  sceneRequirements: [],
  sceneViewport: resolveSceneViewport(
    resolveSceneReadabilityPolicy({ width: 1920, height: 1080 }),
  ),
  sceneCompositionBoundaryVersion: "scene-composition-boundary-v2",
});
const identity = {
  taskInputFingerprint: task.taskInputFingerprint,
  meaningId: task.meaningId,
};
const visual = buildSceneVisualPlan({
  ...identity,
  semanticObjective: "A route becomes a first step.",
  subject: "Same dot and route",
  primaryAction: "The route straightens and the subject advances.",
  causalLink: "Selecting a route permits one step.",
  primaryComposition: "Shared world camera tracks the subject.",
  styleRealization: ["Original vector route geometry"],
  continuity: "One continuous owner.",
  orderedShotIds: ["route"],
  visualResourceIds: [],
  recipeDecision: "empty",
  fallbackIntent: "No replacement proof geometry.",
});
const shots = buildShotPlanSet({
  ...identity,
  sceneDurationInFrames: 150,
  shots: [
    {
      shotId: "route",
      order: 0,
      primaryRange: { startFrame: 0, endFrame: 150 },
      purpose: "Keep the subject mounted across the Beat boundary.",
      action: "Straighten the route, then walk one step.",
      visualResourceIds: [],
      syncAnchorIds: [],
    },
  ],
});
const anchors = buildSceneSyncAnchors({
  ...identity,
  sceneDurationInFrames: 150,
  anchors: [],
});
const sound = buildSceneSoundPlan({
  ...identity,
  sceneDurationInFrames: 150,
  contributions: [],
});
const selection = buildShotRecipeSelection({
  taskInputFingerprint: task.taskInputFingerprint,
  selections: [],
});
const fidelityReceipt = buildNotApplicableFidelityReceipt({
  selectionFingerprint: selection.selectionFingerprint,
  reason: "empty",
});
const source = await Promise.all(
  ["Scene.tsx", "motion-state.ts"].map(async (path) => ({
    path,
    source: await readFile(join(root, "proofs/continuous-world", path), "utf8"),
  })),
);
const sourceFingerprint = sha(source);
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
    rendererId: "continuous-world-proof-choose",
    rendererSourceFingerprint: sourceFingerprint,
  },
  current: {
    timingBeat: task.timingBeat,
    semanticTimingFingerprint: sha(coveredBeats),
    visualStyleFingerprint: task.visualStyleFingerprint,
    resourceCatalogFingerprint: task.resourceCatalogFingerprint,
    snapshotFingerprints: [],
    rendererSourceFingerprint: sourceFingerprint,
    visualRuntimeVersion: "scene-visual-runtime-v3",
    sceneAudioRuntimeVersion: "scene-audio-runtime-v2",
  },
});
const visualStyle = VisualStyleSpecSchema.parse({
  schemaVersion: 1,
  storyId,
  styleProfileId: "cinematic-3d",
  resourceCatalogFingerprint: task.resourceCatalogFingerprint,
  artDirection: {
    medium: "Vector route",
    palette: "Dark blue, sage, warm yellow",
    lighting: "Flat",
    texture: "None",
    compositionGrammar: "One subject",
    motionLanguage: "One camera",
    typography: "Clear sans serif",
  },
  continuityRules: [],
  forbiddenTreatments: [],
});
await mkdir(join(root, "proofs/continuous-world"), { recursive: true });
await writeFile(
  join(root, "proofs/continuous-world/fixture.generated.json"),
  `${JSON.stringify({ task, scenePackage, visualStyle, visual, shots, anchors, sound }, null, 2)}\n`,
);

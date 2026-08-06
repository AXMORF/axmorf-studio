// @generated-by production-readability-scaffold-v2
import {staticFile} from "remotion";
import {z} from "zod";

import {
  RenderSpecSchema,
  ResourceDescriptorSchema,
  SceneCoverageMapSchema,
  ScenePackageSchema,
  SceneSoundPlanSchema,
  SceneSyncAnchorSetSchema,
  SceneTaskInputSchema,
  SceneVisualPlanSchema,
  SelectedResourceRefSchema,
  SemanticTimingSchema,
  ShotPlanSetSchema,
  VisualStyleSpecSchema,
} from "../../contracts";
import {resolveSceneSound} from "../../remotion/runtime/scene-sound";
import {buildSoundDesignProjection} from "../../remotion/runtime/sound-design";
import {
  buildStoryVisualProjection,
  type SceneRendererProps,
  type SceneRendererRegistry,
} from "../../remotion/runtime/story-visual";
import coverageJson from "./generated/scene-coverage.generated.json";
import semanticTimingJson from "./generated/semantic-timing.generated.json";
import renderJson from "./render.json";
import {
  rendererRegistry,
  rendererRegistryFingerprint,
  rendererSourceGraphFingerprints,
} from "./renderer-registry.generated";
import layersFindPatternsPackageJson from "./scenes/layers-find-patterns/generated/scene-package.generated.json";
import layersFindPatternsResourcesJson from "./scenes/layers-find-patterns/selected-resources.json";
import layersFindPatternsShotsJson from "./scenes/layers-find-patterns/shot-plan.json";
import layersFindPatternsSoundJson from "./scenes/layers-find-patterns/sound-plan.json";
import layersFindPatternsAnchorsJson from "./scenes/layers-find-patterns/sync-anchors.json";
import layersFindPatternsTaskJson from "./scenes/layers-find-patterns/task-input.generated.json";
import layersFindPatternsVisualJson from "./scenes/layers-find-patterns/visual-plan.json"; // Scene 0
import featuresBuildUpPackageJson from "./scenes/features-build-up/generated/scene-package.generated.json";
import featuresBuildUpResourcesJson from "./scenes/features-build-up/selected-resources.json";
import featuresBuildUpShotsJson from "./scenes/features-build-up/shot-plan.json";
import featuresBuildUpSoundJson from "./scenes/features-build-up/sound-plan.json";
import featuresBuildUpAnchorsJson from "./scenes/features-build-up/sync-anchors.json";
import featuresBuildUpTaskJson from "./scenes/features-build-up/task-input.generated.json";
import featuresBuildUpVisualJson from "./scenes/features-build-up/visual-plan.json"; // Scene 1
import trainingAdjustsWeightsPackageJson from "./scenes/training-adjusts-weights/generated/scene-package.generated.json";
import trainingAdjustsWeightsResourcesJson from "./scenes/training-adjusts-weights/selected-resources.json";
import trainingAdjustsWeightsShotsJson from "./scenes/training-adjusts-weights/shot-plan.json";
import trainingAdjustsWeightsSoundJson from "./scenes/training-adjusts-weights/sound-plan.json";
import trainingAdjustsWeightsAnchorsJson from "./scenes/training-adjusts-weights/sync-anchors.json";
import trainingAdjustsWeightsTaskJson from "./scenes/training-adjusts-weights/task-input.generated.json";
import trainingAdjustsWeightsVisualJson from "./scenes/training-adjusts-weights/visual-plan.json"; // Scene 2
import depthEnablesLearningPackageJson from "./scenes/depth-enables-learning/generated/scene-package.generated.json";
import depthEnablesLearningResourcesJson from "./scenes/depth-enables-learning/selected-resources.json";
import depthEnablesLearningShotsJson from "./scenes/depth-enables-learning/shot-plan.json";
import depthEnablesLearningSoundJson from "./scenes/depth-enables-learning/sound-plan.json";
import depthEnablesLearningAnchorsJson from "./scenes/depth-enables-learning/sync-anchors.json";
import depthEnablesLearningTaskJson from "./scenes/depth-enables-learning/task-input.generated.json";
import depthEnablesLearningVisualJson from "./scenes/depth-enables-learning/visual-plan.json"; // Scene 3
import powerHasLimitsPackageJson from "./scenes/power-has-limits/generated/scene-package.generated.json";
import powerHasLimitsResourcesJson from "./scenes/power-has-limits/selected-resources.json";
import powerHasLimitsShotsJson from "./scenes/power-has-limits/shot-plan.json";
import powerHasLimitsSoundJson from "./scenes/power-has-limits/sound-plan.json";
import powerHasLimitsAnchorsJson from "./scenes/power-has-limits/sync-anchors.json";
import powerHasLimitsTaskJson from "./scenes/power-has-limits/task-input.generated.json";
import powerHasLimitsVisualJson from "./scenes/power-has-limits/visual-plan.json"; // Scene 4
import visualStyleJson from "./visual-style.json";

const SelectedResourcesFileSchema = z.object({
  schemaVersion: z.literal(1),
  selectedResources: z.array(z.object({
    selected: SelectedResourceRefSchema,
    descriptor: ResourceDescriptorSchema,
  }).strict()).readonly(),
}).strict();

const rawScenes = [
  {task: layersFindPatternsTaskJson, visual: layersFindPatternsVisualJson, shots: layersFindPatternsShotsJson, anchors: layersFindPatternsAnchorsJson, sound: layersFindPatternsSoundJson, resources: layersFindPatternsResourcesJson, scenePackage: layersFindPatternsPackageJson},
  {task: featuresBuildUpTaskJson, visual: featuresBuildUpVisualJson, shots: featuresBuildUpShotsJson, anchors: featuresBuildUpAnchorsJson, sound: featuresBuildUpSoundJson, resources: featuresBuildUpResourcesJson, scenePackage: featuresBuildUpPackageJson},
  {task: trainingAdjustsWeightsTaskJson, visual: trainingAdjustsWeightsVisualJson, shots: trainingAdjustsWeightsShotsJson, anchors: trainingAdjustsWeightsAnchorsJson, sound: trainingAdjustsWeightsSoundJson, resources: trainingAdjustsWeightsResourcesJson, scenePackage: trainingAdjustsWeightsPackageJson},
  {task: depthEnablesLearningTaskJson, visual: depthEnablesLearningVisualJson, shots: depthEnablesLearningShotsJson, anchors: depthEnablesLearningAnchorsJson, sound: depthEnablesLearningSoundJson, resources: depthEnablesLearningResourcesJson, scenePackage: depthEnablesLearningPackageJson},
  {task: powerHasLimitsTaskJson, visual: powerHasLimitsVisualJson, shots: powerHasLimitsShotsJson, anchors: powerHasLimitsAnchorsJson, sound: powerHasLimitsSoundJson, resources: powerHasLimitsResourcesJson, scenePackage: powerHasLimitsPackageJson},
] as const;
const visualStyle = VisualStyleSpecSchema.parse(visualStyleJson);
const semanticTiming = SemanticTimingSchema.parse(semanticTimingJson);
const render = RenderSpecSchema.parse(renderJson);
export const productionSceneCoverage = SceneCoverageMapSchema.parse(coverageJson);
const scenes = rawScenes.map((raw) => ({
  task: SceneTaskInputSchema.parse(raw.task),
  visual: SceneVisualPlanSchema.parse(raw.visual),
  shots: ShotPlanSetSchema.parse(raw.shots),
  anchors: SceneSyncAnchorSetSchema.parse(raw.anchors),
  sound: SceneSoundPlanSchema.parse(raw.sound),
  resources: SelectedResourcesFileSchema.parse(raw.resources).selectedResources,
  scenePackage: ScenePackageSchema.parse(raw.scenePackage),
}));
if (
  productionSceneCoverage.storyId !== "what-is-deep-learning" ||
  render.fps !== semanticTiming.fps ||
  scenes.length !== productionSceneCoverage.entries.length ||
  scenes.some((scene, index) => {
    const coverage = productionSceneCoverage.entries[index];
    return coverage?.status !== "ready" ||
      coverage.meaningId !== scene.task.meaningId ||
      coverage.packageFingerprint !== scene.scenePackage.packageFingerprint;
  })
) throw new Error("Production Scene runtime inputs are stale.");

const currentRegistry: SceneRendererRegistry = rendererRegistry;
const currentSourceGraphs: Readonly<Record<string, string>> = rendererSourceGraphFingerprints;
for (const {scenePackage} of scenes) {
  const binding = scenePackage.rendererBinding;
  if (currentRegistry[binding.rendererId] === undefined || currentSourceGraphs[binding.rendererId] !== binding.rendererSourceFingerprint) {
    throw new Error("Production RendererRegistry binding is stale.");
  }
}
if (Object.keys(currentRegistry).length !== scenes.length) throw new Error("Production RendererRegistry cardinality is stale.");

const storyBeatTimings = scenes.map(({task}) => task.timingBeat);
const scenePackages = scenes.map(({scenePackage}) => scenePackage);
const transitions = scenes.slice(1).map((scene, index) => ({
  fromMeaningId: scenes[index].task.meaningId,
  toMeaningId: scene.task.meaningId,
  kind: "hard-cut" as const,
  durationInFrames: 0,
  boundaryFrame: scene.task.timingBeat.startFrame,
}));
export const productionStoryVisualProjection = buildStoryVisualProjection({
  storyId: "what-is-deep-learning",
  leadInFrames: semanticTiming.leadInFrames,
  tailFrames: semanticTiming.tailFrames,
  durationInFrames: semanticTiming.durationInFrames,
  storyBeatTimings,
  coverage: productionSceneCoverage,
  packages: scenePackages,
  registryFingerprint: rendererRegistryFingerprint,
  transitions,
});
const sceneSoundProjections = scenes.map((scene) => resolveSceneSound({
  scenePackage: scene.scenePackage,
  soundPlan: scene.sound,
  syncAnchors: scene.anchors,
  resources: scene.resources.filter(({selected}) => selected.role === "scene-ambience" || selected.role === "scene-sfx"),
}));
export const productionSoundDesignProjection = buildSoundDesignProjection({
  storyId: "what-is-deep-learning",
  coverage: productionSceneCoverage,
  storyBeatTimings,
  sceneSoundProjections,
});
export const productionRendererPropsByMeaning: Readonly<Record<string, Omit<SceneRendererProps, "sceneFrame">>> = Object.fromEntries(
  scenes.map((scene) => {
    const task = scene.task;
    if (task.schemaVersion === 1) throw new Error("Production Scene runtime requires readability-aware task input.");
    return [task.meaningId, {
    storyId: task.storyId,
    meaningId: task.meaningId,
    durationInFrames: task.timingBeat.endFrame - task.timingBeat.startFrame,
    fps: render.fps,
    width: render.width,
    height: render.height,
    storyBeat: task.storyBeat,
    timingBeat: task.timingBeat,
    visualStyle,
    visualPlan: scene.visual,
    shots: scene.shots,
    syncAnchors: scene.anchors,
    readabilityPolicy: task.readabilityPolicy,
    sceneBoundaryVersion: task.schemaVersion === 3 ? task.sceneCompositionBoundaryVersion : undefined,
    visualResources: scene.resources.filter(({selected}) => selected.role === "scene-visual").map(({selected, descriptor}) => {
      if (descriptor.kind !== "asset" || !descriptor.localPath.startsWith("public/")) throw new Error("Production Scene visual resource is not local.");
      return {resourceId: selected.resourceId, src: staticFile(descriptor.localPath.slice("public/".length)), descriptorFingerprint: selected.descriptorFingerprint};
    }),
  }];
  }),
);
export {currentRegistry as productionRendererRegistry};

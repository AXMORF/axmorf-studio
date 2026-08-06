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
  type SceneRendererMountProps,
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
import nameOriginPackageJson from "./scenes/name-origin/generated/scene-package.generated.json";
import nameOriginResourcesJson from "./scenes/name-origin/selected-resources.json";
import nameOriginShotsJson from "./scenes/name-origin/shot-plan.json";
import nameOriginSoundJson from "./scenes/name-origin/sound-plan.json";
import nameOriginAnchorsJson from "./scenes/name-origin/sync-anchors.json";
import nameOriginTaskJson from "./scenes/name-origin/task-input.generated.json";
import nameOriginVisualJson from "./scenes/name-origin/visual-plan.json"; // Scene 0
import biologicalNeuronPackageJson from "./scenes/biological-neuron/generated/scene-package.generated.json";
import biologicalNeuronResourcesJson from "./scenes/biological-neuron/selected-resources.json";
import biologicalNeuronShotsJson from "./scenes/biological-neuron/shot-plan.json";
import biologicalNeuronSoundJson from "./scenes/biological-neuron/sound-plan.json";
import biologicalNeuronAnchorsJson from "./scenes/biological-neuron/sync-anchors.json";
import biologicalNeuronTaskJson from "./scenes/biological-neuron/task-input.generated.json";
import biologicalNeuronVisualJson from "./scenes/biological-neuron/visual-plan.json"; // Scene 1
import artificialNeuronPackageJson from "./scenes/artificial-neuron/generated/scene-package.generated.json";
import artificialNeuronResourcesJson from "./scenes/artificial-neuron/selected-resources.json";
import artificialNeuronShotsJson from "./scenes/artificial-neuron/shot-plan.json";
import artificialNeuronSoundJson from "./scenes/artificial-neuron/sound-plan.json";
import artificialNeuronAnchorsJson from "./scenes/artificial-neuron/sync-anchors.json";
import artificialNeuronTaskJson from "./scenes/artificial-neuron/task-input.generated.json";
import artificialNeuronVisualJson from "./scenes/artificial-neuron/visual-plan.json"; // Scene 2
import networkLearningPackageJson from "./scenes/network-learning/generated/scene-package.generated.json";
import networkLearningResourcesJson from "./scenes/network-learning/selected-resources.json";
import networkLearningShotsJson from "./scenes/network-learning/shot-plan.json";
import networkLearningSoundJson from "./scenes/network-learning/sound-plan.json";
import networkLearningAnchorsJson from "./scenes/network-learning/sync-anchors.json";
import networkLearningTaskJson from "./scenes/network-learning/task-input.generated.json";
import networkLearningVisualJson from "./scenes/network-learning/visual-plan.json"; // Scene 3
import analogyLimitPackageJson from "./scenes/analogy-limit/generated/scene-package.generated.json";
import analogyLimitResourcesJson from "./scenes/analogy-limit/selected-resources.json";
import analogyLimitShotsJson from "./scenes/analogy-limit/shot-plan.json";
import analogyLimitSoundJson from "./scenes/analogy-limit/sound-plan.json";
import analogyLimitAnchorsJson from "./scenes/analogy-limit/sync-anchors.json";
import analogyLimitTaskJson from "./scenes/analogy-limit/task-input.generated.json";
import analogyLimitVisualJson from "./scenes/analogy-limit/visual-plan.json"; // Scene 4
import visualStyleJson from "./visual-style.json";

const SelectedResourcesFileSchema = z.object({
  schemaVersion: z.literal(1),
  selectedResources: z.array(z.object({
    selected: SelectedResourceRefSchema,
    descriptor: ResourceDescriptorSchema,
  }).strict()).readonly(),
}).strict();

const rawScenes = [
  {task: nameOriginTaskJson, visual: nameOriginVisualJson, shots: nameOriginShotsJson, anchors: nameOriginAnchorsJson, sound: nameOriginSoundJson, resources: nameOriginResourcesJson, scenePackage: nameOriginPackageJson},
  {task: biologicalNeuronTaskJson, visual: biologicalNeuronVisualJson, shots: biologicalNeuronShotsJson, anchors: biologicalNeuronAnchorsJson, sound: biologicalNeuronSoundJson, resources: biologicalNeuronResourcesJson, scenePackage: biologicalNeuronPackageJson},
  {task: artificialNeuronTaskJson, visual: artificialNeuronVisualJson, shots: artificialNeuronShotsJson, anchors: artificialNeuronAnchorsJson, sound: artificialNeuronSoundJson, resources: artificialNeuronResourcesJson, scenePackage: artificialNeuronPackageJson},
  {task: networkLearningTaskJson, visual: networkLearningVisualJson, shots: networkLearningShotsJson, anchors: networkLearningAnchorsJson, sound: networkLearningSoundJson, resources: networkLearningResourcesJson, scenePackage: networkLearningPackageJson},
  {task: analogyLimitTaskJson, visual: analogyLimitVisualJson, shots: analogyLimitShotsJson, anchors: analogyLimitAnchorsJson, sound: analogyLimitSoundJson, resources: analogyLimitResourcesJson, scenePackage: analogyLimitPackageJson},
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
  productionSceneCoverage.storyId !== "neural-network-name" ||
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
  storyId: "neural-network-name",
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
  storyId: "neural-network-name",
  coverage: productionSceneCoverage,
  storyBeatTimings,
  sceneSoundProjections,
});
export const productionRendererPropsByMeaning: Readonly<Record<string, SceneRendererMountProps>> = Object.fromEntries(
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
    ...(task.schemaVersion === 3 ? {sceneBoundaryVersion: task.sceneCompositionBoundaryVersion} : {}),
    visualResources: scene.resources.filter(({selected}) => selected.role === "scene-visual").map(({selected, descriptor}) => {
      if (descriptor.kind !== "asset" || !descriptor.localPath.startsWith("public/")) throw new Error("Production Scene visual resource is not local.");
      return {resourceId: selected.resourceId, src: staticFile(descriptor.localPath.slice("public/".length)), descriptorFingerprint: selected.descriptorFingerprint};
    }),
  }];
  }),
);
export {currentRegistry as productionRendererRegistry};

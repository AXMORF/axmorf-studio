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
import threeLayersPackageJson from "./scenes/three-layers/generated/scene-package.generated.json";
import threeLayersResourcesJson from "./scenes/three-layers/selected-resources.json";
import threeLayersShotsJson from "./scenes/three-layers/shot-plan.json";
import threeLayersSoundJson from "./scenes/three-layers/sound-plan.json";
import threeLayersAnchorsJson from "./scenes/three-layers/sync-anchors.json";
import threeLayersTaskJson from "./scenes/three-layers/task-input.generated.json";
import threeLayersVisualJson from "./scenes/three-layers/visual-plan.json"; // Scene 0
import algorithmRulesPackageJson from "./scenes/algorithm-rules/generated/scene-package.generated.json";
import algorithmRulesResourcesJson from "./scenes/algorithm-rules/selected-resources.json";
import algorithmRulesShotsJson from "./scenes/algorithm-rules/shot-plan.json";
import algorithmRulesSoundJson from "./scenes/algorithm-rules/sound-plan.json";
import algorithmRulesAnchorsJson from "./scenes/algorithm-rules/sync-anchors.json";
import algorithmRulesTaskJson from "./scenes/algorithm-rules/task-input.generated.json";
import algorithmRulesVisualJson from "./scenes/algorithm-rules/visual-plan.json"; // Scene 1
import modelLearnsPackageJson from "./scenes/model-learns/generated/scene-package.generated.json";
import modelLearnsResourcesJson from "./scenes/model-learns/selected-resources.json";
import modelLearnsShotsJson from "./scenes/model-learns/shot-plan.json";
import modelLearnsSoundJson from "./scenes/model-learns/sound-plan.json";
import modelLearnsAnchorsJson from "./scenes/model-learns/sync-anchors.json";
import modelLearnsTaskJson from "./scenes/model-learns/task-input.generated.json";
import modelLearnsVisualJson from "./scenes/model-learns/visual-plan.json"; // Scene 2
import systemOperatesPackageJson from "./scenes/system-operates/generated/scene-package.generated.json";
import systemOperatesResourcesJson from "./scenes/system-operates/selected-resources.json";
import systemOperatesShotsJson from "./scenes/system-operates/shot-plan.json";
import systemOperatesSoundJson from "./scenes/system-operates/sound-plan.json";
import systemOperatesAnchorsJson from "./scenes/system-operates/sync-anchors.json";
import systemOperatesTaskJson from "./scenes/system-operates/task-input.generated.json";
import systemOperatesVisualJson from "./scenes/system-operates/visual-plan.json"; // Scene 3
import wholePicturePackageJson from "./scenes/whole-picture/generated/scene-package.generated.json";
import wholePictureResourcesJson from "./scenes/whole-picture/selected-resources.json";
import wholePictureShotsJson from "./scenes/whole-picture/shot-plan.json";
import wholePictureSoundJson from "./scenes/whole-picture/sound-plan.json";
import wholePictureAnchorsJson from "./scenes/whole-picture/sync-anchors.json";
import wholePictureTaskJson from "./scenes/whole-picture/task-input.generated.json";
import wholePictureVisualJson from "./scenes/whole-picture/visual-plan.json"; // Scene 4
import visualStyleJson from "./visual-style.json";

const SelectedResourcesFileSchema = z.object({
  schemaVersion: z.literal(1),
  selectedResources: z.array(z.object({
    selected: SelectedResourceRefSchema,
    descriptor: ResourceDescriptorSchema,
  }).strict()).readonly(),
}).strict();

const rawScenes = [
  {task: threeLayersTaskJson, visual: threeLayersVisualJson, shots: threeLayersShotsJson, anchors: threeLayersAnchorsJson, sound: threeLayersSoundJson, resources: threeLayersResourcesJson, scenePackage: threeLayersPackageJson},
  {task: algorithmRulesTaskJson, visual: algorithmRulesVisualJson, shots: algorithmRulesShotsJson, anchors: algorithmRulesAnchorsJson, sound: algorithmRulesSoundJson, resources: algorithmRulesResourcesJson, scenePackage: algorithmRulesPackageJson},
  {task: modelLearnsTaskJson, visual: modelLearnsVisualJson, shots: modelLearnsShotsJson, anchors: modelLearnsAnchorsJson, sound: modelLearnsSoundJson, resources: modelLearnsResourcesJson, scenePackage: modelLearnsPackageJson},
  {task: systemOperatesTaskJson, visual: systemOperatesVisualJson, shots: systemOperatesShotsJson, anchors: systemOperatesAnchorsJson, sound: systemOperatesSoundJson, resources: systemOperatesResourcesJson, scenePackage: systemOperatesPackageJson},
  {task: wholePictureTaskJson, visual: wholePictureVisualJson, shots: wholePictureShotsJson, anchors: wholePictureAnchorsJson, sound: wholePictureSoundJson, resources: wholePictureResourcesJson, scenePackage: wholePicturePackageJson},
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
  productionSceneCoverage.storyId !== "algorithm-model-ai-system" ||
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
  storyId: "algorithm-model-ai-system",
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
  storyId: "algorithm-model-ai-system",
  coverage: productionSceneCoverage,
  storyBeatTimings,
  sceneSoundProjections,
});
export const productionRendererPropsByMeaning: Readonly<Record<string, Omit<SceneRendererProps, "sceneFrame">>> = Object.fromEntries(
  scenes.map((scene) => [scene.task.meaningId, {
    storyId: scene.task.storyId,
    meaningId: scene.task.meaningId,
    durationInFrames: scene.task.timingBeat.endFrame - scene.task.timingBeat.startFrame,
    fps: render.fps,
    width: render.width,
    height: render.height,
    storyBeat: scene.task.storyBeat,
    timingBeat: scene.task.timingBeat,
    visualStyle,
    visualPlan: scene.visual,
    shots: scene.shots,
    syncAnchors: scene.anchors,
    readabilityPolicy: scene.task.schemaVersion === 2 ? scene.task.readabilityPolicy : (() => { throw new Error("Production Scene runtime requires readability-aware task input."); })(),
    visualResources: scene.resources.filter(({selected}) => selected.role === "scene-visual").map(({selected, descriptor}) => {
      if (descriptor.kind !== "asset" || !descriptor.localPath.startsWith("public/")) throw new Error("Production Scene visual resource is not local.");
      return {resourceId: selected.resourceId, src: staticFile(descriptor.localPath.slice("public/".length)), descriptorFingerprint: selected.descriptorFingerprint};
    }),
  }]),
);
export {currentRegistry as productionRendererRegistry};

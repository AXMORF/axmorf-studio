// @generated-by production-preview-scaffold-v1
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
import squareCornerStressPackageJson from "./scenes/square-corner-stress/generated/scene-package.generated.json";
import squareCornerStressResourcesJson from "./scenes/square-corner-stress/selected-resources.json";
import squareCornerStressShotsJson from "./scenes/square-corner-stress/shot-plan.json";
import squareCornerStressSoundJson from "./scenes/square-corner-stress/sound-plan.json";
import squareCornerStressAnchorsJson from "./scenes/square-corner-stress/sync-anchors.json";
import squareCornerStressTaskJson from "./scenes/square-corner-stress/task-input.generated.json";
import squareCornerStressVisualJson from "./scenes/square-corner-stress/visual-plan.json"; // Scene 0
import roundedLoadPathPackageJson from "./scenes/rounded-load-path/generated/scene-package.generated.json";
import roundedLoadPathResourcesJson from "./scenes/rounded-load-path/selected-resources.json";
import roundedLoadPathShotsJson from "./scenes/rounded-load-path/shot-plan.json";
import roundedLoadPathSoundJson from "./scenes/rounded-load-path/sound-plan.json";
import roundedLoadPathAnchorsJson from "./scenes/rounded-load-path/sync-anchors.json";
import roundedLoadPathTaskJson from "./scenes/rounded-load-path/task-input.generated.json";
import roundedLoadPathVisualJson from "./scenes/rounded-load-path/visual-plan.json"; // Scene 1
import visualStyleJson from "./visual-style.json";

const SelectedResourcesFileSchema = z.object({
  schemaVersion: z.literal(1),
  selectedResources: z.array(z.object({
    selected: SelectedResourceRefSchema,
    descriptor: ResourceDescriptorSchema,
  }).strict()).readonly(),
}).strict();

const rawScenes = [
  {task: squareCornerStressTaskJson, visual: squareCornerStressVisualJson, shots: squareCornerStressShotsJson, anchors: squareCornerStressAnchorsJson, sound: squareCornerStressSoundJson, resources: squareCornerStressResourcesJson, scenePackage: squareCornerStressPackageJson},
  {task: roundedLoadPathTaskJson, visual: roundedLoadPathVisualJson, shots: roundedLoadPathShotsJson, anchors: roundedLoadPathAnchorsJson, sound: roundedLoadPathSoundJson, resources: roundedLoadPathResourcesJson, scenePackage: roundedLoadPathPackageJson},
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
  productionSceneCoverage.storyId !== "rounded-airplane-windows" ||
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
  storyId: "rounded-airplane-windows",
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
  storyId: "rounded-airplane-windows",
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
    visualResources: scene.resources.filter(({selected}) => selected.role === "scene-visual").map(({selected, descriptor}) => {
      if (descriptor.kind !== "asset" || !descriptor.localPath.startsWith("public/")) throw new Error("Production Scene visual resource is not local.");
      return {resourceId: selected.resourceId, src: staticFile(descriptor.localPath.slice("public/".length)), descriptorFingerprint: selected.descriptorFingerprint};
    }),
  }]),
);
export {currentRegistry as productionRendererRegistry};

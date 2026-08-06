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
import notHumanThinkingPackageJson from "./scenes/not-human-thinking/generated/scene-package.generated.json";
import notHumanThinkingResourcesJson from "./scenes/not-human-thinking/selected-resources.json";
import notHumanThinkingShotsJson from "./scenes/not-human-thinking/shot-plan.json";
import notHumanThinkingSoundJson from "./scenes/not-human-thinking/sound-plan.json";
import notHumanThinkingAnchorsJson from "./scenes/not-human-thinking/sync-anchors.json";
import notHumanThinkingTaskJson from "./scenes/not-human-thinking/task-input.generated.json";
import notHumanThinkingVisualJson from "./scenes/not-human-thinking/visual-plan.json"; // Scene 0
import rulesVersusExamplesPackageJson from "./scenes/rules-versus-examples/generated/scene-package.generated.json";
import rulesVersusExamplesResourcesJson from "./scenes/rules-versus-examples/selected-resources.json";
import rulesVersusExamplesShotsJson from "./scenes/rules-versus-examples/shot-plan.json";
import rulesVersusExamplesSoundJson from "./scenes/rules-versus-examples/sound-plan.json";
import rulesVersusExamplesAnchorsJson from "./scenes/rules-versus-examples/sync-anchors.json";
import rulesVersusExamplesTaskJson from "./scenes/rules-versus-examples/task-input.generated.json";
import rulesVersusExamplesVisualJson from "./scenes/rules-versus-examples/visual-plan.json"; // Scene 1
import learnWithCatExamplesPackageJson from "./scenes/learn-with-cat-examples/generated/scene-package.generated.json";
import learnWithCatExamplesResourcesJson from "./scenes/learn-with-cat-examples/selected-resources.json";
import learnWithCatExamplesShotsJson from "./scenes/learn-with-cat-examples/shot-plan.json";
import learnWithCatExamplesSoundJson from "./scenes/learn-with-cat-examples/sound-plan.json";
import learnWithCatExamplesAnchorsJson from "./scenes/learn-with-cat-examples/sync-anchors.json";
import learnWithCatExamplesTaskJson from "./scenes/learn-with-cat-examples/task-input.generated.json";
import learnWithCatExamplesVisualJson from "./scenes/learn-with-cat-examples/visual-plan.json"; // Scene 2
import trainingModelPredictionPackageJson from "./scenes/training-model-prediction/generated/scene-package.generated.json";
import trainingModelPredictionResourcesJson from "./scenes/training-model-prediction/selected-resources.json";
import trainingModelPredictionShotsJson from "./scenes/training-model-prediction/shot-plan.json";
import trainingModelPredictionSoundJson from "./scenes/training-model-prediction/sound-plan.json";
import trainingModelPredictionAnchorsJson from "./scenes/training-model-prediction/sync-anchors.json";
import trainingModelPredictionTaskJson from "./scenes/training-model-prediction/task-input.generated.json";
import trainingModelPredictionVisualJson from "./scenes/training-model-prediction/visual-plan.json"; // Scene 3
import patternsHaveLimitsPackageJson from "./scenes/patterns-have-limits/generated/scene-package.generated.json";
import patternsHaveLimitsResourcesJson from "./scenes/patterns-have-limits/selected-resources.json";
import patternsHaveLimitsShotsJson from "./scenes/patterns-have-limits/shot-plan.json";
import patternsHaveLimitsSoundJson from "./scenes/patterns-have-limits/sound-plan.json";
import patternsHaveLimitsAnchorsJson from "./scenes/patterns-have-limits/sync-anchors.json";
import patternsHaveLimitsTaskJson from "./scenes/patterns-have-limits/task-input.generated.json";
import patternsHaveLimitsVisualJson from "./scenes/patterns-have-limits/visual-plan.json"; // Scene 4
import oneSentenceSummaryPackageJson from "./scenes/one-sentence-summary/generated/scene-package.generated.json";
import oneSentenceSummaryResourcesJson from "./scenes/one-sentence-summary/selected-resources.json";
import oneSentenceSummaryShotsJson from "./scenes/one-sentence-summary/shot-plan.json";
import oneSentenceSummarySoundJson from "./scenes/one-sentence-summary/sound-plan.json";
import oneSentenceSummaryAnchorsJson from "./scenes/one-sentence-summary/sync-anchors.json";
import oneSentenceSummaryTaskJson from "./scenes/one-sentence-summary/task-input.generated.json";
import oneSentenceSummaryVisualJson from "./scenes/one-sentence-summary/visual-plan.json"; // Scene 5
import visualStyleJson from "./visual-style.json";

const SelectedResourcesFileSchema = z.object({
  schemaVersion: z.literal(1),
  selectedResources: z.array(z.object({
    selected: SelectedResourceRefSchema,
    descriptor: ResourceDescriptorSchema,
  }).strict()).readonly(),
}).strict();

const rawScenes = [
  {task: notHumanThinkingTaskJson, visual: notHumanThinkingVisualJson, shots: notHumanThinkingShotsJson, anchors: notHumanThinkingAnchorsJson, sound: notHumanThinkingSoundJson, resources: notHumanThinkingResourcesJson, scenePackage: notHumanThinkingPackageJson},
  {task: rulesVersusExamplesTaskJson, visual: rulesVersusExamplesVisualJson, shots: rulesVersusExamplesShotsJson, anchors: rulesVersusExamplesAnchorsJson, sound: rulesVersusExamplesSoundJson, resources: rulesVersusExamplesResourcesJson, scenePackage: rulesVersusExamplesPackageJson},
  {task: learnWithCatExamplesTaskJson, visual: learnWithCatExamplesVisualJson, shots: learnWithCatExamplesShotsJson, anchors: learnWithCatExamplesAnchorsJson, sound: learnWithCatExamplesSoundJson, resources: learnWithCatExamplesResourcesJson, scenePackage: learnWithCatExamplesPackageJson},
  {task: trainingModelPredictionTaskJson, visual: trainingModelPredictionVisualJson, shots: trainingModelPredictionShotsJson, anchors: trainingModelPredictionAnchorsJson, sound: trainingModelPredictionSoundJson, resources: trainingModelPredictionResourcesJson, scenePackage: trainingModelPredictionPackageJson},
  {task: patternsHaveLimitsTaskJson, visual: patternsHaveLimitsVisualJson, shots: patternsHaveLimitsShotsJson, anchors: patternsHaveLimitsAnchorsJson, sound: patternsHaveLimitsSoundJson, resources: patternsHaveLimitsResourcesJson, scenePackage: patternsHaveLimitsPackageJson},
  {task: oneSentenceSummaryTaskJson, visual: oneSentenceSummaryVisualJson, shots: oneSentenceSummaryShotsJson, anchors: oneSentenceSummaryAnchorsJson, sound: oneSentenceSummarySoundJson, resources: oneSentenceSummaryResourcesJson, scenePackage: oneSentenceSummaryPackageJson},
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
  productionSceneCoverage.storyId !== "machine-learning-basics" ||
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
  storyId: "machine-learning-basics",
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
  storyId: "machine-learning-basics",
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

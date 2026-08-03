import {staticFile} from "remotion";
import {z} from "zod";

import {
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
import {
  rendererRegistry,
  rendererRegistryFingerprint,
  rendererSourceGraphFingerprints,
} from "./renderer-registry.generated";
import callToActionPackageJson from "./scenes/call-to-action/generated/scene-package.generated.json";
import callToActionResourcesJson from "./scenes/call-to-action/selected-resources.json";
import callToActionShotsJson from "./scenes/call-to-action/shot-plan.json";
import callToActionSoundJson from "./scenes/call-to-action/sound-plan.json";
import callToActionAnchorsJson from "./scenes/call-to-action/sync-anchors.json";
import callToActionTaskJson from "./scenes/call-to-action/task-input.generated.json";
import callToActionVisualJson from "./scenes/call-to-action/visual-plan.json";
import coreCapabilitiesPackageJson from "./scenes/core-capabilities/generated/scene-package.generated.json";
import coreCapabilitiesResourcesJson from "./scenes/core-capabilities/selected-resources.json";
import coreCapabilitiesShotsJson from "./scenes/core-capabilities/shot-plan.json";
import coreCapabilitiesSoundJson from "./scenes/core-capabilities/sound-plan.json";
import coreCapabilitiesAnchorsJson from "./scenes/core-capabilities/sync-anchors.json";
import coreCapabilitiesTaskJson from "./scenes/core-capabilities/task-input.generated.json";
import coreCapabilitiesVisualJson from "./scenes/core-capabilities/visual-plan.json";
import differentiatedValuePackageJson from "./scenes/differentiated-value/generated/scene-package.generated.json";
import differentiatedValueResourcesJson from "./scenes/differentiated-value/selected-resources.json";
import differentiatedValueShotsJson from "./scenes/differentiated-value/shot-plan.json";
import differentiatedValueSoundJson from "./scenes/differentiated-value/sound-plan.json";
import differentiatedValueAnchorsJson from "./scenes/differentiated-value/sync-anchors.json";
import differentiatedValueTaskJson from "./scenes/differentiated-value/task-input.generated.json";
import differentiatedValueVisualJson from "./scenes/differentiated-value/visual-plan.json";
import problemFrictionPackageJson from "./scenes/problem-friction/generated/scene-package.generated.json";
import problemFrictionResourcesJson from "./scenes/problem-friction/selected-resources.json";
import problemFrictionShotsJson from "./scenes/problem-friction/shot-plan.json";
import problemFrictionSoundJson from "./scenes/problem-friction/sound-plan.json";
import problemFrictionAnchorsJson from "./scenes/problem-friction/sync-anchors.json";
import problemFrictionTaskJson from "./scenes/problem-friction/task-input.generated.json";
import problemFrictionVisualJson from "./scenes/problem-friction/visual-plan.json";
import problemHookPackageJson from "./scenes/problem-hook/generated/scene-package.generated.json";
import problemHookResourcesJson from "./scenes/problem-hook/selected-resources.json";
import problemHookShotsJson from "./scenes/problem-hook/shot-plan.json";
import problemHookSoundJson from "./scenes/problem-hook/sound-plan.json";
import problemHookAnchorsJson from "./scenes/problem-hook/sync-anchors.json";
import problemHookTaskJson from "./scenes/problem-hook/task-input.generated.json";
import problemHookVisualJson from "./scenes/problem-hook/visual-plan.json";
import productRevealPackageJson from "./scenes/product-reveal/generated/scene-package.generated.json";
import productRevealResourcesJson from "./scenes/product-reveal/selected-resources.json";
import productRevealShotsJson from "./scenes/product-reveal/shot-plan.json";
import productRevealSoundJson from "./scenes/product-reveal/sound-plan.json";
import productRevealAnchorsJson from "./scenes/product-reveal/sync-anchors.json";
import productRevealTaskJson from "./scenes/product-reveal/task-input.generated.json";
import productRevealVisualJson from "./scenes/product-reveal/visual-plan.json";
import proofAndFitPackageJson from "./scenes/proof-and-fit/generated/scene-package.generated.json";
import proofAndFitResourcesJson from "./scenes/proof-and-fit/selected-resources.json";
import proofAndFitShotsJson from "./scenes/proof-and-fit/shot-plan.json";
import proofAndFitSoundJson from "./scenes/proof-and-fit/sound-plan.json";
import proofAndFitAnchorsJson from "./scenes/proof-and-fit/sync-anchors.json";
import proofAndFitTaskJson from "./scenes/proof-and-fit/task-input.generated.json";
import proofAndFitVisualJson from "./scenes/proof-and-fit/visual-plan.json";
import workflowCreatePackageJson from "./scenes/workflow-create/generated/scene-package.generated.json";
import workflowCreateResourcesJson from "./scenes/workflow-create/selected-resources.json";
import workflowCreateShotsJson from "./scenes/workflow-create/shot-plan.json";
import workflowCreateSoundJson from "./scenes/workflow-create/sound-plan.json";
import workflowCreateAnchorsJson from "./scenes/workflow-create/sync-anchors.json";
import workflowCreateTaskJson from "./scenes/workflow-create/task-input.generated.json";
import workflowCreateVisualJson from "./scenes/workflow-create/visual-plan.json";
import workflowInputPackageJson from "./scenes/workflow-input/generated/scene-package.generated.json";
import workflowInputResourcesJson from "./scenes/workflow-input/selected-resources.json";
import workflowInputShotsJson from "./scenes/workflow-input/shot-plan.json";
import workflowInputSoundJson from "./scenes/workflow-input/sound-plan.json";
import workflowInputAnchorsJson from "./scenes/workflow-input/sync-anchors.json";
import workflowInputTaskJson from "./scenes/workflow-input/task-input.generated.json";
import workflowInputVisualJson from "./scenes/workflow-input/visual-plan.json";
import workflowResultPackageJson from "./scenes/workflow-result/generated/scene-package.generated.json";
import workflowResultResourcesJson from "./scenes/workflow-result/selected-resources.json";
import workflowResultShotsJson from "./scenes/workflow-result/shot-plan.json";
import workflowResultSoundJson from "./scenes/workflow-result/sound-plan.json";
import workflowResultAnchorsJson from "./scenes/workflow-result/sync-anchors.json";
import workflowResultTaskJson from "./scenes/workflow-result/task-input.generated.json";
import workflowResultVisualJson from "./scenes/workflow-result/visual-plan.json";
import visualStyleJson from "./visual-style.json";

const SelectedResourcesFileSchema = z
  .object({
    schemaVersion: z.literal(1).optional(),
    selectedResources: z
      .array(
        z
          .object({
            selected: SelectedResourceRefSchema,
            descriptor: ResourceDescriptorSchema,
          })
          .strict(),
      )
      .readonly(),
  })
  .strict();

const rawScenes = [
  {task: problemHookTaskJson, visual: problemHookVisualJson, shots: problemHookShotsJson, anchors: problemHookAnchorsJson, sound: problemHookSoundJson, resources: problemHookResourcesJson, scenePackage: problemHookPackageJson},
  {task: problemFrictionTaskJson, visual: problemFrictionVisualJson, shots: problemFrictionShotsJson, anchors: problemFrictionAnchorsJson, sound: problemFrictionSoundJson, resources: problemFrictionResourcesJson, scenePackage: problemFrictionPackageJson},
  {task: productRevealTaskJson, visual: productRevealVisualJson, shots: productRevealShotsJson, anchors: productRevealAnchorsJson, sound: productRevealSoundJson, resources: productRevealResourcesJson, scenePackage: productRevealPackageJson},
  {task: coreCapabilitiesTaskJson, visual: coreCapabilitiesVisualJson, shots: coreCapabilitiesShotsJson, anchors: coreCapabilitiesAnchorsJson, sound: coreCapabilitiesSoundJson, resources: coreCapabilitiesResourcesJson, scenePackage: coreCapabilitiesPackageJson},
  {task: workflowInputTaskJson, visual: workflowInputVisualJson, shots: workflowInputShotsJson, anchors: workflowInputAnchorsJson, sound: workflowInputSoundJson, resources: workflowInputResourcesJson, scenePackage: workflowInputPackageJson},
  {task: workflowCreateTaskJson, visual: workflowCreateVisualJson, shots: workflowCreateShotsJson, anchors: workflowCreateAnchorsJson, sound: workflowCreateSoundJson, resources: workflowCreateResourcesJson, scenePackage: workflowCreatePackageJson},
  {task: workflowResultTaskJson, visual: workflowResultVisualJson, shots: workflowResultShotsJson, anchors: workflowResultAnchorsJson, sound: workflowResultSoundJson, resources: workflowResultResourcesJson, scenePackage: workflowResultPackageJson},
  {task: differentiatedValueTaskJson, visual: differentiatedValueVisualJson, shots: differentiatedValueShotsJson, anchors: differentiatedValueAnchorsJson, sound: differentiatedValueSoundJson, resources: differentiatedValueResourcesJson, scenePackage: differentiatedValuePackageJson},
  {task: proofAndFitTaskJson, visual: proofAndFitVisualJson, shots: proofAndFitShotsJson, anchors: proofAndFitAnchorsJson, sound: proofAndFitSoundJson, resources: proofAndFitResourcesJson, scenePackage: proofAndFitPackageJson},
  {task: callToActionTaskJson, visual: callToActionVisualJson, shots: callToActionShotsJson, anchors: callToActionAnchorsJson, sound: callToActionSoundJson, resources: callToActionResourcesJson, scenePackage: callToActionPackageJson},
] as const;

const visualStyle = VisualStyleSpecSchema.parse(visualStyleJson);
const semanticTiming = SemanticTimingSchema.parse(semanticTimingJson);
export const productComicVerticalCoverage =
  SceneCoverageMapSchema.parse(coverageJson);
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
  semanticTiming.fps !== 30 ||
  semanticTiming.durationInFrames !== 5116 ||
  productComicVerticalCoverage.storyId !== "product-comic-vertical" ||
  scenes.some((scene, index) => {
    const coverage = productComicVerticalCoverage.entries[index];
    return (
      coverage?.status !== "ready" ||
      coverage.meaningId !== scene.task.meaningId ||
      coverage.packageFingerprint !== scene.scenePackage.packageFingerprint ||
      scene.task.timingBeat.startFrame !== scene.scenePackage.beatFrameRange.startFrame ||
      scene.task.timingBeat.endFrame !== scene.scenePackage.beatFrameRange.endFrame
    );
  })
) {
  throw new Error("M9 Scene runtime inputs are stale or incomplete.");
}

const currentRegistry: SceneRendererRegistry = rendererRegistry;
const currentSourceGraphs: Readonly<Record<string, string>> =
  rendererSourceGraphFingerprints;
for (const {scenePackage} of scenes) {
  const {rendererId, rendererSourceFingerprint} = scenePackage.rendererBinding;
  if (
    currentRegistry[rendererId] === undefined ||
    currentSourceGraphs[rendererId] !== rendererSourceFingerprint
  ) {
    throw new Error("M9 RendererRegistry binding is stale.");
  }
}
if (Object.keys(currentRegistry).length !== scenes.length) {
  throw new Error("M9 RendererRegistry must contain exactly ten entries.");
}

const storyBeatTimings = scenes.map(({task}) => task.timingBeat);
const scenePackages = scenes.map(({scenePackage}) => scenePackage);
const transitions = scenes.slice(1).map((scene, index) => ({
  fromMeaningId: scenes[index]!.task.meaningId,
  toMeaningId: scene.task.meaningId,
  kind: "hard-cut" as const,
  durationInFrames: 0,
  boundaryFrame: scene.task.timingBeat.startFrame,
}));

export const productComicVerticalStoryVisualProjection =
  buildStoryVisualProjection({
    storyId: "product-comic-vertical",
    leadInFrames: 15,
    tailFrames: 15,
    durationInFrames: semanticTiming.durationInFrames,
    storyBeatTimings,
    coverage: productComicVerticalCoverage,
    packages: scenePackages,
    registryFingerprint: rendererRegistryFingerprint,
    transitions,
  });

const sceneSoundProjections = scenes.map((scene) =>
  resolveSceneSound({
    scenePackage: scene.scenePackage,
    soundPlan: scene.sound,
    syncAnchors: scene.anchors,
    resources: scene.resources.filter(
      ({selected}) =>
        selected.role === "scene-ambience" || selected.role === "scene-sfx",
    ),
  }),
);

export const productComicVerticalSoundDesignProjection =
  buildSoundDesignProjection({
    storyId: "product-comic-vertical",
    coverage: productComicVerticalCoverage,
    storyBeatTimings,
    sceneSoundProjections,
  });

export const productComicVerticalRendererPropsByMeaning: Readonly<
  Record<string, Omit<SceneRendererProps, "sceneFrame">>
> = Object.fromEntries(
  scenes.map((scene) => {
    const visualResources = scene.resources
      .filter(({selected}) => selected.role === "scene-visual")
      .map(({selected, descriptor}) => {
        if (
          descriptor.kind !== "asset" ||
          !descriptor.localPath.startsWith("public/")
        ) {
          throw new Error("M9 Scene visual resource must be a local asset.");
        }
        return {
          resourceId: selected.resourceId,
          src: staticFile(descriptor.localPath.slice("public/".length)),
          descriptorFingerprint: selected.descriptorFingerprint,
        };
      });
    return [
      scene.task.meaningId,
      {
        storyId: scene.task.storyId,
        meaningId: scene.task.meaningId,
        durationInFrames:
          scene.task.timingBeat.endFrame - scene.task.timingBeat.startFrame,
        fps: semanticTiming.fps,
        width: 1080,
        height: 1920,
        storyBeat: scene.task.storyBeat,
        timingBeat: scene.task.timingBeat,
        visualStyle,
        visualPlan: scene.visual,
        shots: scene.shots,
        syncAnchors: scene.anchors,
        visualResources,
      },
    ];
  }),
);

export {currentRegistry as productComicVerticalRendererRegistry};

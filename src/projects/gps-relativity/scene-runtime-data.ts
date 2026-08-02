import { staticFile } from "remotion";
import { z } from "zod";

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
import { resolveSceneSound } from "../../remotion/runtime/scene-sound";
import { buildSoundDesignProjection } from "../../remotion/runtime/sound-design";
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
import errorPackageJson from "./scenes/error-accumulation/generated/scene-package.generated.json";
import errorResourcesJson from "./scenes/error-accumulation/selected-resources.json";
import errorShotsJson from "./scenes/error-accumulation/shot-plan.json";
import errorSoundJson from "./scenes/error-accumulation/sound-plan.json";
import errorAnchorsJson from "./scenes/error-accumulation/sync-anchors.json";
import errorTaskJson from "./scenes/error-accumulation/task-input.generated.json";
import errorVisualJson from "./scenes/error-accumulation/visual-plan.json";
import netPackageJson from "./scenes/net-drift/generated/scene-package.generated.json";
import netResourcesJson from "./scenes/net-drift/selected-resources.json";
import netShotsJson from "./scenes/net-drift/shot-plan.json";
import netSoundJson from "./scenes/net-drift/sound-plan.json";
import netAnchorsJson from "./scenes/net-drift/sync-anchors.json";
import netTaskJson from "./scenes/net-drift/task-input.generated.json";
import netVisualJson from "./scenes/net-drift/visual-plan.json";
import positionPackageJson from "./scenes/position-is-time/generated/scene-package.generated.json";
import positionResourcesJson from "./scenes/position-is-time/selected-resources.json";
import positionShotsJson from "./scenes/position-is-time/shot-plan.json";
import positionSoundJson from "./scenes/position-is-time/sound-plan.json";
import positionAnchorsJson from "./scenes/position-is-time/sync-anchors.json";
import positionTaskJson from "./scenes/position-is-time/task-input.generated.json";
import positionVisualJson from "./scenes/position-is-time/visual-plan.json";
import practicalPackageJson from "./scenes/practical-conclusion/generated/scene-package.generated.json";
import practicalResourcesJson from "./scenes/practical-conclusion/selected-resources.json";
import practicalShotsJson from "./scenes/practical-conclusion/shot-plan.json";
import practicalSoundJson from "./scenes/practical-conclusion/sound-plan.json";
import practicalAnchorsJson from "./scenes/practical-conclusion/sync-anchors.json";
import practicalTaskJson from "./scenes/practical-conclusion/task-input.generated.json";
import practicalVisualJson from "./scenes/practical-conclusion/visual-plan.json";
import effectsPackageJson from "./scenes/two-relativistic-effects/generated/scene-package.generated.json";
import effectsResourcesJson from "./scenes/two-relativistic-effects/selected-resources.json";
import effectsShotsJson from "./scenes/two-relativistic-effects/shot-plan.json";
import effectsSoundJson from "./scenes/two-relativistic-effects/sound-plan.json";
import effectsAnchorsJson from "./scenes/two-relativistic-effects/sync-anchors.json";
import effectsTaskJson from "./scenes/two-relativistic-effects/task-input.generated.json";
import effectsVisualJson from "./scenes/two-relativistic-effects/visual-plan.json";
import visualStyleJson from "./visual-style.json";

const SelectedResourcesFileSchema = z
  .object({
    schemaVersion: z.literal(1),
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
  {
    task: positionTaskJson,
    visual: positionVisualJson,
    shots: positionShotsJson,
    anchors: positionAnchorsJson,
    sound: positionSoundJson,
    resources: positionResourcesJson,
    scenePackage: positionPackageJson,
  },
  {
    task: effectsTaskJson,
    visual: effectsVisualJson,
    shots: effectsShotsJson,
    anchors: effectsAnchorsJson,
    sound: effectsSoundJson,
    resources: effectsResourcesJson,
    scenePackage: effectsPackageJson,
  },
  {
    task: netTaskJson,
    visual: netVisualJson,
    shots: netShotsJson,
    anchors: netAnchorsJson,
    sound: netSoundJson,
    resources: netResourcesJson,
    scenePackage: netPackageJson,
  },
  {
    task: errorTaskJson,
    visual: errorVisualJson,
    shots: errorShotsJson,
    anchors: errorAnchorsJson,
    sound: errorSoundJson,
    resources: errorResourcesJson,
    scenePackage: errorPackageJson,
  },
  {
    task: practicalTaskJson,
    visual: practicalVisualJson,
    shots: practicalShotsJson,
    anchors: practicalAnchorsJson,
    sound: practicalSoundJson,
    resources: practicalResourcesJson,
    scenePackage: practicalPackageJson,
  },
] as const;

const visualStyle = VisualStyleSpecSchema.parse(visualStyleJson);
const semanticTiming = SemanticTimingSchema.parse(semanticTimingJson);
export const gpsRelativityCoverage = SceneCoverageMapSchema.parse(coverageJson);
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
  semanticTiming.durationInFrames !== 1731 ||
  gpsRelativityCoverage.storyId !== "gps-relativity" ||
  scenes.some((scene, index) => {
    const coverage = gpsRelativityCoverage.entries[index];
    return (
      coverage?.status !== "ready" ||
      coverage.meaningId !== scene.task.meaningId ||
      coverage.packageFingerprint !== scene.scenePackage.packageFingerprint ||
      scene.task.timingBeat.startFrame !==
        scene.scenePackage.beatFrameRange.startFrame ||
      scene.task.timingBeat.endFrame !==
        scene.scenePackage.beatFrameRange.endFrame
    );
  })
) {
  throw new Error("GPS M7 Scene runtime inputs are stale or incomplete.");
}

const currentRegistry: SceneRendererRegistry = rendererRegistry;
const currentSourceGraphs: Readonly<Record<string, string>> =
  rendererSourceGraphFingerprints;
for (const { scenePackage } of scenes) {
  const { rendererId, rendererSourceFingerprint } =
    scenePackage.rendererBinding;
  if (
    currentRegistry[rendererId] === undefined ||
    currentSourceGraphs[rendererId] !== rendererSourceFingerprint
  ) {
    throw new Error("GPS M7 RendererRegistry binding is stale.");
  }
}
if (Object.keys(currentRegistry).length !== scenes.length) {
  throw new Error("GPS M7 RendererRegistry must contain exactly five entries.");
}

const storyBeatTimings = scenes.map(({ task }) => task.timingBeat);
const scenePackages = scenes.map(({ scenePackage }) => scenePackage);
const transitions = scenes.slice(1).map((scene, index) => ({
  fromMeaningId: scenes[index].task.meaningId,
  toMeaningId: scene.task.meaningId,
  kind: "hard-cut" as const,
  durationInFrames: 0,
  boundaryFrame: scene.task.timingBeat.startFrame,
}));

export const gpsRelativityStoryVisualProjection = buildStoryVisualProjection({
  storyId: "gps-relativity",
  leadInFrames: 15,
  tailFrames: 15,
  durationInFrames: semanticTiming.durationInFrames,
  storyBeatTimings,
  coverage: gpsRelativityCoverage,
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
      ({ selected }) =>
        selected.role === "scene-ambience" || selected.role === "scene-sfx",
    ),
  }),
);

export const gpsRelativitySoundDesignProjection = buildSoundDesignProjection({
  storyId: "gps-relativity",
  coverage: gpsRelativityCoverage,
  storyBeatTimings,
  sceneSoundProjections,
});

export const gpsRelativityRendererPropsByMeaning: Readonly<
  Record<string, Omit<SceneRendererProps, "sceneFrame">>
> = Object.fromEntries(
  scenes.map((scene) => {
    const visualResources = scene.resources
      .filter(({ selected }) => selected.role === "scene-visual")
      .map(({ selected, descriptor }) => {
        if (
          descriptor.kind !== "asset" ||
          !descriptor.localPath.startsWith("public/")
        ) {
          throw new Error("GPS Scene visual resource must be a local asset.");
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
        width: 1920,
        height: 1080,
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

export { currentRegistry as gpsRelativityRendererRegistry };

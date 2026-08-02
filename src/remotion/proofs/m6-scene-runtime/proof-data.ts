import { staticFile } from "remotion";
import { z } from "zod";

import {
  ReferenceFidelityReceiptSchema,
  ResourceDescriptorSchema,
  SceneCoverageMapSchema,
  ScenePackageSchema,
  SceneSoundPlanSchema,
  SceneSyncAnchorSetSchema,
  SceneTaskInputSchema,
  SceneVisualPlanSchema,
  SelectedResourceRefSchema,
  ShotPlanSetSchema,
  ShotRecipeSelectionSchema,
  VisualStyleSpecSchema,
} from "../../../contracts";
import { resolveSceneSound } from "../../runtime/scene-sound";
import { buildSoundDesignProjection } from "../../runtime/sound-design";
import {
  buildStoryVisualProjection,
  type SceneRendererProps,
  type SceneRendererRegistry,
} from "../../runtime/story-visual";
import coverageJson from "./generated/scene-coverage.generated.json";
import fidelityJson from "./scenes/m6-scene-proof/generated/reference-fidelity.generated.json";
import packageJson from "./scenes/m6-scene-proof/generated/scene-package.generated.json";
import anchorsJson from "./scenes/m6-scene-proof/sync-anchors.json";
import resourcesJson from "./scenes/m6-scene-proof/selected-resources.json";
import selectionJson from "./scenes/m6-scene-proof/shot-recipe-selection.json";
import shotsJson from "./scenes/m6-scene-proof/shot-plan.json";
import soundJson from "./scenes/m6-scene-proof/sound-plan.json";
import taskJson from "./scenes/m6-scene-proof/task-input.generated.json";
import visualJson from "./scenes/m6-scene-proof/visual-plan.json";
import {
  rendererRegistry,
  rendererRegistryFingerprint,
  rendererSourceGraphFingerprints,
} from "./renderer-registry.generated";
import visualStyleJson from "./visual-style.generated.json";

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

export const m6ProofScenePackage = ScenePackageSchema.parse(packageJson);
export const m6ProofCoverage = SceneCoverageMapSchema.parse(coverageJson);
export const m6ProofSelection = ShotRecipeSelectionSchema.parse(selectionJson);
export const m6ProofFidelityReceipt =
  ReferenceFidelityReceiptSchema.parse(fidelityJson);

const task = SceneTaskInputSchema.parse(taskJson);
const visualStyle = VisualStyleSpecSchema.parse(visualStyleJson);
const visualPlan = SceneVisualPlanSchema.parse(visualJson);
const shots = ShotPlanSetSchema.parse(shotsJson);
const syncAnchors = SceneSyncAnchorSetSchema.parse(anchorsJson);
const soundPlan = SceneSoundPlanSchema.parse(soundJson);
const resourcePairs =
  SelectedResourcesFileSchema.parse(resourcesJson).selectedResources;

const proofRegistry: SceneRendererRegistry = rendererRegistry;
const proofSourceGraphs: Readonly<Record<string, string>> =
  rendererSourceGraphFingerprints;
if (
  proofSourceGraphs[m6ProofScenePackage.rendererBinding.rendererId] !==
    m6ProofScenePackage.rendererBinding.rendererSourceFingerprint ||
  proofRegistry[m6ProofScenePackage.rendererBinding.rendererId] === undefined
) {
  throw new Error("M6 proof RendererRegistry binding is stale.");
}

export const m6ProofStoryVisualProjection = buildStoryVisualProjection({
  storyId: task.storyId,
  leadInFrames: 0,
  tailFrames: 0,
  durationInFrames: 120,
  storyBeatTimings: [task.timingBeat],
  coverage: m6ProofCoverage,
  packages: [m6ProofScenePackage],
  registryFingerprint: rendererRegistryFingerprint,
  transitions: [],
});

const sceneSoundProjection = resolveSceneSound({
  scenePackage: m6ProofScenePackage,
  soundPlan,
  syncAnchors,
  resources: resourcePairs.filter(
    ({ selected }) =>
      selected.role === "scene-ambience" || selected.role === "scene-sfx",
  ),
});

export const m6ProofSoundDesignProjection = buildSoundDesignProjection({
  storyId: task.storyId,
  coverage: m6ProofCoverage,
  storyBeatTimings: [task.timingBeat],
  sceneSoundProjections: [sceneSoundProjection],
});

const visualResources = resourcePairs
  .filter(({ selected }) => selected.role === "scene-visual")
  .map(({ selected, descriptor }) => {
    if (descriptor.kind !== "asset") {
      throw new Error("M6 proof visual resource must be a local asset.");
    }
    return {
      resourceId: selected.resourceId,
      src: staticFile(descriptor.localPath.slice("public/".length)),
      descriptorFingerprint: selected.descriptorFingerprint,
    };
  });

export const m6ProofRendererPropsByMeaning: Readonly<
  Record<string, Omit<SceneRendererProps, "sceneFrame">>
> = {
  [task.meaningId]: {
    storyId: task.storyId,
    meaningId: task.meaningId,
    durationInFrames: 120,
    fps: 30,
    width: 1920,
    height: 1080,
    storyBeat: task.storyBeat,
    timingBeat: task.timingBeat,
    visualStyle,
    visualPlan,
    shots,
    syncAnchors,
    visualResources,
  },
};

export { proofRegistry as m6ProofRendererRegistry };

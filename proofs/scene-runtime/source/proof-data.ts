import { staticFile } from "remotion";
import { z } from "zod";

import { resolveProductionReadabilityPolicy } from "../../../src/contracts/production-readability";
import { ReferenceFidelityReceiptSchema } from "../../../src/contracts/reference-fidelity";
import {
  ResourceDescriptorSchema,
  SelectedResourceRefSchema,
} from "../../../src/contracts/resource-catalog";
import {
  SceneSoundPlanSchema,
  SceneSyncAnchorSetSchema,
  SceneVisualPlanSchema,
  ShotPlanSetSchema,
} from "../../../src/contracts/scene-plan";
import {
  SceneCoverageMapSchema,
  ScenePackageSchema,
} from "../../../src/contracts/scene-package";
import { SceneTaskInputSchema } from "../../../src/contracts/scene-task";
import { ShotRecipeSelectionSchema } from "../../../src/contracts/shot-recipe";
import { VisualStyleSpecSchema } from "../../../src/contracts/visual-style";
import { resolveSceneSound } from "../../../src/remotion/runtime/scene-sound";
import { buildSoundDesignProjection } from "../../../src/remotion/runtime/sound-design";
import {
  buildStoryVisualProjection,
  type SceneRendererMountProps,
  type SceneRendererRegistry,
} from "../../../src/remotion/runtime/story-visual";
import { SCENE_RUNTIME_PROOF_IDENTITY } from "../identity";
import coverageJson from "../fixtures/generated/scene-coverage.generated.json";
import fidelityJson from "../fixtures/scenes/runtime-proof-scene/generated/reference-fidelity.generated.json";
import packageJson from "../fixtures/scenes/runtime-proof-scene/generated/scene-package.generated.json";
import anchorsJson from "../fixtures/scenes/runtime-proof-scene/sync-anchors.json";
import resourcesJson from "../fixtures/scenes/runtime-proof-scene/selected-resources.json";
import selectionJson from "../fixtures/scenes/runtime-proof-scene/shot-recipe-selection.json";
import shotsJson from "../fixtures/scenes/runtime-proof-scene/shot-plan.json";
import soundJson from "../fixtures/scenes/runtime-proof-scene/sound-plan.json";
import taskJson from "../fixtures/scenes/runtime-proof-scene/task-input.generated.json";
import visualJson from "../fixtures/scenes/runtime-proof-scene/visual-plan.json";
import {
  rendererRegistry,
  rendererRegistryFingerprint,
  rendererSourceGraphFingerprints,
} from "../fixtures/renderer-registry.generated";
import visualStyleJson from "../fixtures/visual-style.generated.json";

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

export const sceneRuntimeProofScenePackage =
  ScenePackageSchema.parse(packageJson);
export const sceneRuntimeProofCoverage =
  SceneCoverageMapSchema.parse(coverageJson);
export const sceneRuntimeProofSelection =
  ShotRecipeSelectionSchema.parse(selectionJson);
export const sceneRuntimeProofFidelityReceipt =
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
  proofSourceGraphs[
    sceneRuntimeProofScenePackage.rendererBinding.rendererId
  ] !==
    sceneRuntimeProofScenePackage.rendererBinding.rendererSourceFingerprint ||
  proofRegistry[sceneRuntimeProofScenePackage.rendererBinding.rendererId] ===
    undefined
) {
  throw new Error("Scene runtime proof RendererRegistry binding is stale.");
}

export const sceneRuntimeProofStoryVisualProjection =
  buildStoryVisualProjection({
    storyId: task.storyId,
    leadInFrames: 0,
    tailFrames: 0,
    durationInFrames: SCENE_RUNTIME_PROOF_IDENTITY.durationInFrames,
    storyBeatTimings: [task.timingBeat],
    coverage: sceneRuntimeProofCoverage,
    packages: [sceneRuntimeProofScenePackage],
    registryFingerprint: rendererRegistryFingerprint,
    transitions: [],
  });

const sceneSoundProjection = resolveSceneSound({
  scenePackage: sceneRuntimeProofScenePackage,
  soundPlan,
  syncAnchors,
  resources: resourcePairs.filter(
    ({ selected }) =>
      selected.role === "scene-ambience" || selected.role === "scene-sfx",
  ),
});

export const sceneRuntimeProofSoundDesignProjection =
  buildSoundDesignProjection({
    storyId: task.storyId,
    coverage: sceneRuntimeProofCoverage,
    storyBeatTimings: [task.timingBeat],
    sceneSoundProjections: [sceneSoundProjection],
  });

const visualResources = resourcePairs
  .filter(({ selected }) => selected.role === "scene-visual")
  .map(({ selected, descriptor }) => {
    if (descriptor.kind !== "asset") {
      throw new Error(
        "Scene runtime proof visual resource must be a local asset.",
      );
    }
    return {
      resourceId: selected.resourceId,
      src: staticFile(descriptor.localPath.slice("public/".length)),
      descriptorFingerprint: selected.descriptorFingerprint,
    };
  });

export const sceneRuntimeProofRendererPropsByMeaning: Readonly<
  Record<string, SceneRendererMountProps>
> = {
  [task.meaningId]: {
    storyId: task.storyId,
    meaningId: task.meaningId,
    durationInFrames: SCENE_RUNTIME_PROOF_IDENTITY.durationInFrames,
    fps: SCENE_RUNTIME_PROOF_IDENTITY.fps,
    width: SCENE_RUNTIME_PROOF_IDENTITY.width,
    height: SCENE_RUNTIME_PROOF_IDENTITY.height,
    storyBeat: task.storyBeat,
    sourceReferences: task.sourceReferences,
    timingBeat: task.timingBeat,
    visualStyle,
    visualPlan,
    shots,
    syncAnchors,
    visualResources,
    readabilityPolicy: resolveProductionReadabilityPolicy({
      width: SCENE_RUNTIME_PROOF_IDENTITY.width,
      height: SCENE_RUNTIME_PROOF_IDENTITY.height,
    }),
    sceneBoundaryVersion: "scene-composition-boundary-v1",
  },
};

export { proofRegistry as sceneRuntimeProofRendererRegistry };

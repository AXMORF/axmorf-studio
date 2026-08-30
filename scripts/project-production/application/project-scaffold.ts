import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  Sha256DigestSchema,
  StoryIdSchema,
} from "@axmorf/studio/contracts";
import { writeOrCheckRendererRegistry } from "../../renderer-registry/project-files";
import { writeTextFileAtomic } from "../../shared/atomic-file";

export const PRODUCTION_PROJECT_SCAFFOLD_MARKER =
  "@generated-by production-project-current-v1" as const;
export const PRODUCTION_RENDER_SCAFFOLD_MARKER =
  "@generated-by project-production-runtime-v2" as const;

const componentNameFor = (storyId: string) =>
  `${storyId
    .split("-")
    .map((part) => `${part[0]?.toUpperCase()}${part.slice(1)}`)
    .join("")}Composition`;

const variableNameFor = (value: string) =>
  value
    .split("-")
    .map((part, index) =>
      index === 0 ? part : `${part[0]?.toUpperCase()}${part.slice(1)}`,
    )
    .join("");

const renderProductionSceneRuntimeTemplate = ({
  storyId: rawStoryId,
  meaningIds: rawMeaningIds,
  runtimeInputFingerprint: rawRuntimeInputFingerprint,
}: {
  readonly storyId: string;
  readonly meaningIds: readonly string[];
  readonly runtimeInputFingerprint: string;
}) => {
  const storyId = StoryIdSchema.parse(rawStoryId);
  const runtimeInputFingerprint = Sha256DigestSchema.parse(
    rawRuntimeInputFingerprint,
  );
  const meaningIds = rawMeaningIds.map((meaningId) =>
    StoryIdSchema.parse(meaningId),
  );
  if (
    meaningIds.length === 0 ||
    new Set(meaningIds).size !== meaningIds.length
  ) {
    throw new Error("Production Scene runtime requires unique Scenes.");
  }
  const imports = meaningIds
    .map((meaningId, index) => {
      const name = variableNameFor(meaningId);
      const prefix = `./scenes/${meaningId}`;
      return `import ${name}PackageJson from ${JSON.stringify(`${prefix}/generated/scene-package.generated.json`)};
import ${name}ResourcesJson from ${JSON.stringify(`${prefix}/selected-resources.json`)};
import ${name}ShotsJson from ${JSON.stringify(`${prefix}/shot-plan.json`)};
import ${name}SoundJson from ${JSON.stringify(`${prefix}/sound-plan.json`)};
import ${name}AnchorsJson from ${JSON.stringify(`${prefix}/sync-anchors.json`)};
import ${name}TaskJson from ${JSON.stringify(`${prefix}/task-input.generated.json`)};
import ${name}VisualJson from ${JSON.stringify(`${prefix}/visual-plan.json`)}; // Scene ${index}`;
    })
    .join("\n");
  const rawScenes = meaningIds
    .map((meaningId) => {
      const name = variableNameFor(meaningId);
      return `  {task: ${name}TaskJson, visual: ${name}VisualJson, shots: ${name}ShotsJson, anchors: ${name}AnchorsJson, sound: ${name}SoundJson, resources: ${name}ResourcesJson, scenePackage: ${name}PackageJson},`;
    })
    .join("\n");
  return `// ${PRODUCTION_RENDER_SCAFFOLD_MARKER}
// runtime-input-fingerprint ${runtimeInputFingerprint}
import {staticFile} from "remotion";
import {z} from "zod";

import {
  AuthoringRequirementsSchema,
  RenderSpecSchema,
  ProjectSoundPlanSchema,
  ResourceCatalogSchema,
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
  resolveSceneViewport,
} from "@axmorf/studio/contracts";
import {
  buildStoryVisualProjection,
  buildSoundDesignProjection,
  resolveSceneSound,
  type SceneRendererMountProps,
  type SceneRendererRegistry,
} from "@axmorf/studio/remotion";
import coverageJson from "./generated/scene-coverage.generated.json";
import resourceCatalogJson from "./generated/resource-catalog.generated.json";
import semanticTimingJson from "./generated/semantic-timing.generated.json";
import renderJson from "./render.json";
import projectSoundJson from "./sound.json";
import requirementsJson from "./production/requirements.json";
import {
  rendererRegistry,
  rendererRegistryFingerprint,
  rendererSourceGraphFingerprints,
} from "./renderer-registry.generated";
${imports}
import visualStyleJson from "./visual-style.json";

const SelectedResourcesFileSchema = z.object({
  schemaVersion: z.literal(1),
  selectedResources: z.array(z.object({
    selected: SelectedResourceRefSchema,
    descriptor: ResourceDescriptorSchema,
  }).strict()).readonly(),
}).strict();

const rawScenes = [
${rawScenes}
] as const;
const visualStyle = VisualStyleSpecSchema.parse(visualStyleJson);
const semanticTiming = SemanticTimingSchema.parse(semanticTimingJson);
const render = RenderSpecSchema.parse(renderJson);
const resourceCatalog = ResourceCatalogSchema.parse(resourceCatalogJson);
const projectSound = ProjectSoundPlanSchema.parse(projectSoundJson);
const requirements = AuthoringRequirementsSchema.parse(requirementsJson);
const sceneViewport = resolveSceneViewport(requirements.readabilityPolicy);
const projectSoundResourceIds = new Set(projectSound.contributions.map(({resourceId}) => resourceId));
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
  productionSceneCoverage.storyId !== ${JSON.stringify(storyId)} ||
  render.fps !== semanticTiming.fps ||
  scenes.length !== productionSceneCoverage.entries.length ||
  scenes.some((scene, index) => {
    const coverage = productionSceneCoverage.entries[index];
    return coverage?.status !== "ready" ||
      coverage.meaningId !== scene.task.meaningId ||
      coverage.packageFingerprint !== scene.scenePackage.packageFingerprint ||
      scene.task.sceneViewport.viewportFingerprint !== sceneViewport.viewportFingerprint ||
      scene.task.sceneCompositionBoundaryVersion !== requirements.sceneBoundaryOwnership.sceneCompositionBoundaryVersion;
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
  storyId: ${JSON.stringify(storyId)},
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
  resources: scene.resources.filter(({selected}) => selected.role === "sound-effect" || selected.role === "background-music"),
}));
export const productionSoundDesignProjection = buildSoundDesignProjection({
  storyId: ${JSON.stringify(storyId)},
  coverage: productionSceneCoverage,
  storyBeatTimings,
  sceneSoundProjections,
  projectSoundPlan: projectSound,
  projectSoundResources: resourceCatalog.entries.map(({descriptor}) => descriptor).filter((descriptor) => descriptor.kind === "asset" && descriptor.mediaRole === "background-music" && projectSoundResourceIds.has(descriptor.id)),
});
export const productionRendererPropsByMeaning: Readonly<Record<string, SceneRendererMountProps>> = Object.fromEntries(
  scenes.map((scene) => {
    if (scene.scenePackage.schemaVersion !== 6 || scene.task.schemaVersion !== 7) throw new Error("Production Scene package is not current.");
    const task = scene.task;
    return [task.meaningId, {
    storyId: task.storyId,
    meaningId: task.meaningId,
    durationInFrames: task.timingBeat.endFrame - task.timingBeat.startFrame,
    fps: render.fps,
    storyBeat: task.storyBeat,
    sourceReferences: task.sourceReferences,
    timingBeat: task.timingBeat,
    visualStyle,
    visualPlan: scene.visual,
    shots: scene.shots,
    syncAnchors: scene.anchors,
    readabilityPolicy: requirements.readabilityPolicy,
    sceneBoundaryVersion: task.sceneCompositionBoundaryVersion,
    visualResources: scene.resources.filter(({selected}) => selected.role === "scene-visual").map(({selected, descriptor}) => {
      if (descriptor.kind !== "asset" || !descriptor.localPath.startsWith("public/")) throw new Error("Production Scene visual resource is not local.");
      return {resourceId: selected.resourceId, src: staticFile(descriptor.localPath.slice("public/".length)), descriptorFingerprint: selected.descriptorFingerprint};
    }),
  }];
  }),
);
export {currentRegistry as productionRendererRegistry};
`;
};

export const renderReadabilityAwareProductionSceneRuntime = (input: {
  readonly storyId: string;
  readonly meaningIds: readonly string[];
  readonly runtimeInputFingerprint: string;
}) => renderProductionSceneRuntimeTemplate(input);

export const renderProjectAuthoringBuildScaffold = ({
  storyId: rawStoryId,
  runtimeInputFingerprint: rawRuntimeInputFingerprint,
}: {
  readonly storyId: string;
  readonly runtimeInputFingerprint: string;
}) => {
  const storyId = StoryIdSchema.parse(rawStoryId);
  const runtimeInputFingerprint = Sha256DigestSchema.parse(
    rawRuntimeInputFingerprint,
  );
  const componentName = componentNameFor(storyId);
  return `// @generated-by project-revision-artifact-v1
// runtime-input-fingerprint ${runtimeInputFingerprint}
import type {FC} from "react";
import {Sequence, staticFile} from "remotion";
import {AuthoringRequirementsSchema, deriveGlobalVisualLayerPolicy, GlobalVisualPlanSchema, getStoryCompositionDurationInFrames, MasteredNarrationManifestSchema, parseNarrativeProjectSource, SealedNarrationManifestSchema, SemanticTimingSchema, StoryCompositionPropsSchema, validateNarrativeArtifactBundle, type StoryCompositionProps} from "@axmorf/studio/contracts";
import {CompositionAssembly, NarrativeCore, SoundDesignTrack, StoryVisualTrack, type GlobalVisualLayersComponent, type NarrativeCoreProps} from "@axmorf/studio/remotion";
import briefJson from "./brief.json";
import masteredNarrationJson from "./generated/mastered-narration.generated.json";
import sealedNarrationJson from "./generated/sealed-narration.generated.json";
import semanticTimingJson from "./generated/semantic-timing.generated.json";
import {GlobalVisualBaseLayer, GlobalVisualDecorationLayers} from "./global-visual/GlobalVisualLayers";
import globalVisualPlanJson from "./global-visual-plan.json";
import narrationJson from "./narration.json";
import {productionRendererPropsByMeaning, productionRendererRegistry, productionSoundDesignProjection, productionStoryVisualProjection} from "./production-scene-runtime.generated";
import renderJson from "./render.json";
import requirementsJson from "./production/requirements.json";
import storyJson from "./story.json";

const requirements = AuthoringRequirementsSchema.parse(requirementsJson);
const projectSource = parseNarrativeProjectSource({brief: briefJson, story: storyJson, narration: narrationJson, render: renderJson});
const sealedNarration = SealedNarrationManifestSchema.parse(sealedNarrationJson);
const masteredNarration = MasteredNarrationManifestSchema.parse(masteredNarrationJson);
const semanticTiming = SemanticTimingSchema.parse(semanticTimingJson);
const artifactBundle = validateNarrativeArtifactBundle({projectSource, sealedNarration, semanticTiming});
const storyId = artifactBundle.projectSource.story.storyId;
const render = artifactBundle.projectSource.render;
const timing = artifactBundle.semanticTiming;
const globalVisualLayerPolicy = deriveGlobalVisualLayerPolicy(timing);
const globalVisualPlan = GlobalVisualPlanSchema.parse(globalVisualPlanJson);
if (storyId !== ${JSON.stringify(storyId)} || render.fps !== timing.fps || requirements.readabilityPolicy.width !== render.width || requirements.readabilityPolicy.height !== render.height || globalVisualPlan.storyId !== storyId || globalVisualPlan.compositionId !== render.compositionId || masteredNarration.storyId !== storyId || masteredNarration.sealedNarrationFingerprint !== sealedNarration.sealedNarrationFingerprint) throw new Error("Project production Composition identity is stale.");
const completeAudioLocalPath = masteredNarration.outputAudio.localPath;
if (!completeAudioLocalPath.startsWith("public/projects/" + storyId + "/narration-mastered/")) throw new Error("Mastered narration path is outside the Project.");
const ProductionGlobalVisualBaseLayer: GlobalVisualLayersComponent<typeof GlobalVisualBaseLayer> = GlobalVisualBaseLayer;
const ProductionGlobalVisualDecorationLayers: GlobalVisualLayersComponent<typeof GlobalVisualDecorationLayers> = GlobalVisualDecorationLayers;
const completeNarrationSrc = staticFile(completeAudioLocalPath.slice("public/".length));
export const productionNarrativeCompositionMetadata = {id: render.compositionId, fps: render.fps, width: render.width, height: render.height, durationInFrames: getStoryCompositionDurationInFrames(timing.durationInFrames), defaultProps: {projectId: storyId}} as const;
export const createProductionNarrativeCoreProps = (input: unknown): NarrativeCoreProps => { const props = StoryCompositionPropsSchema.parse(input); if (props.projectId !== storyId) throw new Error("Composition only accepts its own Project."); return {src: completeNarrationSrc, narrationStartFrame: timing.narrationStartFrame, captionCues: timing.captionCues, safeAreaPx: requirements.readabilityPolicy.captionSafeAreaPx, readabilityPolicy: requirements.readabilityPolicy}; };
const ${componentName}: FC<StoryCompositionProps> = (props) => <CompositionAssembly storyVisualTrack={<StoryVisualTrack projection={productionStoryVisualProjection} registry={productionRendererRegistry} rendererPropsByMeaning={productionRendererPropsByMeaning}/>} globalVisualBackgroundLayers={<ProductionGlobalVisualBaseLayer/>} globalVisualLayers={<Sequence from={globalVisualLayerPolicy.decorationFrameRange.startFrame} durationInFrames={globalVisualLayerPolicy.decorationFrameRange.endFrame - globalVisualLayerPolicy.decorationFrameRange.startFrame} layout="absolute-fill"><ProductionGlobalVisualDecorationLayers/></Sequence>} narrativeCore={<NarrativeCore {...createProductionNarrativeCoreProps(props)}/>} soundDesignTrack={<SoundDesignTrack projection={productionSoundDesignProjection}/>}/>;
export default ${componentName};
`;
};

export const ensureProjectAuthoringBuildScaffold = async ({
  rootDir,
  storyId,
  meaningIds,
  runtimeInputFingerprint,
}: {
  readonly rootDir: string;
  readonly storyId: string;
  readonly meaningIds: readonly string[];
  readonly runtimeInputFingerprint: string;
}) => {
  const projectRoot = join(
    rootDir,
    "src/projects",
    StoryIdSchema.parse(storyId),
  );
  const runtimeDestination = join(
    projectRoot,
    "production-scene-runtime.generated.ts",
  );
  const runtimeSource = renderReadabilityAwareProductionSceneRuntime({
    storyId,
    meaningIds,
    runtimeInputFingerprint,
  });
  await writeOrCheckRendererRegistry({
    destination: runtimeDestination,
    source: runtimeSource,
    mode: "write",
  });
  const destination = join(projectRoot, "Composition.tsx");
  const expected = renderProjectAuthoringBuildScaffold({
    storyId,
    runtimeInputFingerprint,
  });
  let current: string | null = null;
  try {
    current = await readFile(destination, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (
    current !== null &&
    current !== expected &&
    !current.includes("@generated-by")
  )
    throw new Error("Refusing to overwrite a hand-written Composition.");
  await writeTextFileAtomic({
    destination,
    bytes: expected,
    mode: current === null ? "create" : "replace",
  });
  return { destination, runtimeDestination, source: expected } as const;
};

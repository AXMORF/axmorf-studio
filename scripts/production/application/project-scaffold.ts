import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";

import { StoryIdSchema } from "../../../src/contracts";
import { writeProductionFileAtomic } from "../adapters/run-store";
import { writeOrCheckRendererRegistry } from "../../renderer-registry/project-files";

export const PRODUCTION_PROJECT_SCAFFOLD_MARKER =
  "@generated-by production-project-current-v1" as const;
export const PRODUCTION_RENDER_SCAFFOLD_MARKER =
  "@generated-by production-render-scaffold-v1" as const;

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

export const renderProductionProjectScaffold = (rawStoryId: string) => {
  const storyId = StoryIdSchema.parse(rawStoryId);
  const componentName = componentNameFor(storyId);
  return `// ${PRODUCTION_PROJECT_SCAFFOLD_MARKER}
import type {FC} from "react";
import {staticFile} from "remotion";

import {
  parseNarrativeProjectSource,
  MasteredNarrationManifestSchema,
  ProductionRequirementsFreezeSchema,
  SealedNarrationManifestSchema,
  SemanticTimingSchema,
  StoryCompositionPropsSchema,
  validateM1ArtifactBundle,
  type StoryCompositionProps,
} from "../../contracts";
import {CompositionAssembly} from "../../remotion/runtime/composition-assembly";
import {
  NarrativeCore,
  type NarrativeCoreProps,
} from "../../remotion/runtime/narrative-core";
import briefJson from "./brief.json";
import masteredNarrationJson from "./generated/mastered-narration.generated.json";
import sealedNarrationJson from "./generated/sealed-narration.generated.json";
import semanticTimingJson from "./generated/semantic-timing.generated.json";
import narrationJson from "./narration.json";
import renderJson from "./render.json";
import requirementsJson from "./production/requirements.json";
import storyJson from "./story.json";

const productionRequirements = ProductionRequirementsFreezeSchema.parse(requirementsJson);
const readabilityPolicy = productionRequirements.readabilityPolicy;
const projectSource = parseNarrativeProjectSource({
  brief: briefJson,
  story: storyJson,
  narration: narrationJson,
  render: renderJson,
});
const sealedNarration =
  SealedNarrationManifestSchema.parse(sealedNarrationJson);
const masteredNarration =
  MasteredNarrationManifestSchema.parse(masteredNarrationJson);
const semanticTiming = SemanticTimingSchema.parse(semanticTimingJson);
const artifactBundle = validateM1ArtifactBundle({
  projectSource,
  sealedNarration,
  semanticTiming,
});

const expectedStoryId = ${JSON.stringify(storyId)};
const storyId = artifactBundle.projectSource.story.storyId;
const render = artifactBundle.projectSource.render;
const timing = artifactBundle.semanticTiming;
if (storyId !== expectedStoryId) {
  throw new Error("Production Composition Story ID is stale.");
}
if (readabilityPolicy.width !== render.width || readabilityPolicy.height !== render.height) {
  throw new Error("Production readability policy dimensions are stale.");
}
if (render.fps !== timing.fps) {
  throw new Error("Production Composition render and timing fps differ.");
}

if (
  masteredNarration.storyId !== storyId ||
  masteredNarration.sealedNarrationFingerprint !==
    artifactBundle.sealedNarration.sealedNarrationFingerprint ||
  masteredNarration.sourceAudio.checksum !==
    artifactBundle.sealedNarration.completeAudio.checksum ||
  masteredNarration.outputAudio.sampleFrameCount !==
    artifactBundle.sealedNarration.completeAudio.sampleFrameCount
) {
  throw new Error("Mastered narration identity is stale.");
}
const completeAudioLocalPath = masteredNarration.outputAudio.localPath;
const expectedAudioPrefix = \`public/projects/\${storyId}/narration-mastered/\`;
if (!completeAudioLocalPath.startsWith(expectedAudioPrefix)) {
  throw new Error("Complete narration must stay under the Story narration path.");
}
const completeNarrationSrc = staticFile(
  completeAudioLocalPath.slice("public/".length),
);

export const productionNarrativeCompositionMetadata = {
  id: render.compositionId,
  fps: render.fps,
  width: render.width,
  height: render.height,
  durationInFrames: timing.durationInFrames,
  defaultProps: {projectId: storyId},
} as const;

export const createProductionNarrativeCoreProps = (
  input: unknown,
): NarrativeCoreProps => {
  const props = StoryCompositionPropsSchema.parse(input);
  if (props.projectId !== storyId) {
    throw new Error("Production Composition only accepts its own projectId.");
  }
  return {
    src: completeNarrationSrc,
    narrationStartFrame: timing.narrationStartFrame,
    captionCues: timing.captionCues,
    safeAreaPx: readabilityPolicy.captionSafeAreaPx,
    readabilityPolicy,
  };
};

const ${componentName}: FC<StoryCompositionProps> = (props) => (
  <CompositionAssembly
    narrativeCore={
      <NarrativeCore {...createProductionNarrativeCoreProps(props)} />
    }
  />
);

export default ${componentName};
`;
};

const renderPreIsolationProductionProjectScaffold = (storyId: string) => {
  const current = renderProductionProjectScaffold(storyId);
  const preIsolation = current.replace("/narration-mastered/", "/narration/");
  if (preIsolation === current) {
    throw new Error("Pre-isolation narrative scaffold migration is stale.");
  }
  return preIsolation;
};

export const ensureProductionProjectScaffold = async ({
  rootDir,
  storyId: rawStoryId,
  mode,
}: {
  readonly rootDir: string;
  readonly storyId: string;
  readonly mode: "write" | "check";
}) => {
  const storyId = StoryIdSchema.parse(rawStoryId);
  const destination = join(rootDir, "src/projects", storyId, "Composition.tsx");
  const expected = renderProductionProjectScaffold(storyId);
  let actual: string | null = null;
  try {
    const entry = await lstat(destination);
    if (entry.isSymbolicLink() || !entry.isFile()) {
      throw new Error("Production Composition must be a regular file.");
    }
    actual = await readFile(destination, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (actual === expected) {
    return { destination, written: false } as const;
  }
  if (
    actual === renderPreIsolationProductionProjectScaffold(storyId) &&
    mode === "write"
  ) {
    const result = await writeProductionFileAtomic({
      destination,
      bytes: expected,
      mode: "replace",
    });
    return { destination, written: result.written } as const;
  }
  const isExactRenderScaffold = [false, true].some((sceneLocalSoundPresent) =>
    [
      renderProductionRenderProjectScaffold({
        storyId,
        sceneLocalSoundPresent,
      }),
      renderPreMasteringProductionRenderProjectScaffold({
        storyId,
        sceneLocalSoundPresent,
      }),
      renderLegacyNoPropsProductionRenderProjectScaffold({
        storyId,
        sceneLocalSoundPresent,
      }),
      renderLegacyPropsProductionRenderProjectScaffold({
        storyId,
        sceneLocalSoundPresent,
      }),
      renderPreMasteringLegacyNoPropsProductionRenderProjectScaffold({
        storyId,
        sceneLocalSoundPresent,
      }),
      renderPreMasteringLegacyPropsProductionRenderProjectScaffold({
        storyId,
        sceneLocalSoundPresent,
      }),
    ].includes(actual ?? ""),
  );
  if (isExactRenderScaffold && mode === "write") {
    const result = await writeProductionFileAtomic({
      destination,
      bytes: expected,
      mode: "replace",
    });
    return { destination, written: result.written } as const;
  }
  if (actual !== null) {
    if (actual.includes(PRODUCTION_PROJECT_SCAFFOLD_MARKER)) {
      throw new Error(
        "Generated production Composition scaffold has byte drift.",
      );
    }
    throw new Error(
      "Refusing to overwrite a non-template hand-written Composition.",
    );
  }
  if (mode === "check") {
    throw new Error("Production Composition scaffold is missing.");
  }
  const result = await writeProductionFileAtomic({
    destination,
    bytes: expected,
    mode: "create",
  });
  return { destination, written: result.written } as const;
};

const renderProductionSceneRuntimeTemplate = ({
  storyId: rawStoryId,
  meaningIds: rawMeaningIds,
}: {
  readonly storyId: string;
  readonly meaningIds: readonly string[];
}) => {
  const storyId = StoryIdSchema.parse(rawStoryId);
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
  resources: scene.resources.filter(({selected}) => selected.role === "scene-ambience" || selected.role === "scene-sfx"),
}));
export const productionSoundDesignProjection = buildSoundDesignProjection({
  storyId: ${JSON.stringify(storyId)},
  coverage: productionSceneCoverage,
  storyBeatTimings,
  sceneSoundProjections,
});
export const productionRendererPropsByMeaning: Readonly<Record<string, SceneRendererMountProps>> = Object.fromEntries(
  scenes.map((scene) => {
    if (scene.scenePackage.schemaVersion !== 4 || scene.task.schemaVersion !== 4) throw new Error("Production Scene package is not current.");
    const task = scene.task;
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
}) => renderProductionSceneRuntimeTemplate(input);

const renderProductionRenderProjectScaffoldVariant = ({
  storyId: rawStoryId,
  sceneLocalSoundPresent,
  globalVisualComponentInterface,
  masteredNarration,
}: {
  readonly storyId: string;
  readonly sceneLocalSoundPresent: boolean;
  readonly globalVisualComponentInterface:
    | "current-no-props"
    | "legacy-no-props"
    | "legacy-props";
  readonly masteredNarration: boolean;
}) => {
  const storyId = StoryIdSchema.parse(rawStoryId);
  const componentName = componentNameFor(storyId);
  const soundImport = sceneLocalSoundPresent
    ? `import {SoundDesignTrack} from "../../remotion/runtime/sound-design";`
    : "";
  const soundRuntimeImport = sceneLocalSoundPresent
    ? ",\n  productionSoundDesignProjection"
    : "";
  const soundProp = sceneLocalSoundPresent
    ? `
    soundDesignTrack={<SoundDesignTrack projection={productionSoundDesignProjection} />}`
    : "";
  const requirementsSetup = `const productionRequirements = ProductionRequirementsFreezeSchema.parse(requirementsJson);
const readabilityPolicy = productionRequirements.readabilityPolicy;
`;
  const globalVisualImports = `${
    globalVisualComponentInterface !== "legacy-props"
      ? 'import type {GlobalVisualLayersComponent} from "../../remotion/runtime/global-visual";\n'
      : ""
  }import globalVisualPlanJson from "./global-visual-plan.json";
import globalVisualProjectionJson from "./generated/global-visual-projection.generated.json";
import {GlobalVisualLayers} from "./global-visual/GlobalVisualLayers";
`;
  const globalVisualSetup = `const globalVisualPlan = GlobalVisualPlanSchema.parse(globalVisualPlanJson);
const globalVisualProjection = GlobalVisualProjectionSchema.parse(globalVisualProjectionJson);
if (globalVisualProjection.schemaVersion !== 2 || globalVisualPlan.storyId !== storyId || globalVisualPlan.compositionId !== render.compositionId || globalVisualProjection.storyId !== storyId || globalVisualProjection.compositionId !== render.compositionId || globalVisualProjection.durationInFrames !== timing.durationInFrames || renderPlan.globalVisual.planFingerprint !== globalVisualPlan.planFingerprint || renderPlan.globalVisual.projectionFingerprint !== globalVisualProjection.projectionFingerprint) {
  throw new Error("Production GlobalVisual runtime identity is stale.");
}
${
  globalVisualComponentInterface === "current-no-props"
    ? "const ProductionGlobalVisualLayers: GlobalVisualLayersComponent<typeof GlobalVisualLayers> = GlobalVisualLayers;\n"
    : globalVisualComponentInterface === "legacy-no-props"
      ? "const ProductionGlobalVisualLayers: GlobalVisualLayersComponent = GlobalVisualLayers;\n"
      : ""
}`;
  const globalVisualProp =
    globalVisualComponentInterface !== "legacy-props"
      ? `
    globalVisualBackgroundLayers={<ProductionGlobalVisualLayers />}`
      : `
    globalVisualBackgroundLayers={<GlobalVisualLayers plan={globalVisualPlan} projection={globalVisualProjection} />}`;
  const masteredNarrationContractImport = masteredNarration
    ? "  MasteredNarrationManifestSchema,\n"
    : "";
  const masteredNarrationJsonImport = masteredNarration
    ? 'import masteredNarrationJson from "./generated/mastered-narration.generated.json";\n'
    : "";
  const masteredNarrationSetup = masteredNarration
    ? "const masteredNarration = MasteredNarrationManifestSchema.parse(masteredNarrationJson);\n"
    : "";
  const narrationIdentityCheck = masteredNarration
    ? `if (masteredNarration.storyId !== storyId || masteredNarration.sealedNarrationFingerprint !== artifactBundle.sealedNarration.sealedNarrationFingerprint || masteredNarration.masteredNarrationFingerprint !== renderPlan.masteredNarrationFingerprint || masteredNarration.sourceAudio.checksum !== artifactBundle.sealedNarration.completeAudio.checksum || masteredNarration.outputAudio.sampleFrameCount !== artifactBundle.sealedNarration.completeAudio.sampleFrameCount) {
  throw new Error("Production mastered narration identity is stale.");
}
`
    : "";
  const completeAudioExpression = masteredNarration
    ? "masteredNarration.outputAudio.localPath"
    : "artifactBundle.sealedNarration.completeAudio.localPath";
  const completeAudioPrefix = masteredNarration
    ? '"public/projects/" + storyId + "/narration-mastered/"'
    : '"public/projects/" + storyId + "/narration/"';
  const completeAudioPathError = masteredNarration
    ? "Complete narration must stay under the Story mastered narration path."
    : "Complete narration must stay under the Story narration path.";
  return `// ${PRODUCTION_RENDER_SCAFFOLD_MARKER}
import type {FC} from "react";
import {staticFile} from "remotion";

import {
  computeVideoSourceReferencesFingerprint,
  GlobalVisualPlanSchema,
  GlobalVisualProjectionSchema,
  getStoryCompositionDurationInFrames,
${masteredNarrationContractImport}  parseNarrativeProjectSource,
  ProductionRenderPlanSchema,
  ProductionRequirementsFreezeSchema,
  SealedNarrationManifestSchema,
  SemanticTimingSchema,
  StoryCompositionPropsSchema,
  STORY_COMPOSITION_TIMELINE_VERSION,
  validateM1ArtifactBundle,
  type StoryCompositionProps,
} from "../../contracts";
import {CompositionAssembly} from "../../remotion/runtime/composition-assembly";
import {NarrativeCore, type NarrativeCoreProps} from "../../remotion/runtime/narrative-core";
${soundImport}
import {StoryVisualTrack} from "../../remotion/runtime/story-visual";
import briefJson from "./brief.json";
${masteredNarrationJsonImport}import renderPlanJson from "./generated/production-render-plan.generated.json";
import sealedNarrationJson from "./generated/sealed-narration.generated.json";
import semanticTimingJson from "./generated/semantic-timing.generated.json";
import narrationJson from "./narration.json";
import renderJson from "./render.json";
import requirementsJson from "./production/requirements.json";
import storyJson from "./story.json";
${globalVisualImports}
import {
  productionRendererPropsByMeaning,
  productionRendererRegistry${soundRuntimeImport},
  productionStoryVisualProjection,
} from "./production-scene-runtime.generated";

${requirementsSetup}const projectSource = parseNarrativeProjectSource({brief: briefJson, story: storyJson, narration: narrationJson, render: renderJson});
const sealedNarration = SealedNarrationManifestSchema.parse(sealedNarrationJson);
${masteredNarrationSetup}const semanticTiming = SemanticTimingSchema.parse(semanticTimingJson);
const renderPlan = ProductionRenderPlanSchema.parse(renderPlanJson);
const artifactBundle = validateM1ArtifactBundle({projectSource, sealedNarration, semanticTiming});
const expectedStoryId = ${JSON.stringify(storyId)};
const storyId = artifactBundle.projectSource.story.storyId;
const render = artifactBundle.projectSource.render;
const timing = artifactBundle.semanticTiming;
if (readabilityPolicy.width !== render.width || readabilityPolicy.height !== render.height || storyId !== expectedStoryId || renderPlan.storyId !== storyId || render.fps !== timing.fps || renderPlan.timelinePolicyVersion !== STORY_COMPOSITION_TIMELINE_VERSION || renderPlan.sourceReferencesFingerprint !== computeVideoSourceReferencesFingerprint(projectSource.brief.sourceReferences) || renderPlan.semanticTimingFrameCount !== timing.durationInFrames || renderPlan.frameCount !== getStoryCompositionDurationInFrames(timing.durationInFrames)) {
  throw new Error("Production render Composition identity is stale.");
}
${globalVisualSetup}${narrationIdentityCheck}const completeAudioLocalPath = ${completeAudioExpression};
if (!completeAudioLocalPath.startsWith(${completeAudioPrefix})) throw new Error(${JSON.stringify(completeAudioPathError)});
const completeNarrationSrc = staticFile(completeAudioLocalPath.slice("public/".length));
export const productionNarrativeCompositionMetadata = {
  id: render.compositionId,
  fps: render.fps,
  width: render.width,
  height: render.height,
  durationInFrames: getStoryCompositionDurationInFrames(timing.durationInFrames),
  defaultProps: {projectId: storyId},
} as const;
export const createProductionNarrativeCoreProps = (input: unknown): NarrativeCoreProps => {
  const props = StoryCompositionPropsSchema.parse(input);
  if (props.projectId !== storyId) throw new Error("Production Composition only accepts its own projectId.");
  return {src: completeNarrationSrc, narrationStartFrame: timing.narrationStartFrame, captionCues: timing.captionCues, safeAreaPx: readabilityPolicy.captionSafeAreaPx, readabilityPolicy};
};

const ${componentName}: FC<StoryCompositionProps> = (props) => (
  <CompositionAssembly
    storyVisualTrack={<StoryVisualTrack projection={productionStoryVisualProjection} registry={productionRendererRegistry} rendererPropsByMeaning={productionRendererPropsByMeaning} />}${globalVisualProp}
    narrativeCore={<NarrativeCore {...createProductionNarrativeCoreProps(props)} />}${soundProp}
  />
);
export default ${componentName};
`;
};

export const renderProductionRenderProjectScaffold = (input: {
  readonly storyId: string;
  readonly sceneLocalSoundPresent: boolean;
}) =>
  renderProductionRenderProjectScaffoldVariant({
    ...input,
    globalVisualComponentInterface: "current-no-props",
    masteredNarration: true,
  });

const renderPreMasteringProductionRenderProjectScaffold = (input: {
  readonly storyId: string;
  readonly sceneLocalSoundPresent: boolean;
}) =>
  renderProductionRenderProjectScaffoldVariant({
    ...input,
    globalVisualComponentInterface: "current-no-props",
    masteredNarration: false,
  });

const renderLegacyPropsProductionRenderProjectScaffold = (input: {
  readonly storyId: string;
  readonly sceneLocalSoundPresent: boolean;
}) =>
  renderProductionRenderProjectScaffoldVariant({
    ...input,
    globalVisualComponentInterface: "legacy-props",
    masteredNarration: true,
  });

const renderLegacyNoPropsProductionRenderProjectScaffold = (input: {
  readonly storyId: string;
  readonly sceneLocalSoundPresent: boolean;
}) =>
  renderProductionRenderProjectScaffoldVariant({
    ...input,
    globalVisualComponentInterface: "legacy-no-props",
    masteredNarration: true,
  });

const renderPreMasteringLegacyPropsProductionRenderProjectScaffold = (input: {
  readonly storyId: string;
  readonly sceneLocalSoundPresent: boolean;
}) =>
  renderProductionRenderProjectScaffoldVariant({
    ...input,
    globalVisualComponentInterface: "legacy-props",
    masteredNarration: false,
  });

const renderPreMasteringLegacyNoPropsProductionRenderProjectScaffold = (input: {
  readonly storyId: string;
  readonly sceneLocalSoundPresent: boolean;
}) =>
  renderProductionRenderProjectScaffoldVariant({
    ...input,
    globalVisualComponentInterface: "legacy-no-props",
    masteredNarration: false,
  });

export const ensureProductionRenderScaffold = async ({
  rootDir,
  storyId,
  meaningIds,
  sceneLocalSoundPresent,
  mode,
}: {
  readonly rootDir: string;
  readonly storyId: string;
  readonly meaningIds: readonly string[];
  readonly sceneLocalSoundPresent: boolean;
  readonly mode: "write" | "check";
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
  });
  await writeOrCheckRendererRegistry({
    destination: runtimeDestination,
    source: runtimeSource,
    mode,
  });
  const destination = join(projectRoot, "Composition.tsx");
  const expected = renderProductionRenderProjectScaffold({
    storyId,
    sceneLocalSoundPresent,
  });
  if (mode === "check") {
    if ((await readFile(destination, "utf8")) !== expected) {
      throw new Error("Production render Composition bytes are stale.");
    }
    return { destination, runtimeDestination, source: expected } as const;
  }
  const current = await readFile(destination, "utf8");
  const narrativeScaffold = renderProductionProjectScaffold(storyId);
  const legacyRenderScaffold = renderLegacyPropsProductionRenderProjectScaffold(
    {
      storyId,
      sceneLocalSoundPresent,
    },
  );
  const legacyNoPropsRenderScaffold =
    renderLegacyNoPropsProductionRenderProjectScaffold({
      storyId,
      sceneLocalSoundPresent,
    });
  const preMasteringRenderScaffold =
    renderPreMasteringProductionRenderProjectScaffold({
      storyId,
      sceneLocalSoundPresent,
    });
  const preMasteringLegacyRenderScaffold =
    renderPreMasteringLegacyPropsProductionRenderProjectScaffold({
      storyId,
      sceneLocalSoundPresent,
    });
  const preMasteringLegacyNoPropsRenderScaffold =
    renderPreMasteringLegacyNoPropsProductionRenderProjectScaffold({
      storyId,
      sceneLocalSoundPresent,
    });
  if (
    current !== expected &&
    current !== narrativeScaffold &&
    current !== preMasteringRenderScaffold &&
    current !== preMasteringLegacyNoPropsRenderScaffold &&
    current !== preMasteringLegacyRenderScaffold &&
    current !== legacyNoPropsRenderScaffold &&
    current !== legacyRenderScaffold
  ) {
    throw new Error("Refusing to overwrite a drifted Production Composition.");
  }
  await writeProductionFileAtomic({
    destination,
    bytes: expected,
    mode: "replace",
  });
  return { destination, runtimeDestination, source: expected } as const;
};

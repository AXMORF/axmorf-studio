import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";

import { StoryIdSchema } from "../../../src/contracts";
import { writeProductionFileAtomic } from "../adapters/run-store";
import { writeOrCheckRendererRegistry } from "../../renderer-registry/project-files";

export const PRODUCTION_PROJECT_SCAFFOLD_MARKER =
  "@generated-by production-project-scaffold-v1" as const;
export const PRODUCTION_PREVIEW_SCAFFOLD_MARKER =
  "@generated-by production-preview-scaffold-v1" as const;
export const PRODUCTION_READABILITY_SCAFFOLD_MARKER =
  "@generated-by production-readability-scaffold-v2" as const;
export const PRODUCTION_GLOBAL_VISUAL_SCAFFOLD_MARKER =
  "@generated-by production-global-visual-scaffold-v4" as const;

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

const renderProductionProjectScaffoldTemplate = ({
  rawStoryId,
  readabilityPolicyAware,
}: {
  readonly rawStoryId: string;
  readonly readabilityPolicyAware: boolean;
}) => {
  const storyId = StoryIdSchema.parse(rawStoryId);
  const componentName = componentNameFor(storyId);
  const marker = readabilityPolicyAware
    ? PRODUCTION_READABILITY_SCAFFOLD_MARKER
    : PRODUCTION_PROJECT_SCAFFOLD_MARKER;
  const readabilityContractImport = readabilityPolicyAware
    ? "  ProductionRequirementsFreezeSchema,\n"
    : "";
  const requirementsImport = readabilityPolicyAware
    ? 'import requirementsJson from "./production/requirements.json";\n'
    : "";
  const requirementsSetup = readabilityPolicyAware
    ? 'const productionRequirements = ProductionRequirementsFreezeSchema.parse(requirementsJson);\nif (productionRequirements.schemaVersion === 1) throw new Error("Production Composition requires readability-aware requirements.");\nconst readabilityPolicy = productionRequirements.readabilityPolicy;\n'
    : "";
  const readabilityIdentityCheck = readabilityPolicyAware
    ? 'if (readabilityPolicy.width !== render.width || readabilityPolicy.height !== render.height) {\n  throw new Error("Production readability policy dimensions are stale.");\n}\n'
    : "";
  const narrativeReadabilityProps = readabilityPolicyAware
    ? "    safeAreaPx: readabilityPolicy.captionSafeAreaPx,\n    readabilityPolicy,\n"
    : "    safeAreaPx: render.captionSafeAreaPx,\n";
  return `// ${marker}
import type {FC} from "react";
import {staticFile} from "remotion";

import {
  parseNarrativeProjectSource,
${readabilityContractImport}  SealedNarrationManifestSchema,
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
import sealedNarrationJson from "./generated/sealed-narration.generated.json";
import semanticTimingJson from "./generated/semantic-timing.generated.json";
import narrationJson from "./narration.json";
import renderJson from "./render.json";
${requirementsImport}import storyJson from "./story.json";

${requirementsSetup}const projectSource = parseNarrativeProjectSource({
  brief: briefJson,
  story: storyJson,
  narration: narrationJson,
  render: renderJson,
});
const sealedNarration =
  SealedNarrationManifestSchema.parse(sealedNarrationJson);
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
${readabilityIdentityCheck}if (render.fps !== timing.fps) {
  throw new Error("Production Composition render and timing fps differ.");
}

const completeAudioLocalPath =
  artifactBundle.sealedNarration.completeAudio.localPath;
const expectedAudioPrefix = \`public/projects/\${storyId}/narration/\`;
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
    leadInFrames: render.leadInFrames,
    captionCues: timing.captionCues,
${narrativeReadabilityProps}  };
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

export const renderProductionProjectScaffold = (storyId: string) =>
  renderProductionProjectScaffoldTemplate({
    rawStoryId: storyId,
    readabilityPolicyAware: false,
  });

export const renderReadabilityAwareProductionProjectScaffold = (
  storyId: string,
) =>
  renderProductionProjectScaffoldTemplate({
    rawStoryId: storyId,
    readabilityPolicyAware: true,
  });

export const ensureProductionProjectScaffold = async ({
  rootDir,
  storyId: rawStoryId,
  mode,
  readabilityPolicyAware = false,
}: {
  readonly rootDir: string;
  readonly storyId: string;
  readonly mode: "write" | "check";
  readonly readabilityPolicyAware?: boolean;
}) => {
  const storyId = StoryIdSchema.parse(rawStoryId);
  const destination = join(rootDir, "src/projects", storyId, "Composition.tsx");
  const expected = readabilityPolicyAware
    ? renderReadabilityAwareProductionProjectScaffold(storyId)
    : renderProductionProjectScaffold(storyId);
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
  const isExactPreviewScaffold = [false, true].some((sceneLocalSoundPresent) =>
    [
      renderProductionPreviewProjectScaffold({
        storyId,
        sceneLocalSoundPresent,
      }),
      renderReadabilityAwareProductionPreviewProjectScaffold({
        storyId,
        sceneLocalSoundPresent,
      }),
      renderV3ProductionPreviewProjectScaffold({
        storyId,
        sceneLocalSoundPresent,
      }),
      renderV4ProductionPreviewProjectScaffold({
        storyId,
        sceneLocalSoundPresent,
      }),
    ].includes(actual ?? ""),
  );
  if (isExactPreviewScaffold && mode === "write") {
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
  readabilityPolicyAware,
}: {
  readonly storyId: string;
  readonly meaningIds: readonly string[];
  readonly readabilityPolicyAware: boolean;
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
  const marker = readabilityPolicyAware
    ? PRODUCTION_READABILITY_SCAFFOLD_MARKER
    : PRODUCTION_PREVIEW_SCAFFOLD_MARKER;
  const taskReadabilityGuard = readabilityPolicyAware
    ? '    if (task.schemaVersion === 1) throw new Error("Production Scene runtime requires readability-aware task input.");\n'
    : "";
  const rendererReadabilityProps = readabilityPolicyAware
    ? "    readabilityPolicy: task.readabilityPolicy,\n    ...(task.schemaVersion === 3 ? {sceneBoundaryVersion: task.sceneCompositionBoundaryVersion} : {}),\n"
    : "";
  return `// ${marker}
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
    const task = scene.task;
${taskReadabilityGuard}    return [task.meaningId, {
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
${rendererReadabilityProps}    visualResources: scene.resources.filter(({selected}) => selected.role === "scene-visual").map(({selected, descriptor}) => {
      if (descriptor.kind !== "asset" || !descriptor.localPath.startsWith("public/")) throw new Error("Production Scene visual resource is not local.");
      return {resourceId: selected.resourceId, src: staticFile(descriptor.localPath.slice("public/".length)), descriptorFingerprint: selected.descriptorFingerprint};
    }),
  }];
  }),
);
export {currentRegistry as productionRendererRegistry};
`;
};

export const renderProductionSceneRuntime = (input: {
  readonly storyId: string;
  readonly meaningIds: readonly string[];
}) =>
  renderProductionSceneRuntimeTemplate({
    ...input,
    readabilityPolicyAware: false,
  });

export const renderReadabilityAwareProductionSceneRuntime = (input: {
  readonly storyId: string;
  readonly meaningIds: readonly string[];
}) =>
  renderProductionSceneRuntimeTemplate({
    ...input,
    readabilityPolicyAware: true,
  });

const renderProductionPreviewProjectScaffoldTemplate = ({
  storyId: rawStoryId,
  sceneLocalSoundPresent,
  requirementsSchemaVersion,
}: {
  readonly storyId: string;
  readonly sceneLocalSoundPresent: boolean;
  readonly requirementsSchemaVersion: 2 | 3 | 4 | null;
}) => {
  const storyId = StoryIdSchema.parse(rawStoryId);
  const componentName = componentNameFor(storyId);
  const readabilityPolicyAware = requirementsSchemaVersion !== null;
  const globalVisualAware = requirementsSchemaVersion === 4;
  const marker = globalVisualAware
    ? PRODUCTION_GLOBAL_VISUAL_SCAFFOLD_MARKER
    : readabilityPolicyAware
      ? PRODUCTION_READABILITY_SCAFFOLD_MARKER
      : PRODUCTION_PREVIEW_SCAFFOLD_MARKER;
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
  const requirementsContractImport = readabilityPolicyAware
    ? "  ProductionRequirementsFreezeSchema,\n"
    : "";
  const globalVisualContractImports = globalVisualAware
    ? "  GlobalVisualPlanSchema,\n  GlobalVisualProjectionSchema,\n"
    : "";
  const requirementsImport = readabilityPolicyAware
    ? 'import requirementsJson from "./production/requirements.json";\n'
    : "";
  const requirementsSetup = readabilityPolicyAware
    ? `const productionRequirements = ProductionRequirementsFreezeSchema.parse(requirementsJson);
if (productionRequirements.schemaVersion !== ${requirementsSchemaVersion}) throw new Error(${JSON.stringify(
        requirementsSchemaVersion === 4
          ? "Production Preview requires v4 GlobalVisual requirements."
          : requirementsSchemaVersion === 3
            ? "Production Preview requires v3 shared-boundary requirements."
            : "Production Preview requires readability-aware requirements.",
      )});
const readabilityPolicy = productionRequirements.readabilityPolicy;
`
    : "";
  const readabilityIdentityCondition = readabilityPolicyAware
    ? "readabilityPolicy.width !== render.width || readabilityPolicy.height !== render.height || "
    : "";
  const narrativeReadabilityProps = readabilityPolicyAware
    ? "safeAreaPx: readabilityPolicy.captionSafeAreaPx, readabilityPolicy"
    : "safeAreaPx: render.captionSafeAreaPx";
  const globalVisualImports = globalVisualAware
    ? `import globalVisualPlanJson from "./global-visual-plan.json";
import globalVisualProjectionJson from "./generated/global-visual-projection.generated.json";
import {GlobalVisualLayers} from "./global-visual/GlobalVisualLayers";
`
    : "";
  const globalVisualSetup = globalVisualAware
    ? `const globalVisualPlan = GlobalVisualPlanSchema.parse(globalVisualPlanJson);
const globalVisualProjection = GlobalVisualProjectionSchema.parse(globalVisualProjectionJson);
if (previewAssembly.schemaVersion !== 3 || globalVisualProjection.schemaVersion !== 2 || globalVisualPlan.storyId !== storyId || globalVisualPlan.compositionId !== render.compositionId || globalVisualProjection.storyId !== storyId || globalVisualProjection.compositionId !== render.compositionId || globalVisualProjection.durationInFrames !== timing.durationInFrames || previewAssembly.globalVisual.planFingerprint !== globalVisualPlan.planFingerprint || previewAssembly.globalVisual.projectionFingerprint !== globalVisualProjection.projectionFingerprint) {
  throw new Error("Production GlobalVisual runtime identity is stale.");
}
`
    : "";
  const globalVisualProp = globalVisualAware
    ? `
    globalVisualLayers={<GlobalVisualLayers plan={globalVisualPlan} projection={globalVisualProjection} />}`
    : "";
  return `// ${marker}
import type {FC} from "react";
import {staticFile} from "remotion";

import {
${globalVisualContractImports}
  parseNarrativeProjectSource,
${requirementsContractImport}  ProductionPreviewAssemblySchema,
  SealedNarrationManifestSchema,
  SemanticTimingSchema,
  StoryCompositionPropsSchema,
  validateM1ArtifactBundle,
  type StoryCompositionProps,
} from "../../contracts";
import {CompositionAssembly} from "../../remotion/runtime/composition-assembly";
import {NarrativeCore, type NarrativeCoreProps} from "../../remotion/runtime/narrative-core";
${soundImport}
import {StoryVisualTrack} from "../../remotion/runtime/story-visual";
import briefJson from "./brief.json";
import previewAssemblyJson from "./generated/production-preview-assembly.generated.json";
import sealedNarrationJson from "./generated/sealed-narration.generated.json";
import semanticTimingJson from "./generated/semantic-timing.generated.json";
import narrationJson from "./narration.json";
import renderJson from "./render.json";
${requirementsImport}import storyJson from "./story.json";
${globalVisualImports}
import {
  productionRendererPropsByMeaning,
  productionRendererRegistry${soundRuntimeImport},
  productionStoryVisualProjection,
} from "./production-scene-runtime.generated";

${requirementsSetup}const projectSource = parseNarrativeProjectSource({brief: briefJson, story: storyJson, narration: narrationJson, render: renderJson});
const sealedNarration = SealedNarrationManifestSchema.parse(sealedNarrationJson);
const semanticTiming = SemanticTimingSchema.parse(semanticTimingJson);
const previewAssembly = ProductionPreviewAssemblySchema.parse(previewAssemblyJson);
const artifactBundle = validateM1ArtifactBundle({projectSource, sealedNarration, semanticTiming});
const expectedStoryId = ${JSON.stringify(storyId)};
const storyId = artifactBundle.projectSource.story.storyId;
const render = artifactBundle.projectSource.render;
const timing = artifactBundle.semanticTiming;
if (${readabilityIdentityCondition}storyId !== expectedStoryId || previewAssembly.storyId !== storyId || render.fps !== timing.fps || previewAssembly.sceneLocalSound.selection !== ${JSON.stringify(sceneLocalSoundPresent ? "present" : "none")}) {
  throw new Error("Production Preview Composition identity is stale.");
}
${globalVisualSetup}const completeAudioLocalPath = artifactBundle.sealedNarration.completeAudio.localPath;
if (!completeAudioLocalPath.startsWith("public/projects/" + storyId + "/narration/")) throw new Error("Complete narration must stay under the Story narration path.");
const completeNarrationSrc = staticFile(completeAudioLocalPath.slice("public/".length));
export const productionNarrativeCompositionMetadata = {
  id: render.compositionId,
  fps: render.fps,
  width: render.width,
  height: render.height,
  durationInFrames: timing.durationInFrames,
  defaultProps: {projectId: storyId},
} as const;
export const createProductionNarrativeCoreProps = (input: unknown): NarrativeCoreProps => {
  const props = StoryCompositionPropsSchema.parse(input);
  if (props.projectId !== storyId) throw new Error("Production Composition only accepts its own projectId.");
  return {src: completeNarrationSrc, leadInFrames: render.leadInFrames, captionCues: timing.captionCues, ${narrativeReadabilityProps}};
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

export const renderProductionPreviewProjectScaffold = (input: {
  readonly storyId: string;
  readonly sceneLocalSoundPresent: boolean;
}) =>
  renderProductionPreviewProjectScaffoldTemplate({
    ...input,
    requirementsSchemaVersion: null,
  });

export const renderReadabilityAwareProductionPreviewProjectScaffold = (input: {
  readonly storyId: string;
  readonly sceneLocalSoundPresent: boolean;
}) =>
  renderProductionPreviewProjectScaffoldTemplate({
    ...input,
    requirementsSchemaVersion: 2,
  });

export const renderV3ProductionPreviewProjectScaffold = (input: {
  readonly storyId: string;
  readonly sceneLocalSoundPresent: boolean;
}) =>
  renderProductionPreviewProjectScaffoldTemplate({
    ...input,
    requirementsSchemaVersion: 3,
  });

export const renderV4ProductionPreviewProjectScaffold = (input: {
  readonly storyId: string;
  readonly sceneLocalSoundPresent: boolean;
}) =>
  renderProductionPreviewProjectScaffoldTemplate({
    ...input,
    requirementsSchemaVersion: 4,
  });

export const ensureProductionPreviewScaffold = async ({
  rootDir,
  storyId,
  meaningIds,
  sceneLocalSoundPresent,
  mode,
  readabilityPolicyAware = false,
  sceneCompositionBoundaryAware = false,
  globalVisualAware = false,
}: {
  readonly rootDir: string;
  readonly storyId: string;
  readonly meaningIds: readonly string[];
  readonly sceneLocalSoundPresent: boolean;
  readonly mode: "write" | "check";
  readonly readabilityPolicyAware?: boolean;
  readonly sceneCompositionBoundaryAware?: boolean;
  readonly globalVisualAware?: boolean;
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
  const runtimeSource =
    readabilityPolicyAware || sceneCompositionBoundaryAware
      ? renderReadabilityAwareProductionSceneRuntime({ storyId, meaningIds })
      : renderProductionSceneRuntime({ storyId, meaningIds });
  await writeOrCheckRendererRegistry({
    destination: runtimeDestination,
    source: runtimeSource,
    mode,
  });
  const destination = join(projectRoot, "Composition.tsx");
  const expected = globalVisualAware
    ? renderV4ProductionPreviewProjectScaffold({
        storyId,
        sceneLocalSoundPresent,
      })
    : sceneCompositionBoundaryAware
      ? renderV3ProductionPreviewProjectScaffold({
          storyId,
          sceneLocalSoundPresent,
        })
      : readabilityPolicyAware
        ? renderReadabilityAwareProductionPreviewProjectScaffold({
            storyId,
            sceneLocalSoundPresent,
          })
        : renderProductionPreviewProjectScaffold({
            storyId,
            sceneLocalSoundPresent,
          });
  if (mode === "check") {
    if ((await readFile(destination, "utf8")) !== expected) {
      throw new Error("Production Preview Composition bytes are stale.");
    }
    return { destination, runtimeDestination, source: expected } as const;
  }
  const current = await readFile(destination, "utf8");
  const narrativeScaffold =
    readabilityPolicyAware || sceneCompositionBoundaryAware
      ? renderReadabilityAwareProductionProjectScaffold(storyId)
      : renderProductionProjectScaffold(storyId);
  if (current !== expected && current !== narrativeScaffold) {
    throw new Error("Refusing to overwrite a drifted Production Composition.");
  }
  await writeProductionFileAtomic({
    destination,
    bytes: expected,
    mode: "replace",
  });
  return { destination, runtimeDestination, source: expected } as const;
};

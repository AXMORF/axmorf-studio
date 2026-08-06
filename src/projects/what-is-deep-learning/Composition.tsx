// @generated-by production-readability-scaffold-v2
import type {FC} from "react";
import {staticFile} from "remotion";

import {
  parseNarrativeProjectSource,
  ProductionRequirementsFreezeSchema,
  ProductionPreviewAssemblySchema,
  SealedNarrationManifestSchema,
  SemanticTimingSchema,
  StoryCompositionPropsSchema,
  validateM1ArtifactBundle,
  type StoryCompositionProps,
} from "../../contracts";
import {CompositionAssembly} from "../../remotion/runtime/composition-assembly";
import {NarrativeCore, type NarrativeCoreProps} from "../../remotion/runtime/narrative-core";

import {StoryVisualTrack} from "../../remotion/runtime/story-visual";
import briefJson from "./brief.json";
import previewAssemblyJson from "./generated/production-preview-assembly.generated.json";
import sealedNarrationJson from "./generated/sealed-narration.generated.json";
import semanticTimingJson from "./generated/semantic-timing.generated.json";
import narrationJson from "./narration.json";
import renderJson from "./render.json";
import requirementsJson from "./production/requirements.json";
import storyJson from "./story.json";
import {
  productionRendererPropsByMeaning,
  productionRendererRegistry,
  productionStoryVisualProjection,
} from "./production-scene-runtime.generated";

const productionRequirements = ProductionRequirementsFreezeSchema.parse(requirementsJson);
if (productionRequirements.schemaVersion !== 3) throw new Error("Production Preview requires v3 shared-boundary requirements.");
const readabilityPolicy = productionRequirements.readabilityPolicy;
const projectSource = parseNarrativeProjectSource({brief: briefJson, story: storyJson, narration: narrationJson, render: renderJson});
const sealedNarration = SealedNarrationManifestSchema.parse(sealedNarrationJson);
const semanticTiming = SemanticTimingSchema.parse(semanticTimingJson);
const previewAssembly = ProductionPreviewAssemblySchema.parse(previewAssemblyJson);
const artifactBundle = validateM1ArtifactBundle({projectSource, sealedNarration, semanticTiming});
const expectedStoryId = "what-is-deep-learning";
const storyId = artifactBundle.projectSource.story.storyId;
const render = artifactBundle.projectSource.render;
const timing = artifactBundle.semanticTiming;
if (readabilityPolicy.width !== render.width || readabilityPolicy.height !== render.height || storyId !== expectedStoryId || previewAssembly.storyId !== storyId || render.fps !== timing.fps || previewAssembly.sceneLocalSound.selection !== "none") {
  throw new Error("Production Preview Composition identity is stale.");
}
const completeAudioLocalPath = artifactBundle.sealedNarration.completeAudio.localPath;
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
  return {src: completeNarrationSrc, leadInFrames: render.leadInFrames, captionCues: timing.captionCues, safeAreaPx: readabilityPolicy.captionSafeAreaPx, readabilityPolicy};
};

const WhatIsDeepLearningComposition: FC<StoryCompositionProps> = (props) => (
  <CompositionAssembly
    storyVisualTrack={<StoryVisualTrack projection={productionStoryVisualProjection} registry={productionRendererRegistry} rendererPropsByMeaning={productionRendererPropsByMeaning} />}
    narrativeCore={<NarrativeCore {...createProductionNarrativeCoreProps(props)} />}
  />
);
export default WhatIsDeepLearningComposition;

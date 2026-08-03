import type { FC } from "react";
import { staticFile } from "remotion";

import {
  parseNarrativeProjectSource,
  SealedNarrationManifestSchema,
  SemanticTimingSchema,
  StoryCompositionPropsSchema,
  validateM1ArtifactBundle,
  type StoryCompositionProps,
} from "../../contracts";
import {
  NarrativeCore,
  type NarrativeCoreProps,
} from "../../remotion/runtime/narrative-core";
import briefJson from "./brief.json";
import sealedNarrationJson from "./generated/sealed-narration.generated.json";
import semanticTimingJson from "./generated/semantic-timing.generated.json";
import narrationJson from "./narration.json";
import renderJson from "./render.json";
import storyJson from "./story.json";

const projectSource = parseNarrativeProjectSource({
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

const storyId = artifactBundle.projectSource.story.storyId;
const render = artifactBundle.projectSource.render;
const timing = artifactBundle.semanticTiming;
if (storyId !== "product-comic-vertical") {
  throw new Error("Product comic Story ID is stale.");
}
if (render.compositionId !== "ProductComicVertical") {
  throw new Error("Product comic Composition ID is stale.");
}
if (render.fps !== timing.fps) {
  throw new Error("Product comic render and timing fps differ.");
}

const completeAudioLocalPath =
  artifactBundle.sealedNarration.completeAudio.localPath;
const expectedAudioPrefix = `public/projects/${storyId}/narration/`;
if (!completeAudioLocalPath.startsWith(expectedAudioPrefix)) {
  throw new Error("Complete narration must stay under the Story narration path.");
}
const completeNarrationSrc = staticFile(
  completeAudioLocalPath.slice("public/".length),
);

export const productComicVerticalCompositionMetadata = {
  id: render.compositionId,
  fps: render.fps,
  width: render.width,
  height: render.height,
  durationInFrames: timing.durationInFrames,
  defaultProps: { projectId: storyId },
} as const;

export const createProductComicVerticalNarrativeCoreProps = (
  input: unknown,
): NarrativeCoreProps => {
  const props = StoryCompositionPropsSchema.parse(input);
  if (props.projectId !== storyId) {
    throw new Error("ProductComicVertical only accepts its own projectId.");
  }
  return {
    src: completeNarrationSrc,
    leadInFrames: render.leadInFrames,
    captionCues: timing.captionCues,
    safeAreaPx: render.captionSafeAreaPx,
  };
};

const ProductComicVerticalComposition: FC<StoryCompositionProps> = (props) => (
  <NarrativeCore {...createProductComicVerticalNarrativeCoreProps(props)} />
);

export default ProductComicVerticalComposition;

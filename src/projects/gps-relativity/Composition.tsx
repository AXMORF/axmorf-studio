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
import { CompositionAssembly } from "../../remotion/runtime/composition-assembly";
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
const sealedNarration = SealedNarrationManifestSchema.parse(
  sealedNarrationJson,
);
const semanticTiming = SemanticTimingSchema.parse(semanticTimingJson);
const artifactBundle = validateM1ArtifactBundle({
  projectSource,
  sealedNarration,
  semanticTiming,
});

const storyId = artifactBundle.projectSource.story.storyId;
const render = artifactBundle.projectSource.render;
const timing = artifactBundle.semanticTiming;
if (storyId !== "gps-relativity") {
  throw new Error("GPS Relativity Story ID is stale.");
}
if (render.compositionId !== "GpsRelativity") {
  throw new Error("GPS Relativity Composition ID is stale.");
}
if (render.fps !== timing.fps) {
  throw new Error("GPS Relativity render and timing fps differ.");
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

export const gpsRelativityCompositionMetadata = {
  id: render.compositionId,
  fps: render.fps,
  width: render.width,
  height: render.height,
  durationInFrames: timing.durationInFrames,
  defaultProps: { projectId: storyId },
} as const;

export const createGpsRelativityNarrativeCoreProps = (
  input: unknown,
): NarrativeCoreProps => {
  const props = StoryCompositionPropsSchema.parse(input);
  if (props.projectId !== storyId) {
    throw new Error("GpsRelativity only accepts its own projectId.");
  }
  return {
    src: completeNarrationSrc,
    leadInFrames: render.leadInFrames,
    captionCues: timing.captionCues,
    safeAreaPx: render.captionSafeAreaPx,
  };
};

const GpsRelativityComposition: FC<StoryCompositionProps> = (props) => (
  <CompositionAssembly
    narrativeCore={
      <NarrativeCore {...createGpsRelativityNarrativeCoreProps(props)} />
    }
  />
);

export default GpsRelativityComposition;

import {
  CaptionLayer,
  type CaptionLayerProps,
} from "../../runtime/narrative-core";
import { CompositionAssembly } from "../../runtime/composition-assembly";
import { SoundDesignTrack } from "../../runtime/sound-design";
import { StoryVisualTrack } from "../../runtime/story-visual";
import {
  m6ProofRendererPropsByMeaning,
  m6ProofRendererRegistry,
  m6ProofSoundDesignProjection,
  m6ProofStoryVisualProjection,
} from "./proof-data";

export const m6SceneRuntimeProofMetadata = {
  id: "M6SceneRuntimeProof",
  durationInFrames: 120,
  fps: 30,
  width: 1920,
  height: 1080,
} as const;

const proofCaptionCues = [
  {
    chunkId: "m6-proof-chunk",
    meaningId: "m6-scene-proof",
    text: "Synthetic M6 proof · visual and Scene-local sound",
    startFrame: 0,
    endFrame: 120,
  },
] as unknown as CaptionLayerProps["captionCues"];

const M6SceneRuntimeProof = () => (
  <CompositionAssembly
    storyVisualTrack={
      <StoryVisualTrack
        projection={m6ProofStoryVisualProjection}
        registry={m6ProofRendererRegistry}
        rendererPropsByMeaning={m6ProofRendererPropsByMeaning}
      />
    }
    narrativeCore={
      <CaptionLayer
        captionCues={proofCaptionCues}
        safeAreaPx={{ top: 56, right: 96, bottom: 72, left: 96 }}
      />
    }
    soundDesignTrack={
      <SoundDesignTrack projection={m6ProofSoundDesignProjection} />
    }
  />
);

export default M6SceneRuntimeProof;

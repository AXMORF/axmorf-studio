import { AbsoluteFill } from "remotion";

import {
  CaptionLayer,
  type CaptionLayerProps,
} from "../../../src/remotion/runtime/narrative-core";
import { CompositionAssembly } from "../../../src/remotion/runtime/composition-assembly";
import { SoundDesignTrack } from "../../../src/remotion/runtime/sound-design";
import { StoryVisualTrack } from "../../../src/remotion/runtime/story-visual";
import { SCENE_RUNTIME_PROOF_IDENTITY } from "../identity";
import {
  sceneRuntimeProofRendererPropsByMeaning,
  sceneRuntimeProofRendererRegistry,
  sceneRuntimeProofSoundDesignProjection,
  sceneRuntimeProofStoryVisualProjection,
} from "./proof-data";

export const sceneRuntimeProofMetadata = {
  id: SCENE_RUNTIME_PROOF_IDENTITY.compositionId,
  durationInFrames: SCENE_RUNTIME_PROOF_IDENTITY.durationInFrames,
  fps: SCENE_RUNTIME_PROOF_IDENTITY.fps,
  width: SCENE_RUNTIME_PROOF_IDENTITY.width,
  height: SCENE_RUNTIME_PROOF_IDENTITY.height,
} as const;

const proofCaptionCues = [
  {
    chunkId: SCENE_RUNTIME_PROOF_IDENTITY.captionChunkId,
    meaningId: SCENE_RUNTIME_PROOF_IDENTITY.meaningId,
    text: "Synthetic Scene runtime proof · visual and Scene-local sound",
    startFrame: 0,
    endFrame: SCENE_RUNTIME_PROOF_IDENTITY.durationInFrames,
  },
] as unknown as CaptionLayerProps["captionCues"];

const SceneRuntimeProof = () => (
  <CompositionAssembly
    globalVisualBackgroundLayers={
      <AbsoluteFill style={{ backgroundColor: "#020617" }} />
    }
    storyVisualTrack={
      <StoryVisualTrack
        projection={sceneRuntimeProofStoryVisualProjection}
        registry={sceneRuntimeProofRendererRegistry}
        rendererPropsByMeaning={sceneRuntimeProofRendererPropsByMeaning}
      />
    }
    narrativeCore={
      <CaptionLayer
        captionCues={proofCaptionCues}
        safeAreaPx={{ top: 56, right: 96, bottom: 72, left: 96 }}
      />
    }
    soundDesignTrack={
      <SoundDesignTrack projection={sceneRuntimeProofSoundDesignProjection} />
    }
  />
);

export default SceneRuntimeProof;

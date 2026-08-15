import { Composition } from "remotion";

import SceneRuntimeProof, { sceneRuntimeProofMetadata } from "./Composition";

export const SceneRuntimeProofRoot = () => (
  <Composition
    id={sceneRuntimeProofMetadata.id}
    component={SceneRuntimeProof}
    durationInFrames={sceneRuntimeProofMetadata.durationInFrames}
    fps={sceneRuntimeProofMetadata.fps}
    width={sceneRuntimeProofMetadata.width}
    height={sceneRuntimeProofMetadata.height}
  />
);

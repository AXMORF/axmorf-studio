import { Composition } from "remotion";

import M6SceneRuntimeProof, {
  m6SceneRuntimeProofMetadata,
} from "./Composition";

export const M6SceneRuntimeProofRoot = () => (
  <Composition
    id={m6SceneRuntimeProofMetadata.id}
    component={M6SceneRuntimeProof}
    durationInFrames={m6SceneRuntimeProofMetadata.durationInFrames}
    fps={m6SceneRuntimeProofMetadata.fps}
    width={m6SceneRuntimeProofMetadata.width}
    height={m6SceneRuntimeProofMetadata.height}
  />
);

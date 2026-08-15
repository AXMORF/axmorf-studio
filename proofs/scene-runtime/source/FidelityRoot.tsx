import { Composition } from "remotion";

import { SCENE_RUNTIME_PROOF_IDENTITY } from "../identity";
import { SceneRuntimeFidelityAdaptation } from "./FidelityComposition";

export const SceneRuntimeFidelityRoot = () => (
  <Composition
    id={SCENE_RUNTIME_PROOF_IDENTITY.fidelityCompositionId}
    component={SceneRuntimeFidelityAdaptation}
    durationInFrames={SCENE_RUNTIME_PROOF_IDENTITY.durationInFrames}
    fps={SCENE_RUNTIME_PROOF_IDENTITY.fps}
    width={SCENE_RUNTIME_PROOF_IDENTITY.width}
    height={SCENE_RUNTIME_PROOF_IDENTITY.height}
  />
);

import { staticFile, useCurrentFrame } from "remotion";

import { SCENE_RUNTIME_PROOF_IDENTITY } from "../identity";
import Renderer from "../fixtures/scenes/runtime-proof-scene/Renderer";

export const SceneRuntimeFidelityAdaptation = () => {
  const sceneFrame = useCurrentFrame();
  return (
    <Renderer
      sceneFrame={sceneFrame}
      visualResources={[
        {
          src: staticFile(
            SCENE_RUNTIME_PROOF_IDENTITY.publicAssetPaths.shape.slice(
              "public/".length,
            ),
          ),
        },
      ]}
    />
  );
};

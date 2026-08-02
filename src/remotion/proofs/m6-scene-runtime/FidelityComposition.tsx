import { staticFile, useCurrentFrame } from "remotion";

import Renderer from "./scenes/m6-scene-proof/Renderer";

export const M6FidelityAdaptation = () => {
  const sceneFrame = useCurrentFrame();
  return (
    <Renderer
      sceneFrame={sceneFrame}
      visualResources={[
        {
          src: staticFile("assets/library/m6-scene-runtime/proof-shape.svg"),
        },
      ]}
    />
  );
};

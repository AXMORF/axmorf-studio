import { Composition } from "remotion";

import { M6FidelityAdaptation } from "./FidelityComposition";

export const M6FidelityRoot = () => (
  <Composition
    id="M6FidelityAdaptation"
    component={M6FidelityAdaptation}
    durationInFrames={120}
    fps={30}
    width={1920}
    height={1080}
  />
);

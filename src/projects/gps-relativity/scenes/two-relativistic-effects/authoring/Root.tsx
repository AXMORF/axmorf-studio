import type { FC } from "react";
import { Composition } from "remotion";

import { M7GpsTwoRelativisticEffectsAuthoringComposition } from "./Composition";

export const M7GpsTwoRelativisticEffectsAuthoringRoot: FC = () => (
  <Composition
    id="M7GpsTwoRelativisticEffectsAuthoring"
    component={M7GpsTwoRelativisticEffectsAuthoringComposition}
    durationInFrames={335}
    fps={30}
    width={1920}
    height={1080}
  />
);

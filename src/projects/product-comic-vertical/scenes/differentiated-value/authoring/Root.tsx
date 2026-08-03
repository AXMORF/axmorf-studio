import type {FC} from "react";
import {Composition} from "remotion";

import DifferentiatedValueAuthoringComposition from "./Composition";

export const DifferentiatedValueAuthoringRoot: FC = () => (
  <Composition
    id="ProductComicVertical-differentiated-value-Authoring"
    component={DifferentiatedValueAuthoringComposition}
    durationInFrames={561}
    fps={30}
    width={1080}
    height={1920}
  />
);

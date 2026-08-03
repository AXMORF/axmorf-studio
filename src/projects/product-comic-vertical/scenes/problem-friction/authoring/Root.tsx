import type {FC} from "react";
import {Composition} from "remotion";

import ProblemFrictionAuthoringComposition from "./Composition";

export const ProblemFrictionAuthoringRoot: FC = () => (
  <Composition
    id="ProductComicVertical-problem-friction-Authoring"
    component={ProblemFrictionAuthoringComposition}
    durationInFrames={503}
    fps={30}
    width={1080}
    height={1920}
  />
);

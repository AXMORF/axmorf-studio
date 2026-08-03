import type {FC} from "react";
import {Composition} from "remotion";

import ProblemHookAuthoringComposition from "./Composition";

export const ProblemHookAuthoringRoot: FC = () => (
  <Composition
    id="ProductComicVertical-problem-hook-Authoring"
    component={ProblemHookAuthoringComposition}
    durationInFrames={565}
    fps={30}
    width={1080}
    height={1920}
  />
);

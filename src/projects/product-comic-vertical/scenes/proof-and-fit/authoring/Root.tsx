import type {FC} from "react";
import {Composition} from "remotion";

import ProofAndFitAuthoringComposition from "./Composition";

export const ProofAndFitAuthoringRoot: FC = () => (
  <Composition
    id="ProductComicVertical-proof-and-fit-Authoring"
    component={ProofAndFitAuthoringComposition}
    durationInFrames={491}
    fps={30}
    width={1080}
    height={1920}
  />
);

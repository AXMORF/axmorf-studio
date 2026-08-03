import type {FC} from "react";
import {Composition} from "remotion";

import CoreCapabilitiesAuthoringComposition from "./Composition";

export const CoreCapabilitiesAuthoringRoot: FC = () => (
  <Composition
    id="ProductComicVertical-core-capabilities-Authoring"
    component={CoreCapabilitiesAuthoringComposition}
    durationInFrames={500}
    fps={30}
    width={1080}
    height={1920}
  />
);

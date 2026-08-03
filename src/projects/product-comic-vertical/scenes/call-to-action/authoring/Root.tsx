import type {FC} from "react";
import {Composition} from "remotion";

import CallToActionAuthoringComposition from "./Composition";

export const CallToActionAuthoringRoot: FC = () => (
  <Composition
    id="ProductComicVertical-call-to-action-Authoring"
    component={CallToActionAuthoringComposition}
    durationInFrames={398}
    fps={30}
    width={1080}
    height={1920}
  />
);

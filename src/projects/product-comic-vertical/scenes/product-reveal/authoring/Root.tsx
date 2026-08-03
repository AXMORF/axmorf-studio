import type {FC} from "react";
import {Composition} from "remotion";

import ProductRevealAuthoringComposition from "./Composition";

export const ProductRevealAuthoringRoot: FC = () => (
  <Composition
    id="ProductComicVertical-product-reveal-Authoring"
    component={ProductRevealAuthoringComposition}
    durationInFrames={233}
    fps={30}
    width={1080}
    height={1920}
  />
);

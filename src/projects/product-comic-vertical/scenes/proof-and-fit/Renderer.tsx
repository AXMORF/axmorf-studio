import type {FC} from "react";

import {ProofAndFitPanels} from "./shots/ProofAndFitPanels";

type ProofAndFitRendererProps = Readonly<{
  storyId: string;
  meaningId: string;
  sceneFrame: number;
  durationInFrames: number;
  width: number;
  height: number;
}>;

const Renderer: FC<ProofAndFitRendererProps> = ({
  storyId,
  meaningId,
  sceneFrame,
  durationInFrames,
  width,
  height,
}) => {
  if (
    storyId !== "product-comic-vertical" ||
    meaningId !== "proof-and-fit" ||
    durationInFrames !== 491 ||
    width !== 1080 ||
    height !== 1920
  ) {
    throw new Error("proof-and-fit Renderer received incompatible Scene props.");
  }
  return (
    <div style={{position: "absolute", inset: 0}} data-scene="proof-and-fit">
      <ProofAndFitPanels sceneFrame={sceneFrame} />
    </div>
  );
};

export default Renderer;

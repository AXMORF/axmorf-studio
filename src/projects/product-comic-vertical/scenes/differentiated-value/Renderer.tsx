import type {FC} from "react";

import {EvidenceBoundaryPanels} from "./shots/EvidenceBoundaryPanels";

type DifferentiatedValueRendererProps = Readonly<{
  storyId: string;
  meaningId: string;
  sceneFrame: number;
  durationInFrames: number;
  timingBeat: Readonly<{startFrame: number; endFrame: number}>;
}>;

const DifferentiatedValueRenderer: FC<
  DifferentiatedValueRendererProps
> = ({storyId, meaningId, sceneFrame, durationInFrames, timingBeat}) => {
  if (
    storyId !== "product-comic-vertical" ||
    meaningId !== "differentiated-value" ||
    timingBeat.startFrame !== 3651 ||
    timingBeat.endFrame !== 4212 ||
    durationInFrames !== 561
  ) {
    throw new Error(
      "differentiated-value Renderer received stale Scene identity.",
    );
  }
  return (
    <EvidenceBoundaryPanels
      sceneFrame={sceneFrame}
      durationInFrames={durationInFrames}
    />
  );
};

export default DifferentiatedValueRenderer;

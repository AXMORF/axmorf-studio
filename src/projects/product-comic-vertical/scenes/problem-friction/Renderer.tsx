import type {FC} from "react";

import {ProblemFrictionPanels} from "./shots/ProblemFrictionPanels";

type ProblemFrictionRendererProps = Readonly<{
  storyId: string;
  meaningId: string;
  sceneFrame: number;
  durationInFrames: number;
  timingBeat: Readonly<{startFrame: number; endFrame: number}>;
}>;

const ProblemFrictionRenderer: FC<ProblemFrictionRendererProps> = ({
  storyId,
  meaningId,
  sceneFrame,
  durationInFrames,
  timingBeat,
}) => {
  if (
    storyId !== "product-comic-vertical" ||
    meaningId !== "problem-friction" ||
    timingBeat.startFrame !== 580 ||
    timingBeat.endFrame !== 1083 ||
    durationInFrames !== 503
  ) {
    throw new Error("problem-friction Renderer received stale Scene identity.");
  }
  return (
    <ProblemFrictionPanels
      sceneFrame={sceneFrame}
      durationInFrames={durationInFrames}
    />
  );
};

export default ProblemFrictionRenderer;

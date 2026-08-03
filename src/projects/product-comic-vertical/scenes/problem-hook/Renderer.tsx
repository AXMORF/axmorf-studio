import type {FC} from "react";

import {ProblemHookPanels} from "./shots/ProblemHookPanels";

type ProblemHookRendererProps = Readonly<{
  storyId: string;
  meaningId: string;
  sceneFrame: number;
  durationInFrames: number;
  timingBeat: Readonly<{startFrame: number; endFrame: number}>;
}>;

const ProblemHookRenderer: FC<ProblemHookRendererProps> = ({
  storyId,
  meaningId,
  sceneFrame,
  durationInFrames,
  timingBeat,
}) => {
  if (
    storyId !== "product-comic-vertical" ||
    meaningId !== "problem-hook" ||
    timingBeat.startFrame !== 15 ||
    timingBeat.endFrame !== 580 ||
    durationInFrames !== 565
  ) {
    throw new Error("problem-hook Renderer received stale Scene identity.");
  }
  return (
    <ProblemHookPanels
      sceneFrame={sceneFrame}
      durationInFrames={durationInFrames}
    />
  );
};

export default ProblemHookRenderer;

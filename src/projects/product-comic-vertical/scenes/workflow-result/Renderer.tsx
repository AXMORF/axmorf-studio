import type { FC } from "react";

import { WorkflowResultPanels } from "./shots/WorkflowResultPanels";

type WorkflowResultRendererProps = Readonly<{
  storyId: string;
  meaningId: string;
  sceneFrame: number;
  durationInFrames: number;
  width: number;
  height: number;
  timingBeat: Readonly<{ startFrame: number; endFrame: number }>;
}>;

const WorkflowResultRenderer: FC<WorkflowResultRendererProps> = ({
  storyId,
  meaningId,
  sceneFrame,
  durationInFrames,
  width,
  height,
  timingBeat,
}) => {
  if (
    storyId !== "product-comic-vertical" ||
    meaningId !== "workflow-result" ||
    timingBeat.startFrame !== 3103 ||
    timingBeat.endFrame !== 3651 ||
    durationInFrames !== 548
  ) {
    throw new Error("workflow-result Renderer received stale Scene identity.");
  }
  return (
    <WorkflowResultPanels
      sceneFrame={sceneFrame}
      durationInFrames={durationInFrames}
      width={width}
      height={height}
    />
  );
};

export default WorkflowResultRenderer;

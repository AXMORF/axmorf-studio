import type {FC} from "react";

import {WorkflowCreationChain} from "./shots/WorkflowCreationChain";

type WorkflowCreateRendererProps = Readonly<{
  storyId: string;
  meaningId: string;
  sceneFrame: number;
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
  timingBeat: Readonly<{startFrame: number; endFrame: number}>;
}>;

const WorkflowCreateRenderer: FC<WorkflowCreateRendererProps> = ({
  storyId,
  meaningId,
  sceneFrame,
  durationInFrames,
  fps,
  width,
  height,
  timingBeat,
}) => {
  if (
    storyId !== "product-comic-vertical" ||
    meaningId !== "workflow-create" ||
    timingBeat.startFrame !== 2373 ||
    timingBeat.endFrame !== 3103 ||
    durationInFrames !== 730 ||
    fps !== 30 ||
    width !== 1080 ||
    height !== 1920
  ) {
    throw new Error("workflow-create Renderer received stale Scene identity.");
  }

  return (
    <WorkflowCreationChain
      sceneFrame={sceneFrame}
      durationInFrames={durationInFrames}
    />
  );
};

export default WorkflowCreateRenderer;

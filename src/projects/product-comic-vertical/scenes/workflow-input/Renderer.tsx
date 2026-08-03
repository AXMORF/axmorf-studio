import type {FC} from "react";
import {AbsoluteFill} from "remotion";

import {VerifiedInputPacketShot} from "./shots/VerifiedInputPacketShot";

type WorkflowInputRendererProps = Readonly<{
  meaningId: string;
  sceneFrame: number;
  durationInFrames: number;
}>;

const Renderer: FC<WorkflowInputRendererProps> = ({
  meaningId,
  sceneFrame,
  durationInFrames,
}) => {
  if (meaningId !== "workflow-input") {
    throw new Error("workflow-input Renderer received another meaningId.");
  }
  return (
    <AbsoluteFill data-scene="workflow-input" data-caption-band-clear="1470-1830">
      <VerifiedInputPacketShot
        shotFrame={sceneFrame}
        durationInFrames={durationInFrames}
      />
    </AbsoluteFill>
  );
};

export default Renderer;

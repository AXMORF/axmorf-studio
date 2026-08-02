import { useCurrentFrame, useVideoConfig } from "remotion";

import NetDriftRenderer from "../Renderer";

const NetDriftAuthoringComposition = () => {
  const sceneFrame = useCurrentFrame();
  const { durationInFrames, fps, width, height } = useVideoConfig();

  return (
    <NetDriftRenderer
      sceneFrame={sceneFrame}
      durationInFrames={durationInFrames}
      fps={fps}
      width={width}
      height={height}
    />
  );
};

export default NetDriftAuthoringComposition;

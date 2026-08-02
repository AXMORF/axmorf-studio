import { useCurrentFrame } from "remotion";

import Renderer from "../Renderer";

const PositionIsTimeAuthoringComposition = () => {
  const sceneFrame = useCurrentFrame();

  return (
    <Renderer
      sceneFrame={sceneFrame}
      durationInFrames={346}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};

export default PositionIsTimeAuthoringComposition;

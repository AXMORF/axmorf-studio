import { useCurrentFrame } from "remotion";

import Renderer from "../Renderer";

const DURATION_IN_FRAMES = 415;

export const ErrorAccumulationAuthoringComposition = () => {
  const sceneFrame = useCurrentFrame();

  return (
    <Renderer
      storyId="gps-relativity"
      meaningId="error-accumulation"
      sceneFrame={sceneFrame}
      durationInFrames={DURATION_IN_FRAMES}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};

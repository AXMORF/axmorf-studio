import type { FC } from "react";
import { AbsoluteFill } from "remotion";

import { ErrorAccumulationShot } from "./shots/ErrorAccumulationShot";

type ErrorAccumulationRendererProps = Readonly<{
  storyId: string;
  meaningId: string;
  sceneFrame: number;
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
}>;

const SCENE_DURATION = 415;
const MAIN_SHOT_START = 0;

const ErrorAccumulationRenderer: FC<ErrorAccumulationRendererProps> = ({
  storyId,
  meaningId,
  sceneFrame,
  durationInFrames,
  fps,
  width,
  height,
}) => {
  if (
    storyId !== "gps-relativity" ||
    meaningId !== "error-accumulation" ||
    durationInFrames !== SCENE_DURATION ||
    fps !== 30 ||
    width !== 1920 ||
    height !== 1080 ||
    !Number.isInteger(sceneFrame) ||
    sceneFrame < 0 ||
    sceneFrame >= durationInFrames
  ) {
    throw new Error(
      "error-accumulation Renderer received stale Scene identity or timing.",
    );
  }

  return (
    <AbsoluteFill style={{ backgroundColor: "#071426" }}>
      <ErrorAccumulationShot
        sceneFrame={sceneFrame}
        shotFrame={sceneFrame - MAIN_SHOT_START}
        durationInFrames={durationInFrames}
      />
    </AbsoluteFill>
  );
};

export default ErrorAccumulationRenderer;

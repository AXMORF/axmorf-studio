import type { FC } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";

import visualStyleJson from "../../../visual-style.json";
import Renderer from "../Renderer";
import shotPlanJson from "../shot-plan.json";
import syncAnchorsJson from "../sync-anchors.json";
import taskInputJson from "../task-input.generated.json";
import visualPlanJson from "../visual-plan.json";

const rendererProps = {
  storyId: "gps-relativity",
  meaningId: "two-relativistic-effects",
  durationInFrames: 335,
  fps: 30,
  width: 1920,
  height: 1080,
  storyBeat: taskInputJson.storyBeat,
  timingBeat: taskInputJson.timingBeat,
  visualStyle: visualStyleJson,
  visualPlan: visualPlanJson,
  shots: shotPlanJson,
  syncAnchors: syncAnchorsJson,
  visualResources: [],
};

export const M7GpsTwoRelativisticEffectsAuthoringComposition: FC = () => {
  const sceneFrame = useCurrentFrame();
  const { durationInFrames, fps, width, height } = useVideoConfig();
  return (
    <Renderer
      {...rendererProps}
      sceneFrame={sceneFrame}
      durationInFrames={durationInFrames}
      fps={fps}
      width={width}
      height={height}
    />
  );
};

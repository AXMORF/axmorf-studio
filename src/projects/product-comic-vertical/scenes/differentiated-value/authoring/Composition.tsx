import {Audio} from "@remotion/media";
import type {FC} from "react";
import {
  AbsoluteFill,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import {
  SceneSyncAnchorSetSchema,
  SceneTaskInputSchema,
  SceneVisualPlanSchema,
  ShotPlanSetSchema,
  StorySpecSchema,
  VisualStyleSpecSchema,
} from "../../../../../contracts";
import type {SceneRendererProps} from "../../../../../remotion/runtime/story-visual/types";
import storyJson from "../../../story.json";
import visualStyleJson from "../../../visual-style.json";
import Renderer from "../Renderer";
import shotPlanJson from "../shot-plan.json";
import syncAnchorsJson from "../sync-anchors.json";
import taskInputJson from "../task-input.generated.json";
import visualPlanJson from "../visual-plan.json";

const task = SceneTaskInputSchema.parse(taskInputJson);
const story = StorySpecSchema.parse(storyJson);
const visualStyle = VisualStyleSpecSchema.parse(visualStyleJson);
const visualPlan = SceneVisualPlanSchema.parse(visualPlanJson);
const shots = ShotPlanSetSchema.parse(shotPlanJson);
const syncAnchors = SceneSyncAnchorSetSchema.parse(syncAnchorsJson);
const storyBeat = story.beats.find(
  ({meaningId}) => meaningId === "differentiated-value",
);
if (storyBeat === undefined) {
  throw new Error("differentiated-value StoryBeat is missing.");
}

const durationInFrames = task.timingBeat.endFrame - task.timingBeat.startFrame;

export const DifferentiatedValueAuthoringComposition: FC = () => {
  const sceneFrame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const rendererProps: SceneRendererProps = {
    storyId: task.storyId,
    meaningId: task.meaningId,
    sceneFrame,
    durationInFrames,
    fps: 30,
    width: 1080,
    height: 1920,
    storyBeat,
    timingBeat: task.timingBeat,
    visualStyle,
    visualPlan,
    shots,
    syncAnchors,
    visualResources: [],
  };
  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: 1080,
          height: 1920,
          scale: Math.min(width / 1080, height / 1920),
          transformOrigin: "0 0",
        }}
      >
        <Renderer {...rendererProps} />
      </div>
      <Sequence from={280} durationInFrames={9} layout="none">
        <Audio
          src={staticFile(
            "projects/product-comic-vertical/scene-audio/differentiated-value/invalidation-crack.wav",
          )}
          volume={0.28}
        />
      </Sequence>
    </AbsoluteFill>
  );
};

export default DifferentiatedValueAuthoringComposition;

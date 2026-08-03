import {Audio} from "@remotion/media";
import type {FC} from "react";
import {AbsoluteFill, Sequence, staticFile, useCurrentFrame} from "remotion";

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
  ({meaningId}) => meaningId === "workflow-create",
);
if (storyBeat === undefined) {
  throw new Error("workflow-create StoryBeat is missing.");
}

const durationInFrames = task.timingBeat.endFrame - task.timingBeat.startFrame;

export const WorkflowCreateAuthoringComposition: FC = () => {
  const sceneFrame = useCurrentFrame();
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
      <Renderer {...rendererProps} />
      <Sequence from={590} durationInFrames={11} layout="none">
        <Audio
          src={staticFile(
            "projects/product-comic-vertical/scene-audio/workflow-create/seal-lock-pulse.wav",
          )}
          volume={0.3}
        />
      </Sequence>
    </AbsoluteFill>
  );
};

export default WorkflowCreateAuthoringComposition;

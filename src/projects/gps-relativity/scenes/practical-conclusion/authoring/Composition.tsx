import { useCurrentFrame, useVideoConfig } from "remotion";

import {
  SceneSyncAnchorSetSchema,
  SceneTaskInputSchema,
  SceneVisualPlanSchema,
  ShotPlanSetSchema,
  VisualStyleSpecSchema,
} from "../../../../../contracts";
import rawVisualStyle from "../../../visual-style.json";
import Renderer from "../Renderer";
import rawShotPlan from "../shot-plan.json";
import rawSyncAnchors from "../sync-anchors.json";
import rawTask from "../task-input.generated.json";
import rawVisualPlan from "../visual-plan.json";

const task = SceneTaskInputSchema.parse(rawTask);
const visualStyle = VisualStyleSpecSchema.parse(rawVisualStyle);
const visualPlan = SceneVisualPlanSchema.parse(rawVisualPlan);
const shots = ShotPlanSetSchema.parse(rawShotPlan);
const syncAnchors = SceneSyncAnchorSetSchema.parse(rawSyncAnchors);

const PracticalConclusionAuthoringComposition = () => {
  const sceneFrame = useCurrentFrame();
  const { durationInFrames, fps, width, height } = useVideoConfig();

  return (
    <Renderer
      storyId={task.storyId}
      meaningId={task.meaningId}
      sceneFrame={sceneFrame}
      durationInFrames={durationInFrames}
      fps={fps}
      width={width}
      height={height}
      storyBeat={task.storyBeat}
      timingBeat={task.timingBeat}
      visualStyle={visualStyle}
      visualPlan={visualPlan}
      shots={shots}
      syncAnchors={syncAnchors}
      visualResources={[]}
    />
  );
};

export default PracticalConclusionAuthoringComposition;

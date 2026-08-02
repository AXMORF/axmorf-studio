import type { ComponentType } from "react";

import type {
  SceneSyncAnchorSet,
  SceneVisualPlan,
  ShotPlanSet,
  StoryBeat,
  VisualStyleSpec,
} from "../../../contracts";

export type ResolvedSceneVisualResource = Readonly<{
  resourceId: string;
  src: string;
  descriptorFingerprint: string;
}>;

export type SceneRendererProps = Readonly<{
  storyId: string;
  meaningId: string;
  sceneFrame: number;
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
  storyBeat: StoryBeat;
  timingBeat: Readonly<{ startFrame: number; endFrame: number }>;
  visualStyle: VisualStyleSpec;
  visualPlan: SceneVisualPlan;
  shots: ShotPlanSet;
  syncAnchors: SceneSyncAnchorSet;
  visualResources: readonly ResolvedSceneVisualResource[];
}>;

export type SceneRendererComponent = ComponentType<SceneRendererProps>;
export type SceneRendererRegistry = Readonly<
  Record<string, SceneRendererComponent>
>;

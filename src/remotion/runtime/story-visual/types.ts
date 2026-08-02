import type { ComponentType } from "react";

import type {
  Sha256Digest,
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

export type StoryVisualReadyEntry = Readonly<{
  meaningId: string;
  status: "ready";
  startFrame: number;
  endFrame: number;
  rendererId: string;
  sceneVisualFingerprint: Sha256Digest;
}>;

export type StoryVisualFallbackEntry = Readonly<{
  meaningId: string;
  status: "fallback";
  startFrame: number;
  endFrame: number;
  fallbackFingerprint: Sha256Digest;
}>;

export type StoryVisualEntry =
  | StoryVisualReadyEntry
  | StoryVisualFallbackEntry;

export type StoryBeatVisualTransition = Readonly<{
  fromMeaningId: string;
  toMeaningId: string;
  kind: "hard-cut" | "visual-overlay-v1";
  durationInFrames: number;
  boundaryFrame: number;
}>;

export type StoryVisualProjection = Readonly<{
  schemaVersion: 1;
  storyId: string;
  leadInFrames: number;
  tailFrames: number;
  durationInFrames: number;
  storyBeatTimings: readonly Readonly<{
    meaningId: string;
    startFrame: number;
    endFrame: number;
  }>[];
  entries: readonly StoryVisualEntry[];
  transitions: readonly StoryBeatVisualTransition[];
  registryFingerprint: Sha256Digest;
  runtimeVersion: "story-visual-runtime-v1";
  projectionFingerprint: Sha256Digest;
}>;

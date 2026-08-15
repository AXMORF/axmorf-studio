import type { ComponentType } from "react";

import { SCENE_COMPOSITION_BOUNDARY_VERSION } from "../../../contracts/production-requirements";
import type { ProductionReadabilityPolicy } from "../../../contracts/production-readability";
import type { Sha256Digest } from "../../../contracts/primitives";
import type {
  SceneSyncAnchorSet,
  SceneVisualPlan,
  ShotPlanSet,
} from "../../../contracts/scene-plan";
import type { StoryBeat } from "../../../contracts/story";
import type { VideoSourceReference } from "../../../contracts/brief";
import type { VisualStyleSpec } from "../../../contracts/visual-style";

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
  sourceReferences: readonly VideoSourceReference[];
  timingBeat: Readonly<{ startFrame: number; endFrame: number }>;
  visualStyle: VisualStyleSpec;
  visualPlan: SceneVisualPlan;
  shots: ShotPlanSet;
  syncAnchors: SceneSyncAnchorSet;
  visualResources: readonly ResolvedSceneVisualResource[];
}>;

export type SceneRendererMountProps = Readonly<
  Omit<SceneRendererProps, "sceneFrame"> & {
    readabilityPolicy: ProductionReadabilityPolicy;
    sceneBoundaryVersion: typeof SCENE_COMPOSITION_BOUNDARY_VERSION;
  }
>;

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

export type StoryVisualEntry = StoryVisualReadyEntry | StoryVisualFallbackEntry;

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

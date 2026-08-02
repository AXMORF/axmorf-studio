import type { FC } from "react";
import { Sequence, useCurrentFrame } from "remotion";

import type {
  SceneRendererProps,
  SceneRendererRegistry,
  StoryVisualReadyEntry,
} from "./types";

export const resolveSceneRenderer = (
  registry: SceneRendererRegistry,
  rendererId: string,
) => {
  const renderer = registry[rendererId];
  if (renderer === undefined) {
    throw new Error(`Scene renderer is not registered: ${rendererId}.`);
  }
  return renderer;
};

type MountedSceneRendererProps = Readonly<{
  Renderer: SceneRendererRegistry[string];
  rendererProps: Omit<SceneRendererProps, "sceneFrame">;
}>;

const MountedSceneRenderer: FC<MountedSceneRendererProps> = ({
  Renderer,
  rendererProps,
}) => {
  const sceneFrame = useCurrentFrame();
  if (sceneFrame < 0 || sceneFrame >= rendererProps.durationInFrames) {
    throw new Error("Scene renderer frame escaped its fixed Beat window.");
  }
  return <Renderer {...rendererProps} sceneFrame={sceneFrame} />;
};

export type SceneSlotProps = Readonly<{
  entry: StoryVisualReadyEntry;
  registry: SceneRendererRegistry;
  rendererProps: Omit<SceneRendererProps, "sceneFrame">;
}>;

export const SceneSlot: FC<SceneSlotProps> = ({
  entry,
  registry,
  rendererProps,
}) => {
  const Renderer = resolveSceneRenderer(registry, entry.rendererId);
  const durationInFrames = entry.endFrame - entry.startFrame;
  if (
    durationInFrames <= 0 ||
    (rendererProps.durationInFrames !== undefined &&
      rendererProps.durationInFrames !== durationInFrames)
  ) {
    throw new Error("Scene renderer duration must equal its fixed Beat window.");
  }
  return (
    <Sequence from={entry.startFrame} durationInFrames={durationInFrames}>
      <MountedSceneRenderer Renderer={Renderer} rendererProps={rendererProps} />
    </Sequence>
  );
};

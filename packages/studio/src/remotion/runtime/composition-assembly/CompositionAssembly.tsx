import type { FC, ReactNode } from "react";

export type CompositionAssemblyProps = {
  readonly narrativeCore: ReactNode;
  readonly globalVisualBackgroundLayers?: ReactNode;
  readonly storyVisualTrack?: ReactNode;
  readonly globalVisualLayers?: ReactNode;
  readonly soundDesignTrack?: ReactNode;
};

export const CompositionAssembly: FC<CompositionAssemblyProps> = ({
  narrativeCore,
  globalVisualBackgroundLayers,
  storyVisualTrack,
  globalVisualLayers,
  soundDesignTrack,
}) => (
  <>
    {globalVisualBackgroundLayers}
    {storyVisualTrack}
    {globalVisualLayers}
    {narrativeCore}
    {soundDesignTrack}
  </>
);

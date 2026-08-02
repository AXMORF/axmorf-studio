import type { FC, ReactNode } from "react";

export type CompositionAssemblyProps = {
  readonly narrativeCore: ReactNode;
  readonly storyVisualTrack?: ReactNode;
  readonly soundDesignTrack?: ReactNode;
};

export const CompositionAssembly: FC<CompositionAssemblyProps> = ({
  narrativeCore,
  storyVisualTrack,
  soundDesignTrack,
}) => (
  <>
    {storyVisualTrack}
    {narrativeCore}
    {soundDesignTrack}
  </>
);

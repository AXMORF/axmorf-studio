import { spring, useCurrentFrame, useVideoConfig } from "remotion";

export const useEntranceProgress = (durationInFrames: number, damping = 200): number => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return spring({
    config: { damping },
    durationInFrames,
    fps,
    frame,
  });
};

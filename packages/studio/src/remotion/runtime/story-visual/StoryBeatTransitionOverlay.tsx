import type { FC } from "react";
import { AbsoluteFill, interpolate, Sequence, useCurrentFrame } from "remotion";

import type { StoryBeatVisualTransition } from "./types";

const VisualOverlay: FC<{ readonly durationInFrames: number }> = ({
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, durationInFrames - 1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#ffffff",
        opacity: Math.min(opacity, 1 - opacity) * 0.12,
        pointerEvents: "none",
      }}
    />
  );
};

export const StoryBeatTransitionOverlay: FC<{
  readonly beatTransition: StoryBeatVisualTransition;
}> = ({ beatTransition }) => {
  if (beatTransition.kind === "hard-cut") return null;
  return (
    <Sequence
      from={beatTransition.boundaryFrame - beatTransition.durationInFrames}
      durationInFrames={beatTransition.durationInFrames}
    >
      <VisualOverlay durationInFrames={beatTransition.durationInFrames} />
    </Sequence>
  );
};

import type { FC, ReactNode } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";

import { resolveProducerWhip } from "./motion";

export type ProducerWhipInProps = {
  readonly children: ReactNode;
  /** 1 enters from the right, -1 from the left. */
  readonly direction?: 1 | -1;
  /** Frames to settle; 4–6 reads as a whip. */
  readonly frames?: number;
  /** Starting offset as a fraction of the width. */
  readonly distance?: number;
  readonly blurPx?: number;
  /** Defaults to the current Sequence frame (0 on the cut). */
  readonly frame?: number;
};

/** Horizontal whip-pan entrance: the shot lands blurred and sharpens. */
export const ProducerWhipIn: FC<ProducerWhipInProps> = ({
  children,
  direction = 1,
  frames = 5,
  distance = 0.35,
  blurPx = 28,
  frame: frameOverride,
}) => {
  const currentFrame = useCurrentFrame();
  const whip = resolveProducerWhip({
    frame: frameOverride ?? currentFrame,
    frames,
    direction,
    distance,
    blurPx,
  });
  return (
    <AbsoluteFill
      style={{
        transform: `translateX(${(whip.offset * 100).toFixed(3)}%)`,
        filter:
          whip.blurPx > 0.2 ? `blur(${whip.blurPx.toFixed(1)}px)` : "none",
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

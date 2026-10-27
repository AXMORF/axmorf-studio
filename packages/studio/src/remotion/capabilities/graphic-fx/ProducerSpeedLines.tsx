import type { FC } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";

import { resolveProducerSpeedLines } from "./motion";

export type ProducerSpeedLinesProps = {
  readonly seed: string;
  readonly color?: string;
  readonly opacity?: number;
  /** Focus point as fractions of the frame. */
  readonly center?: readonly [number, number];
  readonly count?: number;
  readonly holdFrames?: number;
  /** Clear radius around the focus, as a fraction of the frame diagonal. */
  readonly innerRadius?: number;
  /** Defaults to the current Sequence frame. */
  readonly frame?: number;
};

/** Radial speed lines around a focus point, redrawn every few frames. */
export const ProducerSpeedLines: FC<ProducerSpeedLinesProps> = ({
  seed,
  color = "#ffffff",
  opacity = 0.5,
  center = [0.5, 0.5],
  count,
  holdFrames,
  innerRadius,
  frame: frameOverride,
}) => {
  const currentFrame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
    throw new Error("ProducerSpeedLines opacity must be between 0 and 1.");
  }
  const lines = resolveProducerSpeedLines({
    frame: frameOverride ?? currentFrame,
    seed,
    count,
    holdFrames,
    innerRadius,
  });
  const diagonal = Math.hypot(width, height);
  const cx = center[0] * width;
  const cy = center[1] * height;
  // Widest just past the frame corners (half the diagonal), not far outside it.
  const outer = diagonal * 0.62;
  return (
    <AbsoluteFill style={{ opacity, pointerEvents: "none" }}>
      <svg
        aria-hidden
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
      >
        {lines.map(({ angle, inner, spread }, index) => {
          const ax = Math.cos(angle);
          const ay = Math.sin(angle);
          const r0 = inner * diagonal;
          const half = spread * diagonal;
          const d = [
            `M${(cx + ax * r0).toFixed(1)} ${(cy + ay * r0).toFixed(1)}`,
            `L${(cx + ax * outer - ay * half).toFixed(1)} ${(cy + ay * outer + ax * half).toFixed(1)}`,
            `L${(cx + ax * outer + ay * half).toFixed(1)} ${(cy + ay * outer - ax * half).toFixed(1)}`,
            "Z",
          ].join(" ");
          return <path key={index} d={d} fill={color} />;
        })}
      </svg>
    </AbsoluteFill>
  );
};

import type { CSSProperties, FC, ReactNode } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";

import { resolveProducerCamera2D } from "./interpolate";
import type { ProducerCamera2DKeyframe } from "./types";

export type ProducerCamera2DProps = {
  readonly keyframes: readonly ProducerCamera2DKeyframe[];
  readonly children: ReactNode;
  readonly overscan?: number;
  readonly maxTravelPx?: number;
  readonly style?: CSSProperties;
};

const assertCamera2DGeometry = (overscan: number, maxTravelPx: number) => {
  if (!Number.isFinite(overscan) || overscan < 0 || overscan > 0.5) {
    throw new Error("ProducerCamera2D overscan must be between 0 and 0.5.");
  }
  if (!Number.isFinite(maxTravelPx) || maxTravelPx <= 0) {
    throw new Error("ProducerCamera2D maxTravelPx must be positive.");
  }
};

export const ProducerCamera2D: FC<ProducerCamera2DProps> = ({
  keyframes,
  children,
  overscan = 0.06,
  maxTravelPx = 120,
  style,
}) => {
  const frame = useCurrentFrame();
  assertCamera2DGeometry(overscan, maxTravelPx);
  const state = resolveProducerCamera2D(keyframes, frame);

  return (
    <AbsoluteFill style={{ ...style, overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          rotate: `${state.rotation}deg`,
          scale: state.zoom * (1 + overscan),
          transformOrigin: `${state.anchor[0]}% ${state.anchor[1]}%`,
          translate: `${state.x * maxTravelPx}px ${state.y * maxTravelPx}px`,
        }}
      >
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

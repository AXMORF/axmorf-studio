import type { CSSProperties, FC, ReactNode } from "react";
import { useCurrentFrame } from "remotion";

import { getProducerStagePlanePosition, resolveProducerFocus } from "./interpolate";
import type { ProducerFocusKeyframe, ProducerStagePlane } from "./types";

export type ProducerFocusPullProps = {
  readonly plane: ProducerStagePlane;
  readonly keyframes: readonly ProducerFocusKeyframe[];
  readonly children: ReactNode;
  readonly maxBlurPx?: number;
  readonly style?: CSSProperties;
};

const assertMaxBlur = (maxBlurPx: number) => {
  if (!Number.isFinite(maxBlurPx) || maxBlurPx < 0 || maxBlurPx > 48) {
    throw new Error("ProducerFocusPull maxBlurPx must be between 0 and 48.");
  }
};

export const ProducerFocusPull: FC<ProducerFocusPullProps> = ({
  plane,
  keyframes,
  children,
  maxBlurPx = 14,
  style,
}) => {
  const frame = useCurrentFrame();
  assertMaxBlur(maxBlurPx);
  const focus = resolveProducerFocus(keyframes, frame);
  const planePosition = getProducerStagePlanePosition(plane);
  const blur = Math.abs(planePosition - focus.position) * maxBlurPx;

  return (
    <div
      style={{
        ...style,
        contain: "paint",
        filter: `blur(${blur}px)`,
        height: "100%",
        isolation: "isolate",
        overflow: "hidden",
        width: "100%",
      }}
    >
      {children}
    </div>
  );
};

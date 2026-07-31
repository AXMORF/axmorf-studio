import type { CSSProperties, FC, ReactNode } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";

import { assertProducerLayerDepths, resolveProducerLayeredStage } from "./interpolate";
import type { ProducerLayerDepths, ProducerLayeredStageKeyframe } from "./types";

export type ProducerLayeredStageProps = {
  readonly keyframes: readonly ProducerLayeredStageKeyframe[];
  readonly background: ReactNode;
  readonly subject: ReactNode;
  readonly foreground: ReactNode;
  readonly depths?: ProducerLayerDepths;
  readonly maxOffsetPx?: number;
  readonly style?: CSSProperties;
  readonly backgroundStyle?: CSSProperties;
  readonly subjectStyle?: CSSProperties;
  readonly foregroundStyle?: CSSProperties;
};

const defaultDepths = {
  background: 0.2,
  subject: 0.55,
  foreground: 1,
} as const satisfies ProducerLayerDepths;

const assertMaxOffset = (maxOffsetPx: number) => {
  if (!Number.isFinite(maxOffsetPx) || maxOffsetPx <= 0) {
    throw new Error("ProducerLayeredStage maxOffsetPx must be positive.");
  }
};

export const ProducerLayeredStage: FC<ProducerLayeredStageProps> = ({
  keyframes,
  background,
  subject,
  foreground,
  depths = defaultDepths,
  maxOffsetPx = 96,
  style,
  backgroundStyle,
  subjectStyle,
  foregroundStyle,
}) => {
  const frame = useCurrentFrame();
  assertProducerLayerDepths(depths);
  assertMaxOffset(maxOffsetPx);
  const travel = resolveProducerLayeredStage(keyframes, frame);
  const plane = (depth: number, planeStyle: CSSProperties | undefined): CSSProperties => ({
    ...planeStyle,
    translate: `${-travel.x * maxOffsetPx * depth}px ${-travel.y * maxOffsetPx * depth}px`,
  });

  return (
    <AbsoluteFill style={{ ...style, overflow: "hidden" }}>
      <AbsoluteFill style={plane(depths.background, backgroundStyle)}>{background}</AbsoluteFill>
      <AbsoluteFill style={plane(depths.subject, subjectStyle)}>{subject}</AbsoluteFill>
      <AbsoluteFill style={plane(depths.foreground, foregroundStyle)}>{foreground}</AbsoluteFill>
    </AbsoluteFill>
  );
};

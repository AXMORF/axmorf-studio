import type { ReactNode } from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";

export type WhipPanProps = {
  readonly from?: ReactNode;
  readonly to?: ReactNode;
  readonly startFrame?: number;
  readonly durationInFrames?: number;
  readonly direction?: "left" | "right" | "up" | "down";
  readonly blurPx?: number;
};

/** A Scene-local content transition; it never retimes children or spoken frames. */
export default function WhipPan({
  from = null,
  to = null,
  startFrame = 30,
  durationInFrames = 12,
  direction = "left",
  blurPx = 8,
}: WhipPanProps) {
  const frame = useCurrentFrame();
  if (
    !Number.isFinite(startFrame) ||
    !Number.isFinite(durationInFrames) ||
    durationInFrames <= 0
  )
    throw new Error(
      "WhipPan requires finite startFrame and positive durationInFrames.",
    );
  if (!Number.isFinite(blurPx) || blurPx < 0)
    throw new Error("WhipPan blurPx must be nonnegative.");
  const progress = interpolate(
    frame,
    [startFrame, startFrame + durationInFrames],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.inOut(Easing.cubic),
    },
  );
  const sign = direction === "left" || direction === "up" ? -1 : 1;
  const axis = direction === "left" || direction === "right" ? "X" : "Y";
  const blur = Math.sin(progress * Math.PI) * blurPx;
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {[
        { id: "from", content: from, index: 0 },
        { id: "to", content: to, index: 1 },
      ].map(({ id, content, index }) => (
        <div
          key={id}
          style={{
            position: "absolute",
            inset: 0,
            transform: `translate${axis}(${sign * (progress - index) * 100}%)`,
            filter:
              progress > 0 && progress < 1 ? `blur(${blur}px)` : undefined,
            visibility:
              (index === 0 && progress === 1) || (index === 1 && progress === 0)
                ? "hidden"
                : "visible",
          }}
        >
          {content}
        </div>
      ))}
    </div>
  );
}

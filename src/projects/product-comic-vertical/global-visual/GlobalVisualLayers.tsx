import type {FC} from "react";
import {AbsoluteFill, interpolate, useCurrentFrame} from "remotion";

import type {
  GlobalVisualPlan,
  GlobalVisualProjection,
} from "../../../contracts";

export const GlobalVisualLayers: FC<{
  readonly plan: GlobalVisualPlan;
  readonly projection: GlobalVisualProjection;
}> = ({plan, projection}) => {
  const frame = useCurrentFrame();
  if (
    plan.storyId !== "product-comic-vertical" ||
    plan.compositionId !== "ProductComicVertical" ||
    plan.width !== 1080 ||
    plan.height !== 1920 ||
    projection.storyId !== plan.storyId ||
    projection.compositionId !== plan.compositionId ||
    projection.durationInFrames !== plan.durationInFrames ||
    projection.globalVisualPlanFingerprint !== plan.planFingerprint
  ) {
    throw new Error("Product comic GlobalVisual projection is stale.");
  }
  const activeWindow = plan.continuityMotif.windows.find(
    (window) => frame >= window.startFrame && frame < window.endFrame,
  );
  const progress = activeWindow
    ? interpolate(
        frame,
        [activeWindow.startFrame, activeWindow.endFrame - 1],
        [0, 1],
        {extrapolateLeft: "clamp", extrapolateRight: "clamp"},
      )
    : 0;
  const visibility = activeWindow
    ? interpolate(progress, [0, 0.2, 0.76, 1], [0, 1, 1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      }) * plan.continuityMotif.opacity
    : 0;
  const sweep = activeWindow
    ? interpolate(
        progress,
        [0, 1],
        activeWindow.direction === 1 ? [-180, 180] : [180, -180],
        {extrapolateLeft: "clamp", extrapolateRight: "clamp"},
      )
    : 0;
  const sweepX = activeWindow?.axis === "x" ? sweep : sweep * 0.16;
  const sweepY = activeWindow?.axis === "y" ? sweep : sweep * 0.2;

  return (
    <AbsoluteFill
      aria-hidden
      style={{pointerEvents: "none", zIndex: 20}}
    >
      <AbsoluteFill
        style={{
          inset: plan.frameTreatment.inset,
          border: `${plan.frameTreatment.borderWidth}px solid ${plan.frameTreatment.borderColor}`,
          borderRadius: 34,
          opacity: plan.frameTreatment.borderOpacity,
          boxShadow: `inset 0 0 110px rgba(28, 18, 22, ${plan.frameTreatment.vignetteOpacity})`,
        }}
      />
      <AbsoluteFill
        style={{
          opacity: plan.frameTreatment.grainOpacity,
          backgroundImage:
            "radial-gradient(circle at 12% 18%, #f3d6a4 0 1.2px, transparent 1.7px), radial-gradient(circle at 78% 72%, #f15b45 0 1px, transparent 1.5px)",
          backgroundSize: "31px 37px, 43px 47px",
          mixBlendMode: "screen",
        }}
      />
      <svg
        width={plan.width}
        height={plan.height}
        viewBox={`0 0 ${plan.width} ${plan.height}`}
        style={{position: "absolute", inset: 0, opacity: visibility}}
      >
        <g transform={`translate(${sweepX} ${sweepY})`}>
          <path
            d="M 80 280 C 250 225, 835 225, 1000 280"
            fill="none"
            stroke={plan.continuityMotif.color}
            strokeWidth={plan.continuityMotif.strokeWidth}
            strokeDasharray="18 14 5 14"
            strokeLinecap="round"
          />
          <path
            d="M 120 1510 C 330 1575, 760 1575, 960 1510"
            fill="none"
            stroke={plan.continuityMotif.color}
            strokeWidth={plan.continuityMotif.strokeWidth}
            strokeDasharray="7 18"
          />
          <circle
            cx={540 + sweepX * 0.18}
            cy={260 + sweepY * 0.12}
            r={18 + progress * 12}
            fill="none"
            stroke={plan.continuityMotif.color}
            strokeWidth={plan.continuityMotif.strokeWidth}
          />
        </g>
      </svg>
    </AbsoluteFill>
  );
};

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
    projection.storyId !== plan.storyId ||
    projection.compositionId !== plan.compositionId ||
    projection.durationInFrames !== plan.durationInFrames ||
    projection.globalVisualPlanFingerprint !== plan.planFingerprint
  ) {
    throw new Error("GPS GlobalVisual projection is stale.");
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
  const motifOpacity = activeWindow
    ? interpolate(progress, [0, 0.18, 0.78, 1], [0, 1, 1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      }) * plan.continuityMotif.opacity
    : 0;
  const xOffset = activeWindow
    ? interpolate(
        progress,
        [0, 1],
        activeWindow.direction === 1 ? [-120, 120] : [120, -120],
        {extrapolateLeft: "clamp", extrapolateRight: "clamp"},
      )
    : 0;
  const yOffset = activeWindow?.axis === "y" ? xOffset * 0.18 : 0;

  return (
    <AbsoluteFill
      aria-hidden
      style={{
        pointerEvents: "none",
        zIndex: 20,
      }}
    >
      <AbsoluteFill
        style={{
          inset: plan.frameTreatment.inset,
          border: `${plan.frameTreatment.borderWidth}px solid ${plan.frameTreatment.borderColor}`,
          opacity: plan.frameTreatment.borderOpacity,
          borderRadius: 26,
          boxShadow: `inset 0 0 90px rgba(2, 8, 23, ${plan.frameTreatment.vignetteOpacity})`,
        }}
      />
      <AbsoluteFill
        style={{
          opacity: plan.frameTreatment.grainOpacity,
          backgroundImage:
            "radial-gradient(circle at 18% 22%, #9ee7ff 0 1px, transparent 1.4px), radial-gradient(circle at 74% 38%, #ffffff 0 1px, transparent 1.3px)",
          backgroundSize: "37px 41px, 53px 47px",
          mixBlendMode: "screen",
        }}
      />
      <svg
        width={plan.width}
        height={plan.height}
        viewBox={`0 0 ${plan.width} ${plan.height}`}
        style={{position: "absolute", inset: 0, opacity: motifOpacity}}
      >
        <g transform={`translate(${xOffset} ${yOffset})`}>
          <path
            d="M 240 174 C 560 62, 1140 62, 1680 174"
            fill="none"
            stroke={plan.continuityMotif.color}
            strokeWidth={plan.continuityMotif.strokeWidth}
            strokeDasharray="10 18"
          />
          <circle
            cx={960 + xOffset * 0.32}
            cy={116 + yOffset}
            r={10 + progress * 5}
            fill="none"
            stroke={plan.continuityMotif.color}
            strokeWidth={plan.continuityMotif.strokeWidth}
          />
          <path
            d={`M ${860 + progress * 160} 116 L ${900 + progress * 160} 116`}
            stroke={plan.continuityMotif.color}
            strokeWidth={plan.continuityMotif.strokeWidth}
            strokeLinecap="round"
          />
        </g>
      </svg>
    </AbsoluteFill>
  );
};

import type {FC} from "react";
import {AbsoluteFill, interpolate, useCurrentFrame} from "remotion";

const PAPER = "#F5EEDC";

type GlobalVisualPlanProps = Readonly<{
  storyId: string;
  compositionId: string;
  width: number;
  height: number;
  durationInFrames: number;
  planFingerprint: string;
  frameTreatment: Readonly<{
    inset: number;
    borderWidth: number;
    borderColor: string;
    borderOpacity: number;
    vignetteOpacity: number;
    grainOpacity: number;
  }>;
  continuityMotif: Readonly<{
    color: string;
    strokeWidth: number;
    opacity: number;
    windows: readonly Readonly<{
      startFrame: number;
      endFrame: number;
      axis: "x" | "y";
      direction: -1 | 1;
    }>[];
  }>;
}>;

type GlobalVisualProjectionProps = Readonly<{
  storyId: string;
  compositionId: string;
  durationInFrames: number;
  globalVisualPlanFingerprint: string;
}>;

export const GlobalVisualLayers: FC<{
  readonly plan: GlobalVisualPlanProps;
  readonly projection: GlobalVisualProjectionProps;
}> = ({plan, projection}) => {
  const frame = useCurrentFrame();
  if (
    plan.storyId !== "neural-network-name" ||
    plan.compositionId !== "NeuralNetworkName" ||
    plan.width !== 1080 ||
    plan.height !== 1920 ||
    projection.storyId !== plan.storyId ||
    projection.compositionId !== plan.compositionId ||
    projection.durationInFrames !== plan.durationInFrames ||
    projection.globalVisualPlanFingerprint !== plan.planFingerprint
  ) {
    throw new Error("Neural network name GlobalVisual projection is stale.");
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
    ? interpolate(progress, [0, 0.14, 0.84, 1], [0.55, 1, 1, 0.55], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      }) * plan.continuityMotif.opacity
    : 0;
  const drift = activeWindow
    ? interpolate(
        progress,
        [0, 1],
        activeWindow.direction === 1 ? [-14, 14] : [14, -14],
        {extrapolateLeft: "clamp", extrapolateRight: "clamp"},
      )
    : 0;
  const threadX = activeWindow?.axis === "x" ? drift : drift * 0.3;
  const threadY = activeWindow?.axis === "y" ? drift : drift * 0.25;

  return (
    <AbsoluteFill
      aria-hidden
      style={{backgroundColor: PAPER, pointerEvents: "none", zIndex: 0}}
    >
      <AbsoluteFill
        style={{
          opacity: plan.frameTreatment.grainOpacity,
          backgroundImage:
            "radial-gradient(ellipse at 16% 13%, rgba(78,66,49,0.36) 0 0.7px, transparent 1.15px), radial-gradient(ellipse at 72% 67%, rgba(94,76,54,0.28) 0 0.65px, transparent 1.1px), linear-gradient(92deg, transparent 0 48%, rgba(83,67,47,0.08) 49%, transparent 50%)",
          backgroundSize: "23px 29px, 31px 37px, 13px 17px",
        }}
      />
      <AbsoluteFill
        style={{
          inset: plan.frameTreatment.inset,
          border: `${plan.frameTreatment.borderWidth}px solid ${plan.frameTreatment.borderColor}`,
          borderRadius: 38,
          opacity: plan.frameTreatment.borderOpacity,
          boxShadow: `inset 0 0 120px rgba(47, 52, 72, ${plan.frameTreatment.vignetteOpacity})`,
        }}
      />
      <svg
        width={plan.width}
        height={plan.height}
        viewBox={`0 0 ${plan.width} ${plan.height}`}
        style={{position: "absolute", inset: 0, opacity: motifOpacity}}
      >
        <g transform={`translate(${threadX} ${threadY})`}>
          <path
            d="M 62 116 C 46 330, 82 540, 58 760 C 39 936, 83 1130, 61 1328 C 45 1478, 70 1618, 58 1730"
            fill="none"
            stroke={plan.continuityMotif.color}
            strokeWidth={plan.continuityMotif.strokeWidth}
            strokeLinecap="round"
            strokeDasharray="1 1"
          />
          <path
            d="M 1018 142 C 1030 390, 1002 612, 1021 846 C 1035 1030, 1008 1252, 1022 1450 C 1028 1540, 1012 1632, 1020 1718"
            fill="none"
            stroke={plan.continuityMotif.color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeDasharray="8 15"
          />
          <circle cx="61" cy={190 + progress * 1450} r="7" fill="#F5EEDC" stroke={plan.continuityMotif.color} strokeWidth="3" />
        </g>
        <g fill="none" stroke={plan.continuityMotif.color} strokeLinecap="round">
          <path d="M 112 76 q 18 -15 36 1" strokeWidth="3" />
          <path d="M 932 91 q 15 17 31 -2" strokeWidth="3" />
          <path d="M 106 1684 q 15 -13 31 2" strokeWidth="3" />
          <circle cx="980" cy="1668" r="6" strokeWidth="3" />
          <circle cx="130" cy="116" r="3" fill={plan.continuityMotif.color} stroke="none" />
          <circle cx="952" cy="138" r="4" fill="#D66A4D" stroke="none" />
        </g>
      </svg>
    </AbsoluteFill>
  );
};

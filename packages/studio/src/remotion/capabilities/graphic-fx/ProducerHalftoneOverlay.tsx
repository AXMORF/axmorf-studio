import { useId, type CSSProperties, type FC } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";

import { toProducerSvgId } from "./resolve";

export type ProducerHalftoneOverlayProps = {
  /** Distance between dot centers in pixels. */
  readonly spacingPx?: number;
  /** Dot radius in pixels; at most half the spacing. */
  readonly radiusPx?: number;
  readonly color?: string;
  readonly opacity?: number;
  readonly angle?: number;
  readonly blendMode?: CSSProperties["mixBlendMode"];
  /** Where dots stay strongest: everywhere, toward the edges, or at the center. */
  readonly fade?: "none" | "edges" | "center";
  /** Slow pattern drift that keeps a held shot alive. */
  readonly driftPxPerFrame?: number;
  /** Defaults to the current Sequence frame. */
  readonly frame?: number;
};

/**
 * Print dot screen that fills its parent box (full-bleed in a shot). Use `fade="edges"` to keep the
 * subject clean while the background reads as printed.
 */
export const ProducerHalftoneOverlay: FC<ProducerHalftoneOverlayProps> = ({
  spacingPx = 14,
  radiusPx = 3.2,
  color = "#ffffff",
  opacity = 0.35,
  angle = 18,
  blendMode = "soft-light",
  fade = "none",
  driftPxPerFrame = 0,
  frame: frameOverride,
}) => {
  const id = toProducerSvgId("axmorf-halftone", useId());
  const currentFrame = useCurrentFrame();
  if (!Number.isFinite(spacingPx) || spacingPx < 4 || spacingPx > 120) {
    throw new Error(
      "ProducerHalftoneOverlay spacingPx must be between 4 and 120.",
    );
  }
  if (!Number.isFinite(radiusPx) || radiusPx <= 0 || radiusPx > spacingPx / 2) {
    throw new Error(
      "ProducerHalftoneOverlay radiusPx must be positive and at most half of spacingPx.",
    );
  }
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
    throw new Error("ProducerHalftoneOverlay opacity must be between 0 and 1.");
  }
  const frame = frameOverride ?? currentFrame;
  const drift = (frame * driftPxPerFrame) % spacingPx;
  const fadeStops =
    fade === "edges"
      ? [
          ["0%", 0.15],
          ["55%", 0.5],
          ["100%", 1],
        ]
      : [
          ["0%", 1],
          ["55%", 0.6],
          ["100%", 0.1],
        ];
  return (
    <AbsoluteFill
      style={{ mixBlendMode: blendMode, opacity, pointerEvents: "none" }}
    >
      <svg aria-hidden width="100%" height="100%">
        <defs>
          <pattern
            id={`${id}-dots`}
            patternUnits="userSpaceOnUse"
            width={spacingPx}
            height={spacingPx}
            patternTransform={`rotate(${angle}) translate(${drift} 0)`}
          >
            <circle
              cx={spacingPx / 2}
              cy={spacingPx / 2}
              r={radiusPx}
              fill={color}
            />
          </pattern>
          {fade === "none" ? null : (
            <>
              <radialGradient id={`${id}-fade`} cx="50%" cy="50%" r="75%">
                {fadeStops.map(([offset, value]) => (
                  <stop
                    key={offset}
                    offset={offset}
                    stopColor="#fff"
                    stopOpacity={value}
                  />
                ))}
              </radialGradient>
              <mask id={`${id}-mask`}>
                <rect width="100%" height="100%" fill={`url(#${id}-fade)`} />
              </mask>
            </>
          )}
        </defs>
        <rect
          width="100%"
          height="100%"
          fill={`url(#${id}-dots)`}
          mask={fade === "none" ? undefined : `url(#${id}-mask)`}
        />
      </svg>
    </AbsoluteFill>
  );
};

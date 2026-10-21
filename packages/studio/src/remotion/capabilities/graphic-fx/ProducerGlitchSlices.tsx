import type { CSSProperties, FC, ReactNode } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";

import {
  resolveProducerBurstIntensity,
  resolveProducerGlitchSlices,
} from "./resolve";

export type ProducerGlitchSlicesProps = {
  readonly children: ReactNode;
  readonly seed: number | string;
  /** Peak tear strength, 0–1. */
  readonly intensity?: number;
  /** Frames where a tear burst starts; omit to tear continuously. */
  readonly bursts?: readonly number[];
  readonly burstFrames?: number;
  readonly slices?: number;
  readonly maxOffsetPx?: number;
  readonly holdFrames?: number;
  /** Defaults to the current Sequence frame. */
  readonly frame?: number;
  readonly style?: CSSProperties;
};

const tints = { red: "#ff2a55", cyan: "#19f0ff" } as const;

/**
 * Digital tear: displaced horizontal strips of the same subtree, stepped like
 * limited animation. Strips are decorative copies (aria-hidden) that exist only
 * while a burst is active, so held reading frames stay clean.
 */
export const ProducerGlitchSlices: FC<ProducerGlitchSlicesProps> = ({
  children,
  seed,
  intensity = 0.8,
  bursts,
  burstFrames = 6,
  slices = 6,
  maxOffsetPx = 80,
  holdFrames = 2,
  frame: frameOverride,
  style,
}) => {
  const currentFrame = useCurrentFrame();
  const frame = frameOverride ?? currentFrame;
  const strength = resolveProducerBurstIntensity({
    frame,
    intensity,
    bursts,
    burstFrames,
  });
  const tears = resolveProducerGlitchSlices({
    frame,
    seed,
    intensity: strength,
    slices,
    maxOffsetPx,
    holdFrames,
  });
  return (
    <AbsoluteFill style={style}>
      <AbsoluteFill>{children}</AbsoluteFill>
      {tears.map((tear, index) => (
        <AbsoluteFill
          key={index}
          aria-hidden
          style={{
            clipPath: `inset(${(tear.top * 100).toFixed(3)}% 0 ${((1 - tear.top - tear.height) * 100).toFixed(3)}% 0)`,
            transform: `translateX(${tear.offsetPx.toFixed(2)}px)`,
          }}
        >
          {children}
          {tear.tint === null ? null : (
            <AbsoluteFill
              style={{
                backgroundColor: tints[tear.tint],
                mixBlendMode: "screen",
                // A hint of channel color; the displaced image must stay legible.
                opacity: 0.2,
              }}
            />
          )}
        </AbsoluteFill>
      ))}
    </AbsoluteFill>
  );
};

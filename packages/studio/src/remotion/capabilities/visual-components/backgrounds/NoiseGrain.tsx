import { useId } from "react";
import { useCurrentFrame } from "remotion";

export type NoiseGrainProps = {
  readonly opacity?: number;
  readonly seed?: number;
  readonly grainSize?: number;
  readonly holdFrames?: number;
};

/** Transparent, frame-deterministic texture scoped to its positioned parent. */
export default function NoiseGrain({
  opacity = 0.08,
  seed = 1,
  grainSize = 1.5,
  holdFrames = 2,
}: NoiseGrainProps) {
  const frame = useCurrentFrame();
  const id = `grain-${useId().replace(/[^a-zA-Z0-9_-]/gu, "")}`;
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1)
    throw new Error("NoiseGrain opacity must be between 0 and 1.");
  if (!Number.isFinite(grainSize) || grainSize <= 0)
    throw new Error("NoiseGrain grainSize must be positive.");
  if (!Number.isSafeInteger(holdFrames) || holdFrames < 1)
    throw new Error("NoiseGrain holdFrames must be a positive integer.");
  if (!Number.isSafeInteger(seed) || seed < 0)
    throw new Error("NoiseGrain seed must be a nonnegative integer.");
  return (
    <svg
      aria-hidden="true"
      width="100%"
      height="100%"
      style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity }}
    >
      <defs>
        <filter id={id} x="0" y="0" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency={1 / grainSize}
            numOctaves={3}
            seed={
              (seed + Math.floor(Math.max(0, frame) / holdFrames)) % 2147483647
            }
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
      </defs>
      <rect width="100%" height="100%" filter={`url(#${id})`} />
    </svg>
  );
}

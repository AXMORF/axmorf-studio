import type { CSSProperties, FC, ReactNode } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";

import { resolveProducerBeatCamera } from "./motion";

export type ProducerBeatCameraProps = {
  readonly children: ReactNode;
  /** Frames (in this component's timeline) where the camera punches in. */
  readonly punches?: readonly number[];
  /** Frames where the camera shakes briefly, usually snare hits. */
  readonly shakes?: readonly number[];
  /** Extra scale on a punch, decaying over decayFrames. */
  readonly punch?: number;
  readonly shakePx?: number;
  readonly decayFrames?: number;
  readonly seed?: string;
  /** Defaults to the current Sequence frame. */
  readonly frame?: number;
  readonly style?: CSSProperties;
};

/**
 * Makes a shot answer the music: punch-ins on kicks or bars, a short shake on
 * snares. Keep it to hook, transition and climax ranges; narrated ranges read
 * better with a steady frame.
 */
export const ProducerBeatCamera: FC<ProducerBeatCameraProps> = ({
  children,
  punches,
  shakes,
  punch,
  shakePx,
  decayFrames,
  seed,
  frame: frameOverride,
  style,
}) => {
  const currentFrame = useCurrentFrame();
  const { scale, x, y } = resolveProducerBeatCamera({
    frame: frameOverride ?? currentFrame,
    punches,
    shakes,
    punch,
    shakePx,
    decayFrames,
    seed,
  });
  return (
    <AbsoluteFill
      style={{
        ...style,
        transform: `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${scale.toFixed(4)})`,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

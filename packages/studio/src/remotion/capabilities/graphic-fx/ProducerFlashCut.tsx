import type { FC } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";

import { resolveProducerFlashOpacity } from "./resolve";

export type ProducerFlashCutProps = {
  /** Frames where the flash peaks, usually cut or accent frames. */
  readonly frames: readonly number[];
  readonly color?: string;
  readonly decayFrames?: number;
  readonly peak?: number;
  /** Defaults to the current Sequence frame. */
  readonly frame?: number;
};

/** White or black flash frames that punctuate beat cuts. */
export const ProducerFlashCut: FC<ProducerFlashCutProps> = ({
  frames,
  color = "#ffffff",
  decayFrames = 6,
  peak = 0.9,
  frame: frameOverride,
}) => {
  const currentFrame = useCurrentFrame();
  const opacity = resolveProducerFlashOpacity({
    frame: frameOverride ?? currentFrame,
    frames,
    decayFrames,
    peak,
  });
  if (opacity === 0) return null;
  return (
    <AbsoluteFill
      style={{ backgroundColor: color, opacity, pointerEvents: "none" }}
    />
  );
};

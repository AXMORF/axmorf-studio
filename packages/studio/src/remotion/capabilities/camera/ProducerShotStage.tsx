import type { CSSProperties, FC, ReactNode } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";

import {
  resolveProducerShotPlane,
  resolveProducerShotStage,
} from "./interpolate";
import type { ProducerShotDrift, ProducerShotKeyframe } from "./types";

export type ProducerShotStageProps = {
  /** Scene viewport size; every plane is authored in these world coordinates. */
  readonly width: number;
  readonly height: number;
  readonly shots: readonly ProducerShotKeyframe[];
  readonly subject: ReactNode;
  readonly background?: ReactNode;
  readonly foreground?: ReactNode;
  /** Stable reading layer outside the camera, e.g. SceneTextSafeArea content. */
  readonly overlay?: ReactNode;
  readonly backgroundDepth?: number;
  readonly foregroundDepth?: number;
  readonly drift?: ProducerShotDrift | null;
  /** Defaults to the current Sequence frame; pass sceneFrame for grouped Scenes. */
  readonly frame?: number;
  readonly style?: CSSProperties;
};

export const ProducerShotStage: FC<ProducerShotStageProps> = ({
  width,
  height,
  shots,
  subject,
  background = null,
  foreground = null,
  overlay = null,
  backgroundDepth = 0.35,
  foregroundDepth = 1.4,
  drift = null,
  frame: frameOverride,
  style,
}) => {
  const currentFrame = useCurrentFrame();
  const frame = frameOverride ?? currentFrame;
  const state = resolveProducerShotStage(shots, frame);
  if (backgroundDepth > 1) {
    throw new Error(
      "ProducerShotStage backgroundDepth must be at most 1 to stay full-bleed.",
    );
  }
  if (foregroundDepth < 1) {
    throw new Error("ProducerShotStage foregroundDepth must be at least 1.");
  }

  const plane = (depth: number, content: ReactNode) => {
    const transform = resolveProducerShotPlane({
      state,
      depth,
      width,
      height,
      frame,
      drift,
    });
    return (
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width,
          height,
          transformOrigin: "0 0",
          transform: `translate(${width / 2 + transform.offset[0]}px, ${height / 2 + transform.offset[1]}px) rotate(${transform.rotation}deg) scale(${transform.scale}) translate(${-transform.focus[0] * width}px, ${-transform.focus[1] * height}px)`,
        }}
      >
        {content}
      </div>
    );
  };

  return (
    <AbsoluteFill style={{ ...style, width, height, overflow: "hidden" }}>
      {background !== null ? plane(backgroundDepth, background) : null}
      {plane(1, subject)}
      {foreground !== null ? plane(foregroundDepth, foreground) : null}
      {overlay !== null ? <AbsoluteFill>{overlay}</AbsoluteFill> : null}
    </AbsoluteFill>
  );
};

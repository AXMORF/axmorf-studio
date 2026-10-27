import type { CSSProperties, FC, ReactNode } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";

import {
  resolveProducerWorldCamera,
  resolveProducerWorldPlane,
  type ProducerWorldShot,
} from "./world-camera";

export type ProducerWorldLayer = {
  /** 1 = subject plane; below 1 = farther (moves less); above 1 = nearer (moves more). */
  readonly depth: number;
  readonly content: ReactNode;
};

export type ProducerWorldCameraProps = {
  /** Frame size. */
  readonly width: number;
  readonly height: number;
  /** World size in pixels; author every layer in these coordinates. */
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly shots: readonly ProducerWorldShot[];
  /** Painted back to front. */
  readonly layers: readonly ProducerWorldLayer[];
  /** Stable reading layer that does not move with the camera. */
  readonly overlay?: ReactNode;
  /** Defaults to the current Sequence frame. */
  readonly frame?: number;
  readonly style?: CSSProperties;
};

/**
 * A camera that travels through a world larger than the frame: pan along a
 * process, push in on a mechanism, pull out to the result. Layers at different
 * depths give parallax. Use it when a scene is a place to move through rather
 * than one screen to zoom into.
 */
export const ProducerWorldCamera: FC<ProducerWorldCameraProps> = ({
  width,
  height,
  worldWidth,
  worldHeight,
  shots,
  layers,
  overlay = null,
  frame: frameOverride,
  style,
}) => {
  const currentFrame = useCurrentFrame();
  const state = resolveProducerWorldCamera({
    shots,
    frame: frameOverride ?? currentFrame,
    width,
    height,
    worldWidth,
    worldHeight,
  });
  const anchor = resolveProducerWorldCamera({
    shots,
    frame: shots[0]!.frame,
    width,
    height,
    worldWidth,
    worldHeight,
  }).center;
  return (
    <AbsoluteFill style={{ ...style, width, height, overflow: "hidden" }}>
      {layers.map(({ depth, content }, index) => {
        const { translate, scale } = resolveProducerWorldPlane({
          state,
          depth,
          anchor,
          width,
          height,
        });
        return (
          <div
            key={index}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: worldWidth,
              height: worldHeight,
              transformOrigin: "0 0",
              transform: `translate(${translate[0].toFixed(2)}px, ${translate[1].toFixed(2)}px) scale(${scale.toFixed(4)})`,
            }}
          >
            {content}
          </div>
        );
      })}
      {overlay !== null ? <AbsoluteFill>{overlay}</AbsoluteFill> : null}
    </AbsoluteFill>
  );
};

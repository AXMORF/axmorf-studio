import type { CSSProperties, FC } from "react";
import { Gif } from "@remotion/gif";
import { AnimatedImage, staticFile, type AnimatedImageProps } from "remotion";

import { assertProducerLocalMediaPath, requirePositiveFiniteMediaNumber } from "./local-path";

export type ProducerAnimatedImageProps = {
  readonly src: string;
  readonly width: number;
  readonly height: number;
  readonly fit?: NonNullable<AnimatedImageProps["fit"]>;
  readonly playbackRate?: number;
  readonly loopBehavior?: NonNullable<AnimatedImageProps["loopBehavior"]>;
  readonly style?: CSSProperties;
};

export const ProducerAnimatedImage: FC<ProducerAnimatedImageProps> = ({
  src,
  width,
  height,
  fit = "cover",
  playbackRate = 1,
  loopBehavior = "loop",
  style,
}) => {
  assertProducerLocalMediaPath(src, "ProducerAnimatedImage src");
  requirePositiveFiniteMediaNumber(width, "ProducerAnimatedImage width");
  requirePositiveFiniteMediaNumber(height, "ProducerAnimatedImage height");
  requirePositiveFiniteMediaNumber(playbackRate, "ProducerAnimatedImage playbackRate");

  const resolvedSrc = staticFile(src);
  const sharedProps = {
    fit,
    height,
    onError: (error: Error) => {
      throw error;
    },
    playbackRate,
    src: resolvedSrc,
    style: { ...style, height, width },
    width,
  };

  if (src.toLowerCase().endsWith(".gif")) {
    return (
      <Gif
        {...sharedProps}
        loopBehavior={loopBehavior === "clear-after-finish" ? "unmount-after-finish" : loopBehavior}
      />
    );
  }

  return <AnimatedImage {...sharedProps} loopBehavior={loopBehavior} />;
};

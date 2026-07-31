import { Lottie, type LottieAnimationData } from "@remotion/lottie";
import { useEffect, useState, type CSSProperties, type FC } from "react";
import { cancelRender, continueRender, delayRender, staticFile } from "remotion";

import { assertProducerLocalMediaPath, requirePositiveFiniteMediaNumber } from "./local-path";

export type ProducerLottieProps = {
  readonly src: string;
  readonly width: number;
  readonly height: number;
  readonly playbackRate?: number;
  readonly loop?: boolean;
  readonly style?: CSSProperties;
};

export const ProducerLottie: FC<ProducerLottieProps> = ({
  src,
  width,
  height,
  playbackRate = 1,
  loop = true,
  style,
}) => {
  assertProducerLocalMediaPath(src, "ProducerLottie src");
  requirePositiveFiniteMediaNumber(width, "ProducerLottie width");
  requirePositiveFiniteMediaNumber(height, "ProducerLottie height");
  requirePositiveFiniteMediaNumber(playbackRate, "ProducerLottie playbackRate");
  const [handle] = useState(() => delayRender(`Loading local Lottie ${src}`));
  const [animationData, setAnimationData] = useState<LottieAnimationData | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(staticFile(src))
      .then((response) => {
        if (!response.ok) throw new Error(`Local Lottie load failed with HTTP ${response.status}.`);
        return response.json();
      })
      .then((value: LottieAnimationData) => {
        if (cancelled) return;
        setAnimationData(value);
        continueRender(handle);
      })
      .catch((error: unknown) => cancelRender(error));
    return () => {
      cancelled = true;
    };
  }, [handle, src]);

  if (!animationData) return null;

  return (
    <Lottie
      animationData={animationData}
      loop={loop}
      playbackRate={playbackRate}
      renderer="svg"
      style={{ ...style, height, width }}
    />
  );
};

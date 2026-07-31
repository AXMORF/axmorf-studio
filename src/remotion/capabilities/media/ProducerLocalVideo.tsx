import { Video, type VideoObjectFit } from "@remotion/media";
import type { CSSProperties, FC } from "react";
import { staticFile, type VolumeProp } from "remotion";

import { assertProducerLocalMediaPath, requirePositiveFiniteMediaNumber } from "./local-path";

export type ProducerLocalVideoProps = {
  readonly src: string;
  readonly width: number;
  readonly height: number;
  readonly trimBefore?: number;
  readonly trimAfter?: number;
  readonly loop?: boolean;
  readonly playbackRate?: number;
  readonly objectFit?: VideoObjectFit;
  readonly objectPosition?: CSSProperties["objectPosition"];
  readonly volume?: VolumeProp;
  readonly muted?: boolean;
  readonly style?: CSSProperties;
};

export const ProducerLocalVideo: FC<ProducerLocalVideoProps> = ({
  src,
  width,
  height,
  trimBefore,
  trimAfter,
  loop = false,
  playbackRate = 1,
  objectFit = "cover",
  objectPosition = "50% 50%",
  volume = 1,
  muted = false,
  style,
}) => {
  assertProducerLocalMediaPath(src, "ProducerLocalVideo src");
  requirePositiveFiniteMediaNumber(width, "ProducerLocalVideo width");
  requirePositiveFiniteMediaNumber(height, "ProducerLocalVideo height");
  requirePositiveFiniteMediaNumber(playbackRate, "ProducerLocalVideo playbackRate");
  if (trimBefore !== undefined && (!Number.isInteger(trimBefore) || trimBefore < 0)) {
    throw new Error("ProducerLocalVideo trimBefore must be a non-negative integer.");
  }
  if (trimAfter !== undefined && (!Number.isInteger(trimAfter) || trimAfter <= 0)) {
    throw new Error("ProducerLocalVideo trimAfter must be a positive integer.");
  }
  if (trimBefore !== undefined && trimAfter !== undefined && trimBefore >= trimAfter) {
    throw new Error("ProducerLocalVideo trimBefore must be less than trimAfter.");
  }
  if (typeof volume === "number" && (!Number.isFinite(volume) || volume < 0 || volume > 1)) {
    throw new Error("ProducerLocalVideo volume must be between 0 and 1.");
  }

  return (
    <Video
      loop={loop}
      muted={muted}
      objectFit={objectFit}
      playbackRate={playbackRate}
      src={staticFile(src)}
      style={{ ...style, height, objectPosition, width }}
      trimAfter={trimAfter}
      trimBefore={trimBefore}
      volume={volume}
    />
  );
};

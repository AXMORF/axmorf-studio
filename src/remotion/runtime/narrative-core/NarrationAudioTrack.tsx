import type { FC } from "react";
import { Html5Audio, Sequence } from "remotion";

export type NarrationAudioTrackProps = {
  readonly src: string;
  readonly narrationStartFrame: number;
};

export const NarrationAudioTrack: FC<NarrationAudioTrackProps> = ({
  src,
  narrationStartFrame,
}) => (
  <Sequence from={narrationStartFrame}>
    <Html5Audio src={src} playbackRate={1} />
  </Sequence>
);

import type { FC } from "react";
import { Html5Audio, Sequence } from "remotion";

export type NarrationAudioTrackProps = {
  readonly src: string;
  readonly leadInFrames: number;
};

export const NarrationAudioTrack: FC<NarrationAudioTrackProps> = ({
  src,
  leadInFrames,
}) => (
  <Sequence from={leadInFrames}>
    <Html5Audio src={src} playbackRate={1} />
  </Sequence>
);

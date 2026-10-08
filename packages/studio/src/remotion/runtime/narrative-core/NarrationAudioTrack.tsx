import type { FC } from "react";
import { Html5Audio, Sequence } from "remotion";

export type NarrationAudioTrackProps = {
  readonly src: string | null;
  readonly narrationStartFrame: number | null;
};

export const NarrationAudioTrack: FC<NarrationAudioTrackProps> = ({
  src,
  narrationStartFrame,
}) => {
  if (src === null && narrationStartFrame === null) return null;
  if (
    src === null ||
    src.length === 0 ||
    narrationStartFrame === null ||
    !Number.isSafeInteger(narrationStartFrame) ||
    narrationStartFrame < 0
  ) {
    throw new Error(
      "Narration audio requires a source and a non-negative start frame, or explicit absence of both.",
    );
  }
  return (
    <Sequence from={narrationStartFrame}>
      <Html5Audio src={src} playbackRate={1} />
    </Sequence>
  );
};

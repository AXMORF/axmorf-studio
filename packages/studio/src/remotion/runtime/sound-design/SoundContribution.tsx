import type { FC } from "react";
import { Audio, Sequence, staticFile } from "remotion";

import {
  resolveSoundVolume,
  validateSoundPlayback,
  type SoundPlaybackOptions,
} from "./audio-playback";

export type SoundContributionValue = SoundPlaybackOptions &
  Readonly<{
    contributionId: string;
    publicPath: string;
    startFrame: number;
    endFrame: number;
    volume: number;
    loop: boolean;
  }>;

export const SoundContribution: FC<{
  readonly contribution: SoundContributionValue;
}> = ({ contribution }) => {
  if (
    !contribution.publicPath.startsWith("public/") ||
    !Number.isSafeInteger(contribution.startFrame) ||
    !Number.isSafeInteger(contribution.endFrame) ||
    contribution.startFrame < 0 ||
    contribution.endFrame <= contribution.startFrame ||
    !Number.isFinite(contribution.volume) ||
    contribution.volume < 0 ||
    contribution.volume > 1
  ) {
    throw new Error("Sound contribution is not runtime-safe.");
  }
  const durationInFrames = contribution.endFrame - contribution.startFrame;
  validateSoundPlayback(contribution, durationInFrames);
  return (
    <Sequence
      from={contribution.startFrame}
      durationInFrames={durationInFrames}
    >
      <Audio
        src={staticFile(contribution.publicPath.slice("public/".length))}
        volume={(localFrame) =>
          resolveSoundVolume(
            localFrame,
            durationInFrames,
            contribution.volume,
            contribution,
          )
        }
        loop={contribution.loop}
        {...(contribution.sourceStartFrame === undefined
          ? {}
          : { trimBefore: contribution.sourceStartFrame })}
        {...(contribution.fadeInFrames === undefined &&
        contribution.fadeOutFrames === undefined
          ? {}
          : { loopVolumeCurveBehavior: "extend" as const })}
      />
    </Sequence>
  );
};

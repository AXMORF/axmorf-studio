import type { FC } from "react";
import { Audio, Sequence, staticFile } from "remotion";

export type SoundContributionValue = Readonly<{
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
  return (
    <Sequence
      from={contribution.startFrame}
      durationInFrames={contribution.endFrame - contribution.startFrame}
    >
      <Audio
        src={staticFile(contribution.publicPath.slice("public/".length))}
        volume={() => contribution.volume}
        loop={contribution.loop}
      />
    </Sequence>
  );
};

import { Fragment, type FC } from "react";
import { Html5Audio, Sequence, staticFile } from "remotion";

import type { SceneSoundProjection } from "./resolve-scene-sound";

export const SceneSoundContribution: FC<{
  readonly projection: SceneSoundProjection;
}> = ({ projection }) => {
  if (projection.contributions.length === 0) return null;
  return (
    <Fragment>
      {projection.contributions.map((contribution) => (
        <Sequence
          key={contribution.contributionId}
          from={projection.beatStartFrame + contribution.startFrame}
          durationInFrames={contribution.endFrame - contribution.startFrame}
        >
          <Html5Audio
            src={staticFile(contribution.publicPath.slice("public/".length))}
            volume={() => contribution.volume}
          />
        </Sequence>
      ))}
    </Fragment>
  );
};

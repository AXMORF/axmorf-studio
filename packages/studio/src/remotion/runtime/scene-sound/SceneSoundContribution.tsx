import { Fragment, type FC } from "react";

import { SoundContribution } from "../sound-design/SoundContribution";
import type { SceneSoundProjection } from "./resolve-scene-sound";

export const SceneSoundContribution: FC<{
  readonly projection: SceneSoundProjection;
  readonly busGain?: number;
}> = ({ projection, busGain = 1 }) => {
  if (!Number.isFinite(busGain) || busGain < 0 || busGain > 1) {
    throw new Error("Scene sound bus gain must be finite and linear.");
  }
  if (projection.contributions.length === 0) return null;
  return (
    <Fragment>
      {projection.contributions.map((contribution) => (
        <SoundContribution
          key={contribution.contributionId}
          contribution={{
            ...contribution,
            startFrame: projection.beatStartFrame + contribution.startFrame,
            endFrame: projection.beatStartFrame + contribution.endFrame,
            volume: contribution.volume * busGain,
            loop: false,
          }}
        />
      ))}
    </Fragment>
  );
};

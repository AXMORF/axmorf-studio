import type { FC } from "react";

import { SoundContribution } from "../../runtime/sound-design";
import type { ProducerSoundContribution } from "./types";

export const ProducerSoundtrack: FC<{
  readonly contributions: readonly ProducerSoundContribution[];
}> = ({ contributions }) => (
  <>
    {contributions.map((contribution) => (
      <SoundContribution
        key={contribution.contributionId}
        contribution={contribution}
      />
    ))}
  </>
);

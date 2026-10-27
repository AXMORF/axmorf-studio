import type { FC, ReactNode } from "react";
import { Sequence } from "remotion";

import { resolveProducerBeatCuts } from "./resolve";

export type ProducerBeatCutSeriesProps = {
  /**
   * Frames where each shot starts, in the parent timeline (inside a Sequence,
   * subtract its `from`). Pick them with selectProducerCutFrames.
   */
  readonly cutFrames: readonly number[];
  /** Frame where the last shot ends. */
  readonly endFrame: number;
  /** Shots are used in order and cycle when there are more cuts than shots. */
  readonly shots: readonly ReactNode[];
  readonly minShotFrames?: number;
};

/**
 * Hard cuts on a musical grid. Each shot runs in its own Sequence, so its
 * useCurrentFrame() starts at 0 on its cut.
 */
export const ProducerBeatCutSeries: FC<ProducerBeatCutSeriesProps> = ({
  cutFrames,
  endFrame,
  shots,
  minShotFrames = 3,
}) => {
  if (shots.length === 0) {
    throw new Error("ProducerBeatCutSeries needs at least one shot.");
  }
  const cuts = resolveProducerBeatCuts({ cutFrames, endFrame, minShotFrames });
  return (
    <>
      {cuts.map((cut) => (
        <Sequence
          key={cut.index}
          from={cut.startFrame}
          durationInFrames={cut.endFrame - cut.startFrame}
          name={`Beat cut ${cut.index + 1}`}
        >
          {shots[cut.index % shots.length]}
        </Sequence>
      ))}
    </>
  );
};

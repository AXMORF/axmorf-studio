export type ProducerBeatSnapOptions = Readonly<{
  /** Largest distance in frames the landing may move to reach the grid. */
  maxShiftFrames?: number;
  /** Inclusive permitted action window; a snap never leaves it. */
  minFrame?: number;
  maxFrame?: number;
}>;

/**
 * Moves an authored landing frame to the nearest musical grid frame (beat, bar, section or
 * accent) when that stays inside the permitted window and within maxShiftFrames. Otherwise
 * the semantic frame wins and is returned unchanged.
 */
export const snapProducerFrameToBeat = (
  frame: number,
  gridFrames: readonly number[],
  {
    maxShiftFrames = 4,
    minFrame = -Infinity,
    maxFrame = Infinity,
  }: ProducerBeatSnapOptions = {},
): number => {
  if (!Number.isFinite(frame))
    throw new Error("Beat snap frame must be finite.");
  if (!Number.isFinite(maxShiftFrames) || maxShiftFrames < 0) {
    throw new Error("Beat snap maxShiftFrames must be a non-negative number.");
  }
  let best = frame;
  let bestDistance = Infinity;
  for (const candidate of gridFrames) {
    const distance = Math.abs(candidate - frame);
    if (
      distance <= maxShiftFrames &&
      distance < bestDistance &&
      candidate >= minFrame &&
      candidate <= maxFrame
    ) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
};

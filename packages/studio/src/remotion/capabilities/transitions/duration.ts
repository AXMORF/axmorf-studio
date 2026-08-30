import { getProducerTransitionPreset, type ProducerTransitionPresetOptions } from "./presets";

export type ProducerTransitionSeriesDurationOptions = {
  readonly sceneDurations: readonly number[];
  readonly transitions: readonly ProducerTransitionPresetOptions[];
  readonly fps: number;
};

const requirePositiveInteger = (value: number, label: string): void => {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
};

export const getProducerTransitionSeriesDuration = ({
  sceneDurations,
  transitions,
  fps,
}: ProducerTransitionSeriesDurationOptions): number => {
  if (sceneDurations.length === 0) {
    throw new Error("sceneDurations must not be empty");
  }
  if (transitions.length !== sceneDurations.length - 1) {
    throw new Error("transitions must contain exactly one entry between adjacent scenes");
  }
  if (!Number.isFinite(fps) || fps <= 0) {
    throw new Error("fps must be positive");
  }

  sceneDurations.forEach((duration, index) => {
    requirePositiveInteger(duration, `sceneDurations[${index}]`);
  });

  const sceneTotal = sceneDurations.reduce((sum, duration) => sum + duration, 0);
  const overlap = transitions.reduce(
    (sum, transition) =>
      sum + getProducerTransitionPreset(transition).timing.getDurationInFrames({ fps }),
    0,
  );
  const total = sceneTotal - overlap;

  if (total <= 0) {
    throw new Error("transition overlap must leave a positive total duration");
  }

  return total;
};

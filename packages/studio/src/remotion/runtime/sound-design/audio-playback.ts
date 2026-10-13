export type SoundPlaybackOptions = Readonly<{
  sourceStartFrame?: number;
  fadeInFrames?: number;
  fadeOutFrames?: number;
}>;

export const validateSoundPlayback = (
  options: SoundPlaybackOptions,
  durationInFrames: number,
) => {
  if (
    !Number.isSafeInteger(durationInFrames) ||
    durationInFrames <= 0 ||
    [
      options.sourceStartFrame,
      options.fadeInFrames,
      options.fadeOutFrames,
    ].some(
      (value) =>
        value !== undefined && (!Number.isSafeInteger(value) || value < 0),
    ) ||
    !Number.isSafeInteger((options.sourceStartFrame ?? 0) + durationInFrames) ||
    (options.fadeInFrames ?? 0) > durationInFrames ||
    (options.fadeOutFrames ?? 0) > durationInFrames
  ) {
    throw new Error("Sound playback range or fades are not runtime-safe.");
  }
};

export type SpeechDucking = Readonly<{
  /** Absolute music volume while speech is active. */
  volume: number;
  rampFrames: number;
  /** Contribution-local [start, end) speech ranges, sorted and merged. */
  ranges: readonly (readonly [number, number])[];
}>;

/**
 * Merges measured speech chunks so short breaths between them do not pump the music.
 * Input ranges are absolute frames; the result is relative to `offsetFrame`.
 */
export const mergeSpeechRanges = (
  ranges: readonly (readonly [number, number])[],
  rampFrames: number,
  offsetFrame = 0,
): readonly (readonly [number, number])[] => {
  const merged: [number, number][] = [];
  for (const [start, end] of [...ranges].sort((a, b) => a[0] - b[0])) {
    if (end <= start) continue;
    const last = merged.at(-1);
    if (last !== undefined && start - last[1] <= rampFrames * 2) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }
  return merged.map(([start, end]) => [start - offsetFrame, end - offsetFrame]);
};

/** Multiplier for the base volume: 1 away from speech, volume/base under speech. */
export const resolveSpeechDuckingGain = (
  localFrame: number,
  baseVolume: number,
  ducking: SpeechDucking,
) => {
  if (baseVolume <= 0) return 1;
  const ramp = ducking.rampFrames;
  let amount = 0;
  for (const [start, end] of ducking.ranges) {
    if (localFrame < start - ramp) break;
    if (localFrame >= start && localFrame < end)
      return ducking.volume / baseVolume;
    if (localFrame < start)
      amount = Math.max(amount, (localFrame - (start - ramp)) / ramp);
    else if (localFrame < end + ramp)
      amount = Math.max(amount, 1 - (localFrame - end) / ramp);
  }
  return 1 + amount * (ducking.volume / baseVolume - 1);
};

export const resolveSoundVolume = (
  localFrame: number,
  durationInFrames: number,
  volume: number,
  options: SoundPlaybackOptions,
) => {
  const fadeIn = options.fadeInFrames ?? 0;
  const fadeOut = options.fadeOutFrames ?? 0;
  const inGain = fadeIn === 0 ? 1 : localFrame / Math.max(1, fadeIn - 1);
  const outGain =
    fadeOut === 0
      ? 1
      : (durationInFrames - 1 - localFrame) / Math.max(1, fadeOut - 1);
  // Overlapping ramps use the lower gain, keeping the envelope piecewise linear.
  return volume * Math.max(0, Math.min(1, inGain, outGain));
};

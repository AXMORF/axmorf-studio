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

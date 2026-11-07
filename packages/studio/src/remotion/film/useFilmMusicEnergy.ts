import {
  useWindowedAudioData,
  visualizeAudio,
  type MediaUtilsAudioData,
} from "@remotion/media-utils";
import { useLayoutEffect } from "react";
import { staticFile, useCurrentFrame, useDelayRender } from "remotion";

import type { FilmMusic } from "../../contracts/film";
import { useFilm } from "./context";

export type FilmMusicEnergy = Readonly<{
  low: number;
  mid: number;
  high: number;
}>;
export type FilmMusicEnergyOptions = Readonly<{
  bands?: 3;
  /** Fixed for this hook's lifetime, as required by useWindowedAudioData. */
  windowInSeconds?: number;
}>;

const FFT_BINS = 1024;
const ZERO_ENERGY: FilmMusicEnergy = { low: 0, mid: 0, high: 0 };
const clamp = (value: number) => Math.max(0, Math.min(1, value));

/** Normalized FFT amplitude mapped from [-80, 0] dB into [0, 1]; silence stays zero. */
export const filmMusicLogAmplitude = (amplitude: number) =>
  Number.isFinite(amplitude) && amplitude > 0
    ? clamp((20 * Math.log10(amplitude) + 80) / 80)
    : 0;

/** Physical frequency bands, independent of FFT size and sample rate. */
export const resolveFilmMusicEnergyBands = (
  frequencies: readonly number[],
  sampleRate: number,
): FilmMusicEnergy => {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0)
    throw new Error("Music energy requires a positive sample rate.");
  const band = (fromHz: number, toHz: number) => {
    let squareSum = 0;
    let count = 0;
    frequencies.forEach((amplitude, index) => {
      const hz = (index * sampleRate) / (2 * frequencies.length);
      if (hz >= fromHz && hz < toHz) {
        const finite = Number.isFinite(amplitude) ? clamp(amplitude) : 0;
        squareSum += finite * finite;
        count++;
      }
    });
    return count === 0
      ? 0
      : filmMusicLogAmplitude(Math.sqrt(squareSum / count));
  };
  return {
    low: band(20, 250),
    mid: band(250, 2_000),
    high: band(2_000, 20_000),
  };
};

/** Same source clock as FilmSoundtrack, including legacy loops and startFrame. */
export const resolveFilmMusicSourceFrame = (
  music: Pick<FilmMusic, "startFrame" | "scoreDurationInFrames" | "loop">,
  frame: number,
) => {
  const relative = frame - music.startFrame;
  if (relative < 0) return null;
  if (music.loop === false && relative >= music.scoreDurationInFrames)
    return null;
  return relative % music.scoreDurationInFrames;
};

/**
 * A fixed PCM neighborhood prevents visualization normalization from changing
 * when adjacent Range windows finish loading. Smoothing samples f-1/f/f+1,
 * never prior React renders, so seeking and parallel stills agree.
 */
export const resolveFilmMusicEnergyWindow = (
  audioData: MediaUtilsAudioData,
  frame: number,
  fps: number,
  dataOffsetInSeconds: number,
) => {
  // Pinned media-utils 4.0.489 concatenates available Range windows, including
  // gaps, and exposes their indices in resultId. A length check alone would
  // mistake e.g. windows 1,3 for contiguous PCM and render the wrong samples.
  const windows = audioData.resultId
    .match(/-windows-(\d+(?:,\d+)*)$/u)?.[1]
    .split(",")
    .map(Number);
  if (
    windows?.some(
      (index, position) => position > 0 && index !== windows[position - 1] + 1,
    )
  )
    return null;
  const { sampleRate, channelWaveforms, durationInSeconds } = audioData;
  const sourceSamples = Math.round(durationInSeconds * sampleRate);
  const start = Math.max(
    0,
    Math.floor(((frame - 1) / fps) * sampleRate) - FFT_BINS,
  );
  const end = Math.max(
    start + FFT_BINS * 2,
    Math.ceil(((frame + 1) / fps) * sampleRate) + FFT_BINS,
  );
  const availableStart = Math.round(dataOffsetInSeconds * sampleRate);
  const availableEnd = availableStart + channelWaveforms[0].length;
  if (availableStart > start || availableEnd < Math.min(end, sourceSamples))
    return null;
  const samples = new Float32Array(end - start);
  samples.set(
    channelWaveforms[0].subarray(
      start - availableStart,
      Math.min(end, sourceSamples) - availableStart,
    ),
  );
  return {
    audioData: {
      ...audioData,
      resultId: `${audioData.resultId}:energy:${start}:${end}`,
      channelWaveforms: [samples],
    },
    dataOffsetInSeconds: start / sampleRate,
  };
};

/**
 * Local score spectrum for secondary glow/breathing only. Primary landings use
 * useFilmTiming().music.onsets. Mount at the film root so useCurrentFrame() is
 * the body clock. Run film:music first. Returns null while PCM is loading.
 */
export const useFilmMusicEnergy = ({
  bands = 3,
  windowInSeconds = 5,
}: FilmMusicEnergyOptions = {}): FilmMusicEnergy | null => {
  const { spec, music, durationInFrames } = useFilm();
  const frame = useCurrentFrame();
  if (!music) throw new Error("Run film:music before reading music energy.");
  if (bands !== 3)
    throw new Error("Music energy supports exactly three bands.");
  if (!Number.isFinite(windowInSeconds) || windowInSeconds < 0.5)
    throw new Error("Music energy windowInSeconds must be at least 0.5.");
  if (music.publicPath !== `public/films/${spec.filmId}/music.wav`)
    throw new Error("Music energy only reads this film's local music.wav.");
  const sourceFrame = resolveFilmMusicSourceFrame(music, frame);
  const { audioData, dataOffsetInSeconds } = useWindowedAudioData({
    src: staticFile(music.publicPath.slice("public/".length)),
    frame: sourceFrame ?? 0,
    fps: spec.render.fps,
    windowInSeconds,
  });
  const active = sourceFrame !== null && frame < durationInFrames;
  const fixedWindow =
    active && audioData
      ? resolveFilmMusicEnergyWindow(
          audioData,
          sourceFrame,
          spec.render.fps,
          dataOffsetInSeconds,
        )
      : null;
  const { delayRender, continueRender } = useDelayRender();
  useLayoutEffect(() => {
    if (!active || fixedWindow) return;
    const handle = delayRender(
      "Waiting for the complete music energy PCM neighborhood",
    );
    return () => continueRender(handle);
  }, [active, fixedWindow, delayRender, continueRender]);
  if (!active) return ZERO_ENERGY;
  if (!fixedWindow || sourceFrame === null) return null;
  return resolveFilmMusicEnergyBands(
    visualizeAudio({
      ...fixedWindow,
      frame: sourceFrame,
      fps: spec.render.fps,
      numberOfSamples: FFT_BINS,
      smoothing: true,
      optimizeFor: "accuracy",
    }),
    fixedWindow.audioData.sampleRate,
  );
};

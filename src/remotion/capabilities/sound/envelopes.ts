import { interpolate } from "remotion";

import type { ProducerNarrationWindow } from "./types";

const requireVolume = (value: number, label: string): void => {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${label} must be between 0 and 1.`);
  }
};

const requireFrames = (value: number, label: string): void => {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
};

const validateWindows = (windows: readonly ProducerNarrationWindow[]): void => {
  let previousEnd = -1;
  for (const window of windows) {
    if (
      !Number.isInteger(window.startFrame) ||
      !Number.isInteger(window.endFrame) ||
      window.startFrame < 0 ||
      window.endFrame <= window.startFrame ||
      window.startFrame < previousEnd
    ) {
      throw new Error("Narration window ranges must be positive, ordered, and non-overlapping.");
    }
    previousEnd = window.endFrame;
  }
};

export const getProducerDuckedVolume = ({
  frame,
  baseVolume,
  duckedVolume,
  attackFrames,
  releaseFrames,
  narrationWindows,
}: {
  readonly frame: number;
  readonly baseVolume: number;
  readonly duckedVolume: number;
  readonly attackFrames: number;
  readonly releaseFrames: number;
  readonly narrationWindows: readonly ProducerNarrationWindow[];
}): number => {
  requireFrames(frame, "frame");
  requireVolume(baseVolume, "baseVolume");
  requireVolume(duckedVolume, "duckedVolume");
  requireFrames(attackFrames, "attackFrames");
  requireFrames(releaseFrames, "releaseFrames");
  if (duckedVolume > baseVolume) throw new Error("duckedVolume must not exceed baseVolume.");
  validateWindows(narrationWindows);

  for (const window of narrationWindows) {
    const attackStart = Math.max(0, window.startFrame - attackFrames);
    const releaseEnd = window.endFrame + releaseFrames;
    if (frame >= attackStart && frame < window.startFrame) {
      return interpolate(frame, [attackStart, window.startFrame], [baseVolume, duckedVolume], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
    }
    if (frame >= window.startFrame && frame < window.endFrame) return duckedVolume;
    if (frame >= window.endFrame && frame <= releaseEnd) {
      return interpolate(frame, [window.endFrame, releaseEnd], [duckedVolume, baseVolume], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
    }
  }
  return baseVolume;
};

export const getProducerBedVolume = ({
  frame,
  durationInFrames,
  volume,
  fadeFrames,
}: {
  readonly frame: number;
  readonly durationInFrames: number;
  readonly volume: number;
  readonly fadeFrames: number;
}): number => {
  requireFrames(frame, "frame");
  requireFrames(durationInFrames, "durationInFrames");
  requireFrames(fadeFrames, "fadeFrames");
  requireVolume(volume, "volume");
  if (durationInFrames <= 0) throw new Error("durationInFrames must be positive.");
  const fade = Math.min(fadeFrames, Math.floor(durationInFrames / 2));
  if (fade === 0) return volume;
  if (frame < fade) return interpolate(frame, [0, fade], [0, volume]);
  if (frame > durationInFrames - fade) {
    return interpolate(frame, [durationInFrames - fade, durationInFrames], [volume, 0], {
      extrapolateRight: "clamp",
    });
  }
  return volume;
};

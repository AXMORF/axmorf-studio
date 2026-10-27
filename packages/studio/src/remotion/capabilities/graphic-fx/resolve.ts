import { random } from "remotion";

/**
 * Stateless resolvers behind the graphic treatments. Every value is a pure
 * function of the frame and authored inputs, so any frame renders identically.
 */

const assertFiniteFrame = (frame: number, owner: string) => {
  if (!Number.isFinite(frame))
    throw new Error(`${owner} frame must be finite.`);
};

const assertIncreasingFrames = (frames: readonly number[], owner: string) => {
  frames.forEach((frame, index) => {
    if (!Number.isInteger(frame) || frame < 0) {
      throw new Error(`${owner} frames must be non-negative integers.`);
    }
    if (index > 0 && frame <= frames[index - 1]!) {
      throw new Error(`${owner} frames must be strictly increasing.`);
    }
  });
};

const hexPattern = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/iu;

/** Parses #rgb or #rrggbb into 0–1 channels. */
export const parseProducerHexColor = (
  color: string,
): readonly [number, number, number] => {
  if (!hexPattern.test(color)) {
    throw new Error(`Color ${color} must be #rgb or #rrggbb.`);
  }
  const digits =
    color.length === 4
      ? [...color.slice(1)].map((digit) => digit + digit)
      : [color.slice(1, 3), color.slice(3, 5), color.slice(5, 7)];
  const [red, green, blue] = digits.map(
    (pair) => Number.parseInt(pair, 16) / 255,
  );
  return [red!, green!, blue!];
};

export type ProducerGradientMapTables = {
  readonly red: string;
  readonly green: string;
  readonly blue: string;
};

/**
 * Converts dark → light color stops into feComponentTransfer tables, so a
 * luminance image is recolored like a gradient map (duotone or false color).
 */
export const resolveProducerGradientMapTables = (
  stops: readonly string[],
): ProducerGradientMapTables => {
  if (stops.length < 2 || stops.length > 8) {
    throw new Error("Gradient map needs between 2 and 8 color stops.");
  }
  const channels = stops.map(parseProducerHexColor);
  const table = (channel: 0 | 1 | 2) =>
    channels.map((color) => Number(color[channel].toFixed(4))).join(" ");
  return { red: table(0), green: table(1), blue: table(2) };
};

export type ProducerGlitchSlice = {
  /** Top edge and height as fractions of the treated box. */
  readonly top: number;
  readonly height: number;
  readonly offsetPx: number;
  /** Tint for the displaced strip; null keeps the source colors. */
  readonly tint: "red" | "cyan" | null;
};

export type ProducerGlitchOptions = {
  readonly frame: number;
  readonly seed: number | string;
  /** 0 disables the glitch; 1 is the strongest tear. */
  readonly intensity: number;
  readonly slices?: number;
  readonly maxOffsetPx?: number;
  /** Frames each random tear pattern is held, like a stepped animation. */
  readonly holdFrames?: number;
};

/** Deterministic horizontal tears; the pattern changes every holdFrames. */
export const resolveProducerGlitchSlices = ({
  frame,
  seed,
  intensity,
  slices = 6,
  maxOffsetPx = 80,
  holdFrames = 2,
}: ProducerGlitchOptions): readonly ProducerGlitchSlice[] => {
  assertFiniteFrame(frame, "Glitch");
  if (!Number.isFinite(intensity) || intensity < 0 || intensity > 1) {
    throw new Error("Glitch intensity must be between 0 and 1.");
  }
  if (!Number.isInteger(slices) || slices < 1 || slices > 24) {
    throw new Error("Glitch slices must be an integer between 1 and 24.");
  }
  if (!Number.isInteger(holdFrames) || holdFrames < 1) {
    throw new Error("Glitch holdFrames must be a positive integer.");
  }
  if (intensity === 0) return [];
  const step = Math.floor(frame / holdFrames);
  return Array.from({ length: slices }, (_, index) => {
    const value = (name: string) => random(`${seed}-${step}-${index}-${name}`);
    const height = (0.015 + value("height") * 0.1) * (0.5 + intensity / 2);
    const top = value("top") * (1 - height);
    const direction = value("direction") < 0.5 ? -1 : 1;
    const tint = value("tint");
    return {
      top,
      height,
      offsetPx:
        direction * maxOffsetPx * intensity * (0.25 + value("offset") * 0.75),
      tint: tint < 0.3 ? "red" : tint < 0.6 ? "cyan" : null,
    };
  });
};

/**
 * Glitch strength inside beat-aligned bursts: full on the burst frame, then
 * decaying to zero. Without bursts the authored intensity holds everywhere.
 */
export const resolveProducerBurstIntensity = ({
  frame,
  intensity,
  bursts,
  burstFrames = 6,
}: {
  readonly frame: number;
  readonly intensity: number;
  readonly bursts?: readonly number[];
  readonly burstFrames?: number;
}): number => {
  assertFiniteFrame(frame, "Burst");
  if (!Number.isInteger(burstFrames) || burstFrames < 1) {
    throw new Error("Glitch burstFrames must be a positive integer.");
  }
  if (bursts === undefined) return intensity;
  assertIncreasingFrames(bursts, "Glitch burst");
  let strongest = 0;
  for (const burst of bursts) {
    const elapsed = frame - burst;
    if (elapsed >= 0 && elapsed < burstFrames) {
      strongest = Math.max(strongest, 1 - elapsed / burstFrames);
    }
  }
  return intensity * strongest;
};

/** Opacity of a flash frame that peaks on each cut and decays linearly. */
export const resolveProducerFlashOpacity = ({
  frame,
  frames,
  decayFrames = 6,
  peak = 1,
}: {
  readonly frame: number;
  readonly frames: readonly number[];
  readonly decayFrames?: number;
  readonly peak?: number;
}): number => {
  assertFiniteFrame(frame, "Flash");
  assertIncreasingFrames(frames, "Flash");
  if (!Number.isInteger(decayFrames) || decayFrames < 1) {
    throw new Error("Flash decayFrames must be a positive integer.");
  }
  if (!Number.isFinite(peak) || peak < 0 || peak > 1) {
    throw new Error("Flash peak must be between 0 and 1.");
  }
  let opacity = 0;
  for (const flash of frames) {
    const elapsed = frame - flash;
    if (elapsed >= 0 && elapsed < decayFrames) {
      opacity = Math.max(opacity, peak * (1 - elapsed / decayFrames));
    }
  }
  return opacity;
};

/**
 * Picks cut frames from a music grid (beatFrames, barFrames, …) inside
 * [fromFrame, toFrame), keeping every Nth grid frame.
 */
export const selectProducerCutFrames = ({
  grid,
  fromFrame,
  toFrame,
  every = 1,
}: {
  readonly grid: readonly number[];
  readonly fromFrame: number;
  readonly toFrame: number;
  readonly every?: number;
}): readonly number[] => {
  if (!Number.isInteger(every) || every < 1) {
    throw new Error("Cut selection every must be a positive integer.");
  }
  if (!(toFrame > fromFrame)) {
    throw new Error("Cut selection toFrame must be after fromFrame.");
  }
  return grid
    .filter((frame) => frame >= fromFrame && frame < toFrame)
    .filter((_, index) => index % every === 0);
};

export type ProducerBeatCut = {
  readonly index: number;
  readonly startFrame: number;
  readonly endFrame: number;
};

/** Splits [cutFrames[0], endFrame) into consecutive shots, one per cut. */
export const resolveProducerBeatCuts = ({
  cutFrames,
  endFrame,
  minShotFrames = 3,
}: {
  readonly cutFrames: readonly number[];
  readonly endFrame: number;
  readonly minShotFrames?: number;
}): readonly ProducerBeatCut[] => {
  if (cutFrames.length === 0) {
    throw new Error("Beat cuts need at least one cut frame.");
  }
  assertIncreasingFrames(cutFrames, "Beat cut");
  if (!Number.isInteger(endFrame) || endFrame <= cutFrames.at(-1)!) {
    throw new Error("Beat cut endFrame must be an integer after the last cut.");
  }
  return cutFrames.map((startFrame, index) => {
    const end = cutFrames[index + 1] ?? endFrame;
    if (end - startFrame < minShotFrames) {
      throw new Error(
        `Beat cut at frame ${startFrame} lasts ${end - startFrame} frames; shots need at least ${minShotFrames}.`,
      );
    }
    return { index, startFrame, endFrame: end };
  });
};

/** SVG ids must be valid CSS url() fragments; React ids contain colons. */
export const toProducerSvgId = (prefix: string, reactId: string) =>
  `${prefix}-${reactId.replace(/[^a-zA-Z0-9_-]/gu, "")}`;

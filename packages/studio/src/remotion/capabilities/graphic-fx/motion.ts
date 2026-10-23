import { random } from "remotion";

/**
 * Stateless resolvers for limited animation and beat-driven camera moves.
 * Every value is a pure function of the frame, so any frame renders alone.
 */

const assertFinite = (value: number, label: string) => {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite.`);
};

const assertSortedGrid = (grid: readonly number[], label: string) => {
  grid.forEach((frame, index) => {
    if (!Number.isFinite(frame) || (index > 0 && frame < grid[index - 1]!)) {
      throw new Error(`${label} frames must be finite and sorted.`);
    }
  });
};

/** Most recent grid entry at or before `frame`, or null before the first. */
export const findProducerLastHit = (
  frame: number,
  grid: readonly number[],
): { readonly index: number; readonly frame: number } | null => {
  assertFinite(frame, "Hit frame");
  assertSortedGrid(grid, "Hit grid");
  let index = -1;
  for (let i = 0; i < grid.length && grid[i]! <= frame; i++) index = i;
  return index < 0 ? null : { index, frame: grid[index]! };
};

export type ProducerDrawingTiming =
  | {
      /** Hold each drawing this many frames (2 = "on twos"), looping. */
      readonly holdFrames: number;
      readonly loop?: boolean;
    }
  | {
      /** Advance one drawing per grid hit (e.g. beatFrames), clamped. */
      readonly onFrames: readonly number[];
      readonly loop?: boolean;
    };

/**
 * Which drawing of a `count`-drawing sequence is showing at `frame`, either
 * held for a fixed number of frames or advanced on a musical grid.
 */
export const resolveProducerDrawing = (
  frame: number,
  count: number,
  timing: ProducerDrawingTiming,
): number => {
  assertFinite(frame, "Drawing frame");
  if (!Number.isInteger(count) || count < 1) {
    throw new Error("Drawing count must be a positive integer.");
  }
  let step: number;
  if ("holdFrames" in timing) {
    if (!Number.isInteger(timing.holdFrames) || timing.holdFrames < 1) {
      throw new Error("Drawing holdFrames must be a positive integer.");
    }
    step = Math.floor(Math.max(0, frame) / timing.holdFrames);
  } else {
    const hit = findProducerLastHit(frame, timing.onFrames);
    step = hit === null ? 0 : hit.index;
  }
  const loop = timing.loop ?? "holdFrames" in timing;
  return loop ? step % count : Math.min(step, count - 1);
};

export type ProducerBeatCameraState = {
  readonly scale: number;
  readonly x: number;
  readonly y: number;
};

/**
 * Camera that answers the drums: a zoom punch decaying after each `punches`
 * frame and a short seeded shake after each `shakes` frame.
 */
export const resolveProducerBeatCamera = ({
  frame,
  punches = [],
  shakes = [],
  punch = 0.03,
  shakePx = 8,
  decayFrames = 6,
  seed = "beat-camera",
}: {
  readonly frame: number;
  readonly punches?: readonly number[];
  readonly shakes?: readonly number[];
  readonly punch?: number;
  readonly shakePx?: number;
  readonly decayFrames?: number;
  readonly seed?: string;
}): ProducerBeatCameraState => {
  assertFinite(frame, "Beat camera frame");
  if (!Number.isFinite(punch) || punch < 0 || punch > 0.3) {
    throw new Error("Beat camera punch must be between 0 and 0.3.");
  }
  if (!Number.isFinite(shakePx) || shakePx < 0 || shakePx > 60) {
    throw new Error("Beat camera shakePx must be between 0 and 60.");
  }
  if (!Number.isInteger(decayFrames) || decayFrames < 1) {
    throw new Error("Beat camera decayFrames must be a positive integer.");
  }
  const decay = (hit: { frame: number } | null) => {
    if (hit === null) return 0;
    const t = (frame - hit.frame) / decayFrames;
    // Ease-out decay: full on the hit frame, gone after decayFrames.
    return t >= 1 ? 0 : (1 - t) * (1 - t);
  };
  const punchHit = findProducerLastHit(frame, punches);
  const shakeHit = findProducerLastHit(frame, shakes);
  const shake = decay(shakeHit) * shakePx;
  const jitter = (axis: string) =>
    shakeHit === null
      ? 0
      : (random(`${seed}-${axis}-${shakeHit.frame}-${frame}`) - 0.5) *
        2 *
        shake;
  return {
    scale: 1 + punch * decay(punchHit),
    x: jitter("x"),
    y: jitter("y"),
  };
};

/** Whip-pan entrance: offset (fraction of the width) and blur over `frames`. */
export const resolveProducerWhip = ({
  frame,
  frames = 5,
  direction = 1,
  distance = 0.35,
  blurPx = 28,
}: {
  readonly frame: number;
  readonly frames?: number;
  readonly direction?: 1 | -1;
  readonly distance?: number;
  readonly blurPx?: number;
}): { readonly offset: number; readonly blurPx: number } => {
  assertFinite(frame, "Whip frame");
  if (!Number.isInteger(frames) || frames < 1) {
    throw new Error("Whip frames must be a positive integer.");
  }
  const t = Math.min(1, Math.max(0, frame / frames));
  // Cubic ease-out: fast arrival, long settle.
  const remaining = (1 - t) ** 3;
  return {
    offset: direction * distance * remaining,
    blurPx: blurPx * remaining,
  };
};

export type ProducerSpeedLine = {
  readonly angle: number;
  /** Inner radius as a fraction of the frame diagonal. */
  readonly inner: number;
  /** Half-width at the outer end, as a fraction of the frame diagonal. */
  readonly spread: number;
};

/** Radial speed lines that redraw every `holdFrames`, like effects animation. */
export const resolveProducerSpeedLines = ({
  frame,
  seed,
  count = 64,
  holdFrames = 2,
  innerRadius = 0.28,
}: {
  readonly frame: number;
  readonly seed: string;
  readonly count?: number;
  readonly holdFrames?: number;
  readonly innerRadius?: number;
}): readonly ProducerSpeedLine[] => {
  assertFinite(frame, "Speed line frame");
  if (!Number.isInteger(count) || count < 1 || count > 240) {
    throw new Error("Speed line count must be an integer between 1 and 240.");
  }
  if (!Number.isInteger(holdFrames) || holdFrames < 1) {
    throw new Error("Speed line holdFrames must be a positive integer.");
  }
  const step = Math.floor(Math.max(0, frame) / holdFrames);
  return Array.from({ length: count }, (_, index) => {
    const value = (name: string) => random(`${seed}-${step}-${index}-${name}`);
    return {
      angle: value("angle") * Math.PI * 2,
      inner: innerRadius * (0.8 + value("inner") * 0.9),
      spread: 0.004 + value("spread") * 0.012,
    };
  });
};

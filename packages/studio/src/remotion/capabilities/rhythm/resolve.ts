import { random, spring, type SpringConfig } from "remotion";
import type { FilmTimingView } from "../../film/context";
import type { FilmMusicAccent } from "../../../contracts/film-score";
import type {
  ProducerWorldCameraState,
  ProducerWorldShot,
} from "../camera/world-camera";

/** Events must be sorted ascending; duplicates are allowed. O(log n). */
const lastIndexAtOrBefore = (frame: number, events: readonly number[]) => {
  let low = 0;
  let high = events.length;
  while (low < high) {
    const mid = low + Math.floor((high - low) / 2);
    if (events[mid] <= frame) low = mid + 1;
    else high = mid;
  }
  return low - 1;
};
export const lastAtOrBefore = (frame: number, events: readonly number[]) =>
  events[lastIndexAtOrBefore(frame, events)] ?? -Infinity;

export type BeatPulseOptions = Readonly<{ decayFrames?: number }>;
export const resolveBeatPulse = (
  frame: number,
  events: readonly number[],
  { decayFrames = 8 }: BeatPulseOptions = {},
) => {
  if (!Number.isFinite(decayFrames) || decayFrames <= 0)
    throw new Error("decayFrames must be positive.");
  const elapsed = frame - lastAtOrBefore(frame, events);
  return elapsed < 0 || elapsed > decayFrames
    ? 0
    : Math.exp((-3 * elapsed) / decayFrames);
};
export type BeatPulseEvents =
  | "kick"
  | "beat"
  | "bar"
  | "accent"
  | "fill"
  | "break"
  | readonly number[];
export const resolveBeatPulseEvents = (
  music: FilmTimingView["music"],
  events: BeatPulseEvents = "kick",
): readonly number[] => {
  if (typeof events !== "string") return events;
  if (!music) return [];
  if (events === "kick") return music.onsets?.kick ?? music.beatFrames;
  if (events === "accent" && music.onsets?.accents)
    return music.onsets.accents.map((event) => event.frame);
  if (events === "fill" || events === "break")
    return (
      music.onsets?.[events === "fill" ? "fills" : "breaks"]?.map(
        (event) => event.from,
      ) ?? []
    );
  return music[`${events}Frames`];
};
export const resolveNarrationActive = (
  frame: number,
  sentences: readonly Readonly<{ startFrame: number; endFrame: number }>[],
) => sentences.some((s) => frame >= s.startFrame && frame < s.endFrame);
/** L1 defaults: 1.2% during speech, 3.5% between sentences. Never apply to reading text. */
export const resolveBreathScale = (pulse: number, narrating: boolean) =>
  1 + (narrating ? 0.012 : 0.035) * Math.max(0, Math.min(1, pulse));

export type BarCameraShot = ProducerWorldCameraState;
export type BarCameraOptions = Readonly<{
  bars: readonly number[];
  shots: readonly BarCameraShot[];
  fps: number;
  config?: Partial<SpringConfig>;
}>;
const sameShot = (a: BarCameraShot, b: BarCameraShot) =>
  a.center[0] === b.center[0] &&
  a.center[1] === b.center[1] &&
  a.zoom === b.zoom;
/** Only actual steps count as L2; exhausted or identical shots are holds. */
export const barCameraChangeFrames = (
  bars: readonly number[],
  shots: readonly BarCameraShot[],
) =>
  bars.filter(
    (_, i) => i + 1 < shots.length && !sameShot(shots[i], shots[i + 1]),
  );
export const resolveBarCamera = (
  frame: number,
  { bars, shots, fps, config }: BarCameraOptions,
): ProducerWorldCameraState => {
  if (!shots.length) throw new Error("Bar camera needs at least one shot.");
  if (!Number.isFinite(fps) || fps <= 0)
    throw new Error("fps must be positive.");
  const index = lastIndexAtOrBefore(frame, bars);
  const from = shots[Math.min(Math.max(0, index), shots.length - 1)];
  const to = shots[Math.min(Math.max(0, index + 1), shots.length - 1)];
  if (index < 0 || sameShot(from, to)) return from;
  // Clamp camera travel so a spring cannot overshoot the world camera's zoom bounds.
  const p = Math.max(
    0,
    Math.min(
      1,
      spring({
        frame: frame - bars[index],
        fps,
        config: { damping: 18, stiffness: 120, ...config },
      }),
    ),
  );
  return {
    center: [
      from.center[0] + (to.center[0] - from.center[0]) * p,
      from.center[1] + (to.center[1] - from.center[1]) * p,
    ],
    zoom: from.zoom + (to.zoom - from.zoom) * p,
  };
};
/** Render with frame={1}. Keep the first shot as the parallax anchor across all frames. */
export const barCameraShots = (
  state: ProducerWorldCameraState,
  anchor: BarCameraShot,
): readonly ProducerWorldShot[] => [
  { frame: 0, ...anchor },
  { frame: 1, ...state },
];

export type ImpactOptions = Readonly<{ preFrames?: number }>;
export type ImpactEvents =
  | number
  | readonly number[]
  | readonly FilmMusicAccent[];
export const impactEventFrames = (at: ImpactEvents): readonly number[] =>
  typeof at === "number"
    ? [at]
    : typeof at[0] === "number" || at.length === 0
      ? (at as readonly number[])
      : (at as readonly FilmMusicAccent[]).map((event) => event.frame);
export type ImpactState = Readonly<{
  pre: number;
  hit: number;
  scale: number;
  shake: number;
}>;
/** Sorted event arrays: the next anticipation supersedes the previous rebound. */
export const resolveImpact = (
  frame: number,
  at: ImpactEvents,
  fps: number,
  { preFrames = 6 }: ImpactOptions = {},
): ImpactState => {
  if (!Number.isFinite(preFrames) || preFrames <= 0)
    throw new Error("preFrames must be positive.");
  if (!Number.isFinite(fps) || fps <= 0)
    throw new Error("fps must be positive.");
  const events = impactEventFrames(at);
  const index = lastIndexAtOrBefore(frame, events);
  const next = events[index + 1];
  const eventIndex =
    next !== undefined && frame >= next - preFrames ? index + 1 : index;
  const event = events[eventIndex];
  if (event === undefined || frame < event - preFrames)
    return { pre: 0, hit: 0, scale: 1, shake: 0 };
  const pre = Math.max(0, Math.min(1, (frame - event + preFrames) / preFrames));
  const elapsed = frame - event;
  const hit =
    elapsed < 0
      ? 0
      : spring({
          frame: elapsed,
          fps,
          config: { damping: 11, stiffness: 260, mass: 0.6 },
        });
  const entry = typeof at === "number" ? undefined : at[eventIndex];
  const strength = entry && typeof entry !== "number" ? entry.strength : 1;
  const scale = elapsed < 0 ? 1 - 0.04 * pre : 0.96 + 0.04 * hit;
  return {
    pre: pre * strength,
    hit: hit * strength,
    scale: strength === 1 ? scale : 1 + (scale - 1) * strength,
    shake:
      elapsed >= 0 && elapsed < 6
        ? (random(`impact-${event}-${frame}`) - 0.5) *
          14 *
          (1 - elapsed / 6) *
          strength
        : 0,
  };
};

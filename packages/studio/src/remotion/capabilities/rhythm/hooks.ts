import { useCurrentFrame, useVideoConfig } from "remotion";
import { useFilmTiming } from "../../film/context";
import { useReviewMotion } from "../../film/review-motion";
import { resolveBoilSeed, type BoilSeedOptions } from "./response";
import {
  barCameraChangeFrames,
  resolveBarCamera,
  resolveBeatPulse,
  resolveBreathScale,
  resolveBeatPulseEvents,
  resolveImpact,
  resolveNarrationActive,
  impactEventFrames,
  type BarCameraOptions,
  type BarCameraShot,
  type BeatPulseEvents,
  type BeatPulseOptions,
  type ImpactOptions,
  type ImpactEvents,
} from "./resolve";

/** Film-body clock. Call at Film root; inside a Sequence pass the root frame. */
export type RhythmFrameOptions = Readonly<{ frame?: number }>;
export const useBeatPulse = ({
  events = "kick",
  decayFrames,
  frame: frameOverride,
}: BeatPulseOptions &
  RhythmFrameOptions &
  Readonly<{ events?: BeatPulseEvents }> = {}) => {
  const frame = useCurrentFrame();
  const { music } = useFilmTiming();
  const selected = resolveBeatPulseEvents(music, events);
  useReviewMotion({ type: "rhythm", kind: "pulse", frames: [...selected] });
  return music === null
    ? 0
    : resolveBeatPulse(frameOverride ?? frame, selected, { decayFrames });
};
export const useNarrationActive = ({
  frame: frameOverride,
}: RhythmFrameOptions = {}) => {
  const frame = useCurrentFrame();
  const { sentences } = useFilmTiming();
  useReviewMotion({
    type: "rhythm",
    kind: "narration",
    frames: sentences.flatMap((s) => [s.startFrame, s.endFrame]),
  });
  return resolveNarrationActive(frameOverride ?? frame, sentences);
};
export const useBarCamera = (
  shots: readonly BarCameraShot[],
  {
    frame: frameOverride,
    config,
  }: RhythmFrameOptions & Pick<BarCameraOptions, "config"> = {},
) => {
  const frame = useCurrentFrame();
  const { music, fps } = useFilmTiming();
  const bars = music?.barFrames ?? [];
  useReviewMotion({
    type: "rhythm",
    kind: "bar-camera",
    frames: barCameraChangeFrames(bars, shots),
  });
  return resolveBarCamera(frameOverride ?? frame, { bars, shots, fps, config });
};
export const useImpact = (
  at: ImpactEvents,
  { frame: frameOverride, preFrames }: ImpactOptions & RhythmFrameOptions = {},
) => {
  const frame = useCurrentFrame();
  const { fps } = useFilmTiming();
  // Log the schedule, not just the sampled frame: sparse review must retain exact landings.
  useReviewMotion({
    type: "rhythm",
    kind: "impact",
    frames: [...impactEventFrames(at)],
  });
  return resolveImpact(frameOverride ?? frame, at, fps, { preFrames });
};

export const useBoilSeed = ({
  frame: frameOverride,
  ...options
}: Omit<BoilSeedOptions, "fps"> & RhythmFrameOptions = {}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return resolveBoilSeed(frameOverride ?? frame, { ...options, fps });
};

/** Report the actual object's action schedule, not every sampled animation frame.
 * Global scale/light can never be relabeled as object variety by changing a name. */
export const useRhythmResponse = ({
  object,
  kind,
  frames,
  scope = "object",
}: Readonly<{
  object: string;
  kind: string;
  frames: readonly number[];
  scope?: "object" | "global";
}>) => {
  useReviewMotion({
    type: "rhythm-response",
    object,
    kind,
    frames: [...frames],
    scope:
      object === "global" ||
      ["global-light", "global-scale", "breath-scale"].includes(kind)
        ? "global"
        : scope,
  });
};

/** Optional global breathing, explicitly identified for review. For a paper lift
 * report the named paper with useRhythmResponse instead of using this wrapper. */
export const useBreathScale = (
  options: BeatPulseOptions &
    RhythmFrameOptions &
    Readonly<{ events?: BeatPulseEvents }> = {},
) => {
  const pulse = useBeatPulse(options);
  const { music } = useFilmTiming();
  useRhythmResponse({
    object: "global",
    kind: "global-scale",
    frames: resolveBeatPulseEvents(music, options.events),
  });
  return resolveBreathScale(pulse);
};

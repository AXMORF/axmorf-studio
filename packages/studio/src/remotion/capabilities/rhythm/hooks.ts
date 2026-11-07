import { useCurrentFrame } from "remotion";
import { useFilmTiming } from "../../film/context";
import { useReviewMotion } from "../../film/review-motion";
import {
  barCameraChangeFrames,
  resolveBarCamera,
  resolveBeatPulse,
  resolveBeatPulseEvents,
  resolveImpact,
  resolveNarrationActive,
  type BarCameraOptions,
  type BarCameraShot,
  type BeatPulseEvents,
  type BeatPulseOptions,
  type ImpactOptions,
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
  at: number | readonly number[],
  { frame: frameOverride, preFrames }: ImpactOptions & RhythmFrameOptions = {},
) => {
  const frame = useCurrentFrame();
  const { fps } = useFilmTiming();
  // Log the schedule, not just the sampled frame: sparse review must retain exact landings.
  useReviewMotion({
    type: "rhythm",
    kind: "impact",
    frames: typeof at === "number" ? [at] : [...at],
  });
  return resolveImpact(frameOverride ?? frame, at, fps, { preFrames });
};

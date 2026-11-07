import type { ReactNode } from "react";

import { getProducerTransitionSfxRole } from "../capabilities/sound/transition-sfx";
import type { FilmRuntime } from "./context";
import type {
  FilmSoundEffectCue,
  FilmSoundEffectSource,
} from "./FilmSoundEffects";

export const FILM_OVERLAY_TRANSITIONS = [
  "light-leak",
  "flash",
  "whip-blur",
  "mask-wipe",
] as const;
export const FILM_OVERLAP_TRANSITIONS = [
  "fade",
  "slide",
  "wipe",
  "iris",
  "zoom-blur",
  "linear-blur",
  "cross-zoom",
  "match-scale",
] as const;
export type FilmSceneTransitionKind =
  | (typeof FILM_OVERLAY_TRANSITIONS)[number]
  | (typeof FILM_OVERLAP_TRANSITIONS)[number];
export type FilmScene = Readonly<{
  id: string;
  from: string | number;
  chapter?: string;
  /** Body-absolute frame minus nominal boundary, clamped to 0 during early overlap.
   * The early overlap holds frame 0; at the nominal boundary the clock starts.
   * Children using useCurrentFrame() instead read TransitionSeries sequence time. */
  render: (localFrame: number) => ReactNode;
  enter?: Readonly<{
    kind: FilmSceneTransitionKind;
    frames: number;
    sfx?: FilmSoundEffectSource | false;
    /** Color of the feathered mask-wipe light band; ignored by other kinds. */
    tint?: string;
  }>;
}>;
export type ResolvedFilmSceneTransition = Readonly<{
  kind: FilmSceneTransitionKind;
  mode: "overlay" | "overlap";
  boundaryFrame: number;
  startFrame: number;
  endFrame: number;
  frames: number;
  tint?: string;
}>;
export type ResolvedFilmScene = Readonly<{
  scene: FilmScene;
  boundaryFrame: number;
  startFrame: number;
  endFrame: number;
  durationInFrames: number;
  enter: ResolvedFilmSceneTransition | null;
}>;

/** Inverts TransitionSeries' overlap subtraction; all coordinates are body-local. */
export const resolveFilmSceneTrack = (
  film: Pick<FilmRuntime, "durationInFrames" | "timing">,
  scenes: readonly FilmScene[],
) => {
  const duration = film.durationInFrames;
  if (!Number.isSafeInteger(duration) || duration <= 0 || scenes.length === 0)
    throw new Error("Scene track needs a positive body duration and scenes.");
  const ids = new Set<string>();
  const boundaries = scenes.map((scene) => {
    if (!scene.id.trim() || ids.has(scene.id))
      throw new Error("Scene IDs must be non-empty and unique.");
    ids.add(scene.id);
    const frame =
      typeof scene.from === "number"
        ? scene.from
        : film.timing?.sentences.find(({ id }) => id === scene.from)
            ?.startFrame;
    if (frame === undefined)
      throw new Error(`No sentence timing for ${scene.from}.`);
    if (!Number.isSafeInteger(frame) || frame < 0 || frame >= duration)
      throw new Error("Scene boundary is outside the film body.");
    return frame;
  });
  if (boundaries.some((frame, i) => i > 0 && frame <= boundaries[i - 1]))
    throw new Error("Scene boundaries must increase.");
  // The first authored anchor may be the first spoken sentence; the picture fills the lead-in.
  boundaries[0] = 0;
  let previousEnd = 0;
  const transitions = scenes.map(
    (scene, i): ResolvedFilmSceneTransition | null => {
      if (!scene.enter) return null;
      if (i === 0)
        throw new Error("The first scene cannot have an enter transition.");
      const { kind, frames } = scene.enter;
      const overlay = FILM_OVERLAY_TRANSITIONS.includes(
        kind as (typeof FILM_OVERLAY_TRANSITIONS)[number],
      );
      if (
        !overlay &&
        !FILM_OVERLAP_TRANSITIONS.includes(
          kind as (typeof FILM_OVERLAP_TRANSITIONS)[number],
        )
      )
        throw new Error(`Unknown scene transition: ${kind}.`);
      if (!Number.isSafeInteger(frames) || frames <= 0)
        throw new Error("Transition frames must be positive integers.");
      const boundaryFrame = boundaries[i];
      const startFrame = boundaryFrame - Math.floor(frames / 2);
      const endFrame = boundaryFrame + Math.ceil(frames / 2);
      const before = boundaryFrame - boundaries[i - 1];
      const after = (boundaries[i + 1] ?? duration) - boundaryFrame;
      if (startFrame < 0 || endFrame > duration)
        throw new Error("Transition exceeds the film body.");
      if (frames > before / 2 || frames > after / 2)
        throw new Error("Transition exceeds half an adjacent scene.");
      if (startFrame < previousEnd)
        throw new Error("Transition windows overlap.");
      previousEnd = endFrame;
      return {
        kind,
        mode: overlay ? "overlay" : "overlap",
        boundaryFrame,
        startFrame,
        endFrame,
        frames,
        ...(kind === "mask-wipe" && scene.enter.tint !== undefined
          ? { tint: scene.enter.tint }
          : {}),
      };
    },
  );
  const resolved: ResolvedFilmScene[] = scenes.map((scene, i) => {
    const enter = transitions[i];
    const next = transitions[i + 1];
    const startFrame =
      enter?.mode === "overlap" ? enter.startFrame : boundaries[i];
    const endFrame =
      next?.mode === "overlap"
        ? next.endFrame
        : (boundaries[i + 1] ?? duration);
    return {
      scene,
      boundaryFrame: boundaries[i],
      startFrame,
      endFrame,
      durationInFrames: endFrame - startFrame,
      enter,
    };
  });
  const sfxCues: FilmSoundEffectCue[] = resolved.flatMap(({ scene, enter }) =>
    enter === null || scene.enter?.sfx === false
      ? []
      : [
          {
            frame: enter.boundaryFrame,
            sfx: scene.enter?.sfx ?? getProducerTransitionSfxRole(enter.kind),
            for: `Scene ${scene.id}: ${enter.kind}`,
          },
        ],
  );
  return { scenes: resolved, durationInFrames: duration, sfxCues };
};

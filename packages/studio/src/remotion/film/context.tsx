import { createContext, useContext, useMemo, type ReactNode } from "react";

import {
  FilmMusicSchema,
  FilmSpecSchema,
  FilmTimingSchema,
  type FilmMusic,
  type FilmSpec,
  type FilmTiming,
} from "../../contracts/film";

export type FilmRuntime = Readonly<{
  spec: FilmSpec;
  /** Null until `film:voice` has generated timing for this film. */
  timing: FilmTiming | null;
  /** Null when the film has no score or `film:music` has not run yet. */
  music: FilmMusic | null;
  durationInFrames: number;
}>;

const FilmContext = createContext<FilmRuntime | null>(null);

/** Length used before timing exists, so a fresh film still opens in Studio. */
const PLACEHOLDER_DURATION_SECONDS = 10;

export const resolveFilmRuntime = (input: {
  readonly spec: unknown;
  readonly timing: unknown;
  readonly music: unknown;
}): FilmRuntime => {
  const spec = FilmSpecSchema.parse(input.spec);
  const timing =
    input.timing === null ? null : FilmTimingSchema.parse(input.timing);
  const music =
    input.music === null || spec.music === null
      ? null
      : FilmMusicSchema.parse(input.music);
  for (const generated of [timing, music]) {
    if (generated !== null && generated.filmId !== spec.filmId) {
      throw new Error(`Generated files belong to ${generated.filmId}.`);
    }
  }
  const durationInFrames =
    timing?.durationInFrames ??
    spec.timeline.durationInFrames ??
    spec.render.fps * PLACEHOLDER_DURATION_SECONDS;
  return { spec, timing, music, durationInFrames };
};

export const FilmProvider = ({
  runtime,
  children,
}: {
  readonly runtime: FilmRuntime;
  readonly children: ReactNode;
}) => <FilmContext.Provider value={runtime}>{children}</FilmContext.Provider>;

export const useFilm = (): FilmRuntime => {
  const runtime = useContext(FilmContext);
  if (runtime === null) {
    throw new Error("useFilm must be used inside a registered film.");
  }
  return runtime;
};

export type FilmSentenceTiming = FilmTiming["sentences"][number];

/**
 * Frame-level timing for authoring: when each narration sentence is spoken and
 * where the score's beats, bars, sections, and accents land. All values are
 * absolute frames of the film Composition.
 */
export const useFilmTiming = () => {
  const { spec, timing, music, durationInFrames } = useFilm();
  return useMemo(() => {
    const sentences = timing?.sentences ?? [];
    const byId = new Map(sentences.map((sentence) => [sentence.id, sentence]));
    return {
      fps: spec.render.fps,
      durationInFrames,
      narrationStartFrame:
        timing?.narrationStartFrame ?? spec.timeline.narrationStartFrame,
      narrationEndFrame: timing?.narrationEndFrame ?? null,
      sentences,
      /** Timing of one sentence by its film.json id. */
      sentence: (id: string): FilmSentenceTiming => {
        const found = byId.get(id);
        if (found === undefined) {
          throw new Error(
            timing === null
              ? "Run film:voice before reading sentence timing."
              : `film.json has no sentence ${id}.`,
          );
        }
        return found;
      },
      music:
        music === null
          ? null
          : {
              bpm: music.bpm,
              beatsPerBar: music.beatsPerBar,
              framesPerBeat: (60 * spec.render.fps) / music.bpm,
              beatFrames: music.beatFrames,
              barFrames: music.barFrames,
              sectionFrames: music.sectionFrames,
              accentFrames: music.accentFrames,
            },
    } as const;
  }, [spec, timing, music, durationInFrames]);
};

export type FilmTimingView = ReturnType<typeof useFilmTiming>;

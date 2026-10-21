import type { ComponentType } from "react";
import {
  AbsoluteFill,
  Composition,
  Folder,
  Freeze,
  Still,
  useCurrentFrame,
} from "remotion";
import { z } from "zod";

import {
  FILM_CONTACT_SHEET_ID,
  FILM_COVER_VARIANTS,
  filmCompositionIds,
} from "../../contracts/film";
import {
  ContactSheet,
  ContactSheetPropsSchema,
  resolveContactSheetSize,
  type ContactSheetProps,
} from "./ContactSheet";
import type { SceneTemplateAudioProjection } from "../capabilities/scene-templates/template-audio";
import { FilmWithBookends } from "./FilmBookends";
import { FilmProvider, resolveFilmRuntime, type FilmRuntime } from "./context";
import { ReviewMeasure } from "./review-measure";

type FilmModule = Promise<{ default: ComponentType }>;

/** One entry of the Workspace-generated `src/films/index.ts`. */
export type FilmRegistryEntry = Readonly<{
  spec: unknown;
  timing: unknown;
  music: unknown;
  film: () => FilmModule;
  cover: () => FilmModule;
}>;

const ReviewPropsSchema = z.object({
  frames: z.array(z.number().int().min(0)).min(1),
});
type ReviewProps = z.infer<typeof ReviewPropsSchema>;

const provide = (runtime: FilmRuntime, load: () => FilmModule) => async () => {
  const { default: Authored } = await load();
  const Provided = () => (
    <FilmProvider runtime={runtime}>
      <Authored />
    </FilmProvider>
  );
  return { default: Provided };
};

/** The delivered film: system intro, the authored body, system outro. */
const filmLoader =
  (
    runtime: FilmRuntime,
    load: () => FilmModule,
    audioProjection: SceneTemplateAudioProjection,
  ) =>
  async () => {
    const { default: Authored } = await load();
    const Delivered = () => (
      <FilmProvider runtime={runtime}>
        <FilmWithBookends
          runtime={runtime}
          audioProjection={audioProjection}
          body={<Authored />}
        />
      </FilmProvider>
    );
    return { default: Delivered };
  };

/** Shows each requested film frame once, so a review renders in one pass. */
const reviewLoader =
  (runtime: FilmRuntime, load: () => FilmModule) => async () => {
    const { default: Authored } = await load();
    const Review = (props: Record<string, unknown>) => {
      const { frames } = ReviewPropsSchema.parse(props);
      const index = useCurrentFrame();
      const frame = frames[Math.min(index, frames.length - 1)] ?? 0;
      return (
        <FilmProvider runtime={runtime}>
          <ReviewMeasure key={index} index={index} frame={frame}>
            <Freeze frame={frame}>
              <Authored />
            </Freeze>
          </ReviewMeasure>
        </FilmProvider>
      );
    };
    return { default: Review };
  };

const invalidFilmId = (entry: FilmRegistryEntry, index: number) => {
  const raw = (entry.spec as { filmId?: unknown } | null)?.filmId;
  const name =
    typeof raw === "string" && /^[a-z0-9-]+$/u.test(raw)
      ? raw
      : `film-${index}`;
  return `${name}--invalid`;
};

const InvalidFilm = ({ message }: { readonly message: string }) => (
  <AbsoluteFill
    style={{
      backgroundColor: "#450a0a",
      color: "#fef2f2",
      padding: 60,
      fontFamily: "Menlo, monospace",
      fontSize: 32,
      whiteSpace: "pre-wrap",
    }}
  >
    {`This film cannot be registered:\n\n${message}`}
  </AbsoluteFill>
);

const contactSheetDefaults: ContactSheetProps = {
  cells: [{ image: "assets/axmorf-shared/brand/axmorf-mark.svg", label: "" }],
  columns: 1,
  cellWidth: 400,
  cellHeight: 400,
};

export const FilmCompositions = ({
  films,
  audioProjection,
}: {
  readonly films: readonly FilmRegistryEntry[];
  readonly audioProjection: SceneTemplateAudioProjection;
}) => (
  <Folder name="Films">
    <Still
      id={FILM_CONTACT_SHEET_ID}
      component={ContactSheet}
      width={480}
      height={480}
      defaultProps={contactSheetDefaults}
      calculateMetadata={({ props }) =>
        resolveContactSheetSize(ContactSheetPropsSchema.parse(props))
      }
    />
    {films.map((entry, index) => {
      let runtime: FilmRuntime;
      try {
        runtime = resolveFilmRuntime(entry);
      } catch (error) {
        // One broken film.json must not take Studio and every other film down.
        const id = invalidFilmId(entry, index);
        const message = error instanceof Error ? error.message : String(error);
        return (
          <Still
            key={id}
            id={id}
            component={() => <InvalidFilm message={message} />}
            width={1080}
            height={1080}
          />
        );
      }
      const { filmId, render } = runtime.spec;
      const ids = filmCompositionIds(filmId);
      const reviewDefaults: ReviewProps = { frames: [0] };
      return (
        <Folder key={filmId} name={filmId}>
          <Composition
            id={ids.film}
            lazyComponent={filmLoader(runtime, entry.film, audioProjection)}
            durationInFrames={runtime.totalDurationInFrames}
            fps={render.fps}
            width={render.width}
            height={render.height}
          />
          {/* As long as the body, so a frozen frame is never clamped; the CLI
              renders only the first frames.length frames of it. Review covers
              the authored body; the system bookends are not authored. */}
          <Composition
            id={ids.review}
            lazyComponent={reviewLoader(runtime, entry.film)}
            durationInFrames={runtime.durationInFrames}
            fps={render.fps}
            width={render.width}
            height={render.height}
            defaultProps={reviewDefaults}
          />
          {FILM_COVER_VARIANTS.map(({ variant, width, height }) => (
            <Still
              key={variant}
              id={variant === "4x3" ? ids.cover4x3 : ids.cover3x4}
              lazyComponent={provide(runtime, entry.cover)}
              width={width}
              height={height}
            />
          ))}
        </Folder>
      );
    })}
  </Folder>
);

import type { ReactElement } from "react";
import { LightLeak } from "@remotion/light-leaks";
import {
  linearTiming,
  TransitionSeries,
  type TransitionPresentationComponentProps,
} from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { iris } from "@remotion/transitions/iris";
import { zoomBlur } from "@remotion/transitions/zoom-blur";
import { linearBlur } from "@remotion/transitions/linear-blur";
import { crossZoom } from "@remotion/transitions/cross-zoom";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";

import { useFilm } from "./context";
import {
  resolveFilmSceneTrack,
  type FilmScene,
  type ResolvedFilmScene,
  type ResolvedFilmSceneTransition,
} from "./scene-track";

import { useReviewMotion } from "./review-motion";

export type FilmSceneTrackProps = Readonly<{ scenes: readonly FilmScene[] }>;

const SceneContent = ({
  resolved,
}: {
  readonly resolved: ResolvedFilmScene;
}) => {
  const frame = useCurrentFrame();
  return (
    <>
      {resolved.scene.render(
        Math.max(0, frame + resolved.startFrame - resolved.boundaryFrame),
      )}
    </>
  );
};

const MatchScale = ({
  children,
  presentationProgress: p,
  presentationDirection: direction,
}: TransitionPresentationComponentProps<Record<string, never>>) => (
  <AbsoluteFill style={{ overflow: "hidden" }}>
    <AbsoluteFill
      style={{
        transform: `scale(${direction === "exiting" ? 1 + p * 0.6 : 0.72 + p * 0.28})`,
        opacity: direction === "exiting" ? 1 : p,
      }}
    >
      {children}
    </AbsoluteFill>
  </AbsoluteFill>
);

const SceneOverlay = ({
  sceneTransition,
}: {
  readonly sceneTransition: ResolvedFilmSceneTransition;
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const p = frame / Math.max(1, sceneTransition.frames - 1);
  const envelope = Math.sin(Math.PI * p);
  if (sceneTransition.kind === "light-leak")
    return <LightLeak durationInFrames={sceneTransition.frames} seed={17} />;
  if (sceneTransition.kind === "mask-wipe")
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <path
          d={`M ${-width + p * width * 3} 0 l ${width * 0.65} 0 l ${-width * 0.35} ${height} l ${-width * 0.65} 0 Z`}
          fill="#e6f8ff"
        />
      </svg>
    );
  if (sceneTransition.kind === "whip-blur")
    return (
      <AbsoluteFill
        style={{
          backdropFilter: `blur(${envelope * 22}px)`,
          background: `linear-gradient(100deg, transparent, rgba(225,246,255,${envelope * 0.9}), transparent)`,
          transform: `translateX(${(p - 0.5) * 60}%) skewX(-18deg)`,
        }}
      />
    );
  return (
    <AbsoluteFill style={{ backgroundColor: "white", opacity: envelope }} />
  );
};

const transitionElement = (
  sceneTransition: ResolvedFilmSceneTransition,
  width: number,
  height: number,
): ReactElement => {
  const timing = linearTiming({ durationInFrames: sceneTransition.frames });
  const key = `enter:${sceneTransition.boundaryFrame}`;
  switch (sceneTransition.kind) {
    case "fade":
      return (
        <TransitionSeries.Transition
          key={key}
          timing={timing}
          presentation={fade()}
        />
      );
    case "slide":
      return (
        <TransitionSeries.Transition
          key={key}
          timing={timing}
          presentation={slide()}
        />
      );
    case "wipe":
      return (
        <TransitionSeries.Transition
          key={key}
          timing={timing}
          presentation={wipe()}
        />
      );
    case "iris":
      return (
        <TransitionSeries.Transition
          key={key}
          timing={timing}
          presentation={iris({ width, height })}
        />
      );
    case "zoom-blur":
      return (
        <TransitionSeries.Transition
          key={key}
          timing={timing}
          presentation={zoomBlur({})}
        />
      );
    case "linear-blur":
      return (
        <TransitionSeries.Transition
          key={key}
          timing={timing}
          presentation={linearBlur({})}
        />
      );
    case "cross-zoom":
      return (
        <TransitionSeries.Transition
          key={key}
          timing={timing}
          presentation={crossZoom({})}
        />
      );
    case "match-scale":
      return (
        <TransitionSeries.Transition
          key={key}
          timing={timing}
          presentation={{ component: MatchScale, props: {} }}
        />
      );
    default:
      return (
        <TransitionSeries.Overlay
          key={key}
          durationInFrames={sceneTransition.frames}
        >
          <SceneOverlay sceneTransition={sceneTransition} />
        </TransitionSeries.Overlay>
      );
  }
};

/** Visuals only. Feed resolver.sfxCues into FilmSoundEffects to opt into sound. */
export const FilmSceneTrack = ({ scenes }: FilmSceneTrackProps) => {
  const film = useFilm();
  const { width, height } = useVideoConfig();
  const resolved = resolveFilmSceneTrack(film, scenes);
  useReviewMotion({
    type: "scene-track",
    scenes: resolved.scenes.map((scene, i) => ({
      id: scene.scene.id,
      chapter: scene.scene.chapter ?? null,
      boundaryFrame: scene.boundaryFrame,
      endFrame: resolved.scenes[i + 1]?.boundaryFrame ?? film.durationInFrames,
      enter:
        scene.enter === null
          ? null
          : {
              kind: scene.enter.kind,
              mode: scene.enter.mode,
              startFrame: scene.enter.startFrame,
              endFrame: scene.enter.endFrame,
            },
    })),
  });
  return (
    <TransitionSeries>
      {resolved.scenes.flatMap((scene) => [
        ...(scene.enter === null
          ? []
          : [transitionElement(scene.enter, width, height)]),
        <TransitionSeries.Sequence
          key={scene.scene.id}
          name={scene.scene.id}
          durationInFrames={scene.durationInFrames}
        >
          <SceneContent resolved={scene} />
        </TransitionSeries.Sequence>,
      ])}
    </TransitionSeries>
  );
};

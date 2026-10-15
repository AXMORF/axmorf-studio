import { useMemo, type ReactNode } from "react";
import {
  AbsoluteFill,
  Html5Audio,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import { VISUAL_THEME_PRESETS } from "../../contracts/visual-theme";
import {
  AxmorfIntroScene,
  AxmorfOutroScene,
} from "../capabilities/scene-templates/axmorf";
import type { SceneTemplateAudioProjection } from "../capabilities/scene-templates/template-audio";
import { buildSceneTemplatePreviewSpecs } from "../compositions/scene-template-previews/SceneTemplatePreviews";
import type { FilmRuntime } from "./context";

const TEMPLATE_FPS = 30;

/**
 * One system bookend. The templates are timed at 30 fps; other film rates map
 * their frame clock and audio cue onto the same seconds.
 */
const FilmBookend = ({
  kind,
  runtime,
  audioProjection,
}: {
  readonly kind: "intro" | "outro";
  readonly runtime: FilmRuntime;
  readonly audioProjection: SceneTemplateAudioProjection;
}) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const bookends = runtime.spec.bookends!;
  const theme = VISUAL_THEME_PRESETS[bookends.theme];
  const audio = useMemo(
    () => buildSceneTemplatePreviewSpecs(audioProjection)[kind].audio,
    [audioProjection, kind],
  );
  const toFilm = (templateFrames: number) =>
    Math.round((templateFrames * fps) / TEMPLATE_FPS);
  const sceneFrame = Math.floor((frame * TEMPLATE_FPS) / fps);
  return (
    <AbsoluteFill style={{ background: theme.background, overflow: "hidden" }}>
      {kind === "intro" ? (
        <AxmorfIntroScene
          sceneFrame={sceneFrame}
          width={width}
          height={height}
          theme={theme}
        />
      ) : (
        <AxmorfOutroScene
          sceneFrame={sceneFrame}
          width={width}
          height={height}
          theme={theme}
          sourceReferences={bookends.sources}
        />
      )}
      {audio === null ? null : (
        <Sequence
          from={toFilm(audio.startFrame)}
          durationInFrames={Math.max(1, toFilm(audio.durationInFrames))}
        >
          <Html5Audio
            src={staticFile(audio.publicPath.slice("public/".length))}
            volume={() => audio.volume}
            pauseWhenBuffering
          />
        </Sequence>
      )}
    </AbsoluteFill>
  );
};

/** Places the system intro, the authored body and the system outro in order. */
export const FilmWithBookends = ({
  runtime,
  audioProjection,
  body,
}: {
  readonly runtime: FilmRuntime;
  readonly audioProjection: SceneTemplateAudioProjection;
  readonly body: ReactNode;
}) => {
  const { introFrames, outroFrames, durationInFrames } = runtime;
  return (
    <AbsoluteFill>
      {introFrames > 0 ? (
        <Sequence durationInFrames={introFrames} name="System intro">
          <FilmBookend
            kind="intro"
            runtime={runtime}
            audioProjection={audioProjection}
          />
        </Sequence>
      ) : null}
      <Sequence
        from={introFrames}
        durationInFrames={durationInFrames}
        name="Film body"
      >
        {body}
      </Sequence>
      {outroFrames > 0 ? (
        <Sequence
          from={introFrames + durationInFrames}
          durationInFrames={outroFrames}
          name="System outro"
        >
          <FilmBookend
            kind="outro"
            runtime={runtime}
            audioProjection={audioProjection}
          />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};

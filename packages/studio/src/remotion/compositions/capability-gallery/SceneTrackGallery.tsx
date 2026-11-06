import { AbsoluteFill } from "remotion";
import { FilmProvider, resolveFilmRuntime } from "../../film/context";
import { FilmSceneTrack } from "../../film/FilmSceneTrack";
import { FilmSoundEffects } from "../../film/FilmSoundEffects";
import { resolveFilmSceneTrack, type FilmScene } from "../../film/scene-track";

// A compact body with no provider calls: assets come from the shared Workspace seed.
const runtime = resolveFilmRuntime({
  spec: {
    schemaVersion: 1,
    filmId: "scene-track-gallery",
    render: { width: 1920, height: 1080, fps: 30 },
    narration: [],
    timeline: { durationInFrames: 90 },
    publish: { title: "Scene track + sound effects" },
  },
  timing: null,
  music: null,
});
const scenes: readonly FilmScene[] = [
  {
    id: "axiom",
    from: 0,
    chapter: "question",
    render: (f) => (
      <AbsoluteFill
        style={{
          background: "#0b1420",
          color: "#ddf5fc",
          padding: 100,
          fontFamily: "sans-serif",
          overflow: "hidden",
        }}
      >
        <div style={{ fontSize: 26, letterSpacing: 8 }}>01 / THE OLD AXIOM</div>
        <div
          style={{
            fontSize: 140,
            marginTop: 80,
            transform: `translateX(${f * 3}px)`,
          }}
        >
          MORE = BETTER?
        </div>
        <div
          style={{
            position: "absolute",
            width: 430,
            height: 430,
            border: "4px solid #4bd9dc",
            borderRadius: "50%",
            left: 1000 - f * 8,
            top: 460 - f * 3,
          }}
        />
      </AbsoluteFill>
    ),
  },
  {
    id: "evidence",
    from: 30,
    chapter: "evidence",
    enter: { kind: "match-scale", frames: 12 },
    render: (f) => (
      <AbsoluteFill
        style={{
          background: "#dcf2f0",
          color: "#102a38",
          padding: 100,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 26, letterSpacing: 8 }}>
          02 / FOLLOW THE EVIDENCE
        </div>
        <div style={{ fontSize: 180, marginTop: 65 }}>LESS.</div>
        <div
          style={{
            width: 1200 + f * 12,
            height: 140,
            background: "#117d8b",
            marginTop: 80,
          }}
        />
        <div style={{ fontSize: 40, marginTop: 35 }}>
          Measure the work that matters.
        </div>
      </AbsoluteFill>
    ),
  },
  {
    id: "reveal",
    from: 60,
    chapter: "answer",
    enter: { kind: "flash", frames: 10 },
    render: (f) => (
      <AbsoluteFill
        style={{
          background: "#0b1420",
          color: "#ddf5fc",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 28, letterSpacing: 8 }}>03 / A NEW AXIOM</div>
        <div
          style={{
            fontSize: 150,
            transform: `scale(${1 + f * 0.002})`,
            marginTop: 50,
          }}
        >
          BETTER SIGNAL.
        </div>
        <div style={{ fontSize: 38, color: "#4bd9dc", marginTop: 45 }}>
          Motion and sound share the same landing.
        </div>
      </AbsoluteFill>
    ),
  },
];
const { sfxCues } = resolveFilmSceneTrack(runtime, scenes);
export const SceneTrackGallery = () => (
  <FilmProvider runtime={runtime}>
    <FilmSceneTrack scenes={scenes} />
    <FilmSoundEffects
      cues={[
        ...sfxCues,
        {
          endFrame: 60,
          sfx: "riser-short",
          for: "Build towards the new axiom",
        },
        { frame: 76, sfx: "glitch-tick", for: "Signal locks into place" },
      ]}
    />
  </FilmProvider>
);

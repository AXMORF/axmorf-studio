import sharedManifest from "../../catalog/assets.manifest.json";
import {
  FilmProvider,
  resolveFilmRuntime,
  type FilmRuntime,
} from "../../film/context";
import { AxiomStoryExample } from "./AxiomStoryExample";

// Provider-free gallery adapter: the shared licensed loop replaces generated film music.
// No narration is synthesized; s01/s02/s03 in the storyboard are illustrative sentence anchors.
const loop = sharedManifest.assets.find(
  ({ id }) => id === "asset.axmorf.music.neon-motion-loop-v1",
)!;
const base = resolveFilmRuntime({
  spec: {
    schemaVersion: 1,
    filmId: "axiom-story-gallery",
    render: { width: 1920, height: 1080, fps: 30 },
    narration: [],
    timeline: { durationInFrames: 300 },
    publish: { title: "旧公理文字形变" },
  },
  timing: null,
  music: null,
});
const beatFrames = Array.from({ length: 20 }, (_, i) =>
  Math.round((i * 30 * 60) / 118),
);
const runtime: FilmRuntime = {
  ...base,
  music: {
    schemaVersion: 1,
    filmId: base.spec.filmId,
    inputFingerprint: `sha256:${"0".repeat(64)}`,
    checksum: loop.checksum,
    publicPath: loop.localPath,
    startFrame: 0,
    scoreDurationInFrames: Math.round((64 * 30 * 60) / 118),
    volume: 0.18,
    underSpeechVolume: 0.09,
    fadeOutFrames: 30,
    bpm: 118,
    beatsPerBar: 4,
    beatFrames,
    barFrames: beatFrames.filter((_, i) => i % 4 === 0),
    accentFrames: [beatFrames[12]],
    sectionFrames: [0, beatFrames[12]],
  },
};
export const AxiomStoryGallery = () => (
  <FilmProvider runtime={runtime}>
    <AxiomStoryExample />
  </FilmProvider>
);

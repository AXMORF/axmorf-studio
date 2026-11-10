import { resolveFilmRuntime } from "../../packages/studio/src/remotion/film/context";

export const filmTrackFixture = () =>
  resolveFilmRuntime({
    spec: {
      schemaVersion: 1,
      filmId: "track-tests",
      render: { width: 1920, height: 1080, fps: 30 },
      narration: [
        { id: "a", text: "First." },
        { id: "b", text: "Second." },
      ],
      music: { score: {} },
      publish: { title: "Track tests" },
    },
    timing: {
      schemaVersion: 1,
      filmId: "track-tests",
      fps: 30,
      inputFingerprint: `sha256:${"a".repeat(64)}`,
      narrationStartFrame: 15,
      narrationEndFrame: 150,
      durationInFrames: 300,
      narration: {
        publicPath: "public/films/track-tests/narration.wav",
        checksum: `sha256:${"b".repeat(64)}`,
        sampleRate: 48000,
        sampleFrameCount: 216000,
      },
      sentences: [
        { id: "a", text: "First.", startFrame: 15, endFrame: 45 },
        { id: "b", text: "Second.", startFrame: 100, endFrame: 150 },
      ],
    },
    music: {
      schemaVersion: 1,
      filmId: "track-tests",
      inputFingerprint: `sha256:${"a".repeat(64)}`,
      publicPath: "public/films/track-tests/music.wav",
      checksum: `sha256:${"c".repeat(64)}`,
      startFrame: 10,
      scoreDurationInFrames: 120,
      volume: 0.24,
      underSpeechVolume: 0.09,
      fadeOutFrames: 45,
      bpm: 120,
      beatsPerBar: 4,
      beatFrames: [0, 15, 30, 45, 60],
      barFrames: [0, 60, 120],
      accentFrames: [30, 240],
      sectionFrames: [0, 120],
    },
  });

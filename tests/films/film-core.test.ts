import assert from "node:assert/strict";
import test from "node:test";

import {
  computeFilmTimingInputFingerprint,
  FilmSpecSchema,
  filmFrameFromSamples,
} from "@axmorf/studio/contracts";

import { generateScore } from "../../.agents/skills/axmorf-video/scripts/synth-score.mjs";
import { resolveFilmRuntime } from "../../packages/studio/src/remotion/film/context";
import { resolveFilmSoundtrack } from "../../packages/studio/src/remotion/film/FilmSoundtrack";
import { projectFilmMusicGrid } from "../../scripts/films/music";
import { renderFilmRegistrySource } from "../../scripts/films/registry";
import { selectReviewFrames } from "../../scripts/films/review";
import { buildFilmTiming } from "../../scripts/films/voice";

const baseSpec = {
  schemaVersion: 1,
  filmId: "tls-basics",
  render: { width: 1080, height: 1920, fps: 30 },
  narration: [
    { id: "s01", text: "第一句。" },
    { id: "s02", text: "第二句。", pauseAfterMs: 500 },
    { id: "s03", text: "第三句。" },
  ],
  publish: { title: "TLS" },
};

test("film.json applies defaults and rejects what would break a film", () => {
  const spec = FilmSpecSchema.parse(baseSpec);
  assert.deepEqual(spec.timeline, { narrationStartFrame: 15, tailFrames: 45 });
  assert.equal(spec.music, null);
  assert.deepEqual(spec.publish, { title: "TLS", description: "", tags: [] });

  const issues = (input: unknown) => {
    const parsed = FilmSpecSchema.safeParse(input);
    return parsed.success
      ? []
      : parsed.error.issues.map(({ message }) => message);
  };
  assert.match(
    issues({
      ...baseSpec,
      narration: [{ id: "s01", text: "长".repeat(37) }],
    }).join(),
    /74 caption half-units/u,
  );
  assert.match(
    issues({
      ...baseSpec,
      narration: [baseSpec.narration[0], baseSpec.narration[0]],
    }).join(),
    /repeated/u,
  );
  assert.match(
    issues({ ...baseSpec, narration: [] }).join(),
    /durationInFrames/u,
  );
  assert.match(
    issues({
      ...baseSpec,
      render: { width: 1081, height: 1920, fps: 30 },
    }).join(),
    /even/u,
  );
  assert.match(
    issues({
      ...baseSpec,
      music: { score: { bpm: 100 }, volume: 0.1, underSpeechVolume: 0.2 },
    }).join(),
    /louder/u,
  );
  assert.match(
    issues({ ...baseSpec, music: { score: { fps: 30 } } }).join(),
    /Omit score\.fps/u,
  );
  assert.match(issues({ ...baseSpec, filmId: "Bad_Id" }).join(), /lowercase/u);
});

test("timing follows measured samples, pauses, and the tail", () => {
  const spec = FilmSpecSchema.parse(baseSpec);
  // 1 s, 1.5 s and 0.5 s of speech at 48 kHz; s02 is followed by 0.5 s silence.
  const timing = buildFilmTiming({
    spec,
    sentenceSamples: [48_000, 72_000, 24_000],
    narration: null,
  });
  assert.deepEqual(
    timing.sentences.map(({ id, startFrame, endFrame }) => [
      id,
      startFrame,
      endFrame,
    ]),
    [
      ["s01", 15, 45],
      ["s02", 45, 90],
      ["s03", 105, 120],
    ],
  );
  assert.equal(timing.narrationEndFrame, 120);
  assert.equal(timing.durationInFrames, 165);
  assert.equal(
    timing.inputFingerprint,
    computeFilmTimingInputFingerprint(spec),
  );
  assert.equal(
    filmFrameFromSamples(1, 30, 48_000),
    1,
    "partial frames round up",
  );

  assert.throws(
    () =>
      buildFilmTiming({
        spec: FilmSpecSchema.parse({
          ...baseSpec,
          timeline: { durationInFrames: 100 },
        }),
        sentenceSamples: [48_000, 72_000, 24_000],
        narration: null,
      }),
    /narration ends at frame 120/u,
  );
});

test("the score grid lands on absolute film frames and repeats when it loops", () => {
  const { timeline } = generateScore({
    fps: 30,
    bpm: 120,
    beatsPerBar: 4,
    bars: 2,
    style: "electronic",
    seed: 3,
    engine: "studio-v2",
    arrangement: {
      tonic: "C",
      mode: "minor",
      progression: [1, 6],
      sections: [
        { bars: 1, instruments: ["pad"], density: 0.3, energy: 0.3 },
        { bars: 1, instruments: ["kick", "pad"], density: 0.7, energy: 0.8 },
      ],
    },
  });
  // Two bars at 120 BPM are 120 frames; a 270-frame film starting at 30 loops twice.
  const grid = projectFilmMusicGrid({
    timeline: { ...timeline, audioChecksum: `sha256:${"0".repeat(64)}` },
    startFrame: 30,
    durationInFrames: 270,
  });
  assert.deepEqual(grid.barFrames, [30, 90, 150, 210]);
  assert.deepEqual(grid.sectionFrames, [30, 90, 150, 210]);
  assert.deepEqual(grid.accentFrames, [90, 210]);
  assert.equal(grid.beatFrames.length, 16);
});

test("the soundtrack ducks music under every sentence and loops a short score", () => {
  const spec = FilmSpecSchema.parse(baseSpec);
  const timing = buildFilmTiming({
    spec,
    sentenceSamples: [48_000, 72_000, 24_000],
    narration: {
      publicPath: "public/films/tls-basics/narration.wav",
      checksum: `sha256:${"a".repeat(64)}`,
      sampleRate: 48_000,
      sampleFrameCount: 168_000,
    },
  });
  const runtime = resolveFilmRuntime({
    spec: { ...baseSpec, music: { score: {} } },
    timing,
    music: {
      schemaVersion: 1,
      filmId: "tls-basics",
      inputFingerprint: `sha256:${"b".repeat(64)}`,
      publicPath: "public/films/tls-basics/music.wav",
      checksum: `sha256:${"c".repeat(64)}`,
      startFrame: 0,
      scoreDurationInFrames: 120,
      volume: 0.24,
      underSpeechVolume: 0.09,
      fadeOutFrames: 45,
      bpm: 120,
      beatsPerBar: 4,
      beatFrames: [],
      barFrames: [],
      sectionFrames: [],
      accentFrames: [],
    },
  });
  const [narration, music] = resolveFilmSoundtrack(runtime);
  assert.equal(narration?.startFrame, 15);
  assert.equal(narration?.endFrame, 120);
  assert.equal(music?.endFrame, 165);
  assert.equal(music?.loop, true);
  assert.equal(music?.sourceDurationInSeconds, 4);
  // The 15-frame pause after s02 is shorter than two ramps, so the music stays down.
  assert.deepEqual(music?.speechDucking?.ranges, [[15, 120]]);
  assert.equal(music?.speechDucking?.volume, 0.09);
});

test("the review picks sentence middles, musical arrivals, and both ends", () => {
  const spec = FilmSpecSchema.parse(baseSpec);
  const timing = buildFilmTiming({
    spec,
    sentenceSamples: [48_000, 72_000, 24_000],
    narration: null,
  });
  assert.deepEqual(
    selectReviewFrames({
      timing,
      music: { sectionFrames: [0, 88], accentFrames: [88] },
    }),
    [
      { frame: 2, reason: "music section" },
      { frame: 10, reason: "opening" },
      { frame: 30, reason: "sentence s01" },
      { frame: 67, reason: "sentence s02" },
      { frame: 90, reason: "music section, music accent" },
      { frame: 112, reason: "sentence s03" },
      { frame: 159, reason: "ending" },
    ],
  );
});

test("the registry imports only generated files that exist", () => {
  const source = renderFilmRegistrySource([
    { id: "alpha", timing: true, music: true },
    { id: "beta", timing: false, music: false },
  ]);
  assert.match(
    source,
    /import timing0 from "\.\/alpha\/generated\/timing\.json";/u,
  );
  assert.match(
    source,
    /import music0 from "\.\/alpha\/generated\/music\.json";/u,
  );
  assert.doesNotMatch(source, /beta\/generated/u);
  assert.match(
    source,
    /timing: null,\s+music: null,\s+film: \(\) => import\("\.\/beta\/Film"\)/u,
  );
  assert.doesNotMatch(source, /readdir|import\.meta\.glob/u);
});

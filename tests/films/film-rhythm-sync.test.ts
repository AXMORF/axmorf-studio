import assert from "node:assert/strict";
import test from "node:test";
import {
  FilmReviewMotionSchema,
  FilmSpecSchema,
  FilmTimingSchema,
  type FilmReviewMotionEvent,
} from "@axmorf/studio/contracts";
import { analyzeRhythmSync } from "../../scripts/films/rhythm-sync";
import { analyzeMotion } from "../../scripts/films/motion";
import { MUSIC_SYNC_SPEC } from "../../packages/studio/src/remotion/compositions/capability-gallery/music-sync-fixture";
import { generateScore } from "../../scripts/films/score/synth-score.mjs";
import { scoreOnsets } from "../../scripts/films/score/storyboard-score.mjs";
import {
  projectFilmMusicGrid,
  resolveFilmScoreRecipe,
} from "../../scripts/films/music";

const music = {
  beatFrames: [0, 18, 36, 54, 72, 90, 108, 126, 144, 162, 180, 198],
  barFrames: [0, 72, 144],
  accentFrames: [0, 108],
  sectionFrames: [0, 144],
  onsets: {
    kick: [0, 36, 72, 108, 144, 180],
    snare: [],
    clap: [],
    hat: [],
    bass: [],
    hits: [108],
    sections: [0, 144],
  },
};
const events: FilmReviewMotionEvent[] = [
  {
    type: "scene-track",
    scenes: [
      { id: "a", chapter: "a", boundaryFrame: 0, endFrame: 216, enter: null },
    ],
  },
  { type: "rhythm", kind: "impact", frames: [0, 108, 144] },
  { type: "rhythm", kind: "bar-camera", frames: [0, 72, 144] },
  { type: "rhythm", kind: "pulse", frames: music.onsets.kick },
  {
    type: "sound-effects",
    cues: [0, 108, 144].map((frame) => ({
      frame,
      endFrame: frame + 6,
      sfx: "hit",
      for: "impact",
    })),
  },
];
const analyze = (
  options: Partial<Parameters<typeof analyzeRhythmSync>[0]> = {},
) =>
  analyzeRhythmSync({
    events,
    complete: true,
    music,
    durationInFrames: 216,
    legacyAudio: false,
    ...options,
  });
test("rhythm sync accepts L1/L2/L3 and reports exact missing L3 despite pulse/camera at the accent", () => {
  const good = analyze();
  assert.deepEqual(good.motionWarnings, []);
  assert.deepEqual(good.unknown, []);
  assert.deepEqual(good.summary, {
    accents: { total: 3, matched: 3 },
    landings: { total: 3, matched: 3 },
    sounds: { total: 3, matched: 3 },
    bars: { total: 3, matched: 3 },
  });
  const bad = analyze({
    events: events.map((e) =>
      e.type === "rhythm" && e.kind === "impact"
        ? { ...e, frames: [0, 144] }
        : e,
    ),
  });
  assert.deepEqual(
    bad.motionWarnings.map((w) => [w.rule, w.frames]),
    [["accent-without-visual", [108, 109]]],
  );
});
test("all four rules distinguish ±2 frame tolerance, bar boundaries and missing sound", () => {
  const options = {
    music: {
      beatFrames: [0],
      accentFrames: [30],
      barFrames: [0, 72],
      sectionFrames: [],
    },
  };
  const base: FilmReviewMotionEvent[] = [
    { type: "rhythm", kind: "impact", frames: [32] },
    {
      type: "sound-effects",
      cues: [{ frame: 34, endFrame: 40, sfx: "hit", for: "land" }],
    },
  ];
  assert.deepEqual(
    analyze({ ...options, events: base }).motionWarnings.map((w) => w.rule),
    ["bar-without-change"],
  );
  const outside = analyze({
    ...options,
    events: [
      { ...base[0], type: "rhythm", kind: "impact", frames: [33] },
      base[1],
    ],
  });
  assert.ok(
    outside.motionWarnings.some((w) => w.rule === "accent-without-visual"),
  );
  const silent = analyze({
    events: events.map((e) =>
      e.type === "sound-effects" ? { ...e, cues: [] } : e,
    ),
  });
  assert.equal(
    silent.motionWarnings.filter((w) => w.rule === "visual-without-sound")
      .length,
    3,
  );
  const orphan = analyze({
    events: [
      ...events,
      {
        type: "sound-effects",
        cues: [{ frame: 63, endFrame: 69, sfx: "tick", for: "orphan" }],
      },
    ],
  });
  assert.deepEqual(
    orphan.motionWarnings.map((w) => [w.rule, w.frames]),
    [["sound-without-visual", [63, 64]]],
  );
  const boundary = analyze({
    events: [{ type: "rhythm", kind: "bar-camera", frames: [72, 144] }],
    music: { ...music, accentFrames: [], sectionFrames: [], onsets: undefined },
  });
  assert.deepEqual(
    boundary.motionWarnings.map((w) => w.frames),
    [[0, 72]],
  );
});
test("missing, truncated, ambiguous or legacy evidence stays unknown", () => {
  for (const options of [
    { complete: false },
    { music: null },
    { events: [] },
    { events: [events[0], { ...events[0] }] },
  ]) {
    const result = analyze(options);
    assert.deepEqual(result.motionWarnings, []);
    assert.equal(result.unknown.length, 4);
  }
  for (const options of [
    { legacyAudio: true },
    { events: events.filter((e) => e.type !== "sound-effects") },
  ]) {
    assert.deepEqual(
      analyze(options).unknown.map((u) => u.rule),
      ["visual-without-sound", "sound-without-visual"],
    );
  }
  const old = analyze({ music: { beatFrames: [0], accentFrames: [] } });
  assert.ok(old.unknown.some((u) => u.rule === "bar-without-change"));
});
test("recipe land, transitions and end/center sound anchors use the intended frame", () => {
  const result = analyze({
    music: {
      ...music,
      accentFrames: [30, 60, 90],
      sectionFrames: [],
      onsets: undefined,
    },
    events: [
      {
        type: "recipe",
        id: "NumberRoll",
        anticipate: 10,
        move: 20,
        land: 30,
        settle: 40,
      },
      {
        type: "scene-track",
        scenes: [
          {
            id: "next",
            chapter: "a",
            boundaryFrame: 60,
            endFrame: 216,
            enter: {
              kind: "flash",
              mode: "overlay",
              startFrame: 55,
              endFrame: 65,
            },
          },
        ],
      },
      { type: "rhythm", kind: "impact", frames: [90] },
      {
        type: "sound-effects",
        cues: [
          {
            frame: 10,
            endFrame: 30,
            alignmentFrame: 30,
            sfx: "rise",
            for: "landing",
          },
          {
            frame: 80,
            endFrame: 100,
            alignmentFrame: 90,
            sfx: "whoosh",
            for: "center",
          },
        ],
      },
    ],
  });
  assert.ok(
    !result.motionWarnings.some((w) => w.rule !== "bar-without-change"),
  );
});
test("MusicSyncGallery plan passes rhythm sync without a required motif and detects missing f150", () => {
  const spec = FilmSpecSchema.parse(MUSIC_SYNC_SPEC);
  const timing = FilmTimingSchema.parse({
    schemaVersion: 1,
    filmId: spec.filmId,
    inputFingerprint: `sha256:${"0".repeat(64)}`,
    fps: 30,
    narrationStartFrame: 0,
    narrationEndFrame: 0,
    durationInFrames: 300,
    narration: null,
    sentences: [],
  });
  const recipe = resolveFilmScoreRecipe({
    music: spec.music!,
    timing,
    fps: 30,
  });
  const { timeline } = generateScore(recipe);
  assert.equal(timeline.bpm, 118.28);
  const grid = projectFilmMusicGrid({
    timeline,
    startFrame: 0,
    durationInFrames: 300,
  });
  const onsets = scoreOnsets(timeline);
  assert.deepEqual(grid.barFrames, [0, 61, 122, 183, 243]);
  assert.deepEqual(grid.sectionFrames, [0, 122, 243]);
  const accents = [
    ...new Set([
      ...grid.accentFrames,
      ...grid.sectionFrames,
      ...onsets.hits,
      ...onsets.sections,
    ]),
  ].sort((a, b) => a - b);
  assert.ok(accents.includes(150));
  const planned: FilmReviewMotionEvent[] = [
    { type: "rhythm", kind: "impact", frames: accents },
    { type: "rhythm", kind: "bar-camera", frames: grid.barFrames },
    {
      type: "sound-effects",
      cues: accents.map((frame) => ({
        frame,
        endFrame: Math.min(frame + 6, 300),
        sfx: "hit",
        for: "L3",
      })),
    },
  ];
  const run = (events: FilmReviewMotionEvent[]) =>
    analyzeMotion({
      records: [
        FilmReviewMotionSchema.parse({
          index: 0,
          frame: 0,
          events,
          truncated: false,
        }),
      ],
      frames: [0],
      curve: {
        fps: 30,
        sampleSeconds: 0.5,
        samples: [],
        seconds: [],
        cuts: [],
      },
      durationInFrames: 300,
      fps: 30,
      hasNarration: false,
      legacyAudio: false,
      music: { ...grid, onsets },
      stillWarnings: [],
    });
  assert.deepEqual(
    run(planned).motionWarnings.map((w) => w.rule),
    [],
  );
  const broken = planned.map((e) =>
    e.type === "rhythm" && e.kind === "impact"
      ? { ...e, frames: e.frames.filter((f) => f !== 150) }
      : e,
  );
  assert.deepEqual(
    run(broken).motionWarnings.map((w) => w.rule),
    ["accent-without-visual", "sound-without-visual"],
  );
  assert.ok(
    run(broken).motionWarnings.some(
      (w) => w.rule === "accent-without-visual" && w.frames[0] === 150,
    ),
  );
});

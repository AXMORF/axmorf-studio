import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import {
  SynthesizedMusicTimelineSchema,
  resolveSceneMusicTiming,
} from "@axmorf/studio/contracts";

const loadSynth = () =>
  import(
    pathToFileURL(
      resolve(".agents/skills/axmorf-video/scripts/synth-score.mjs"),
    ).href
  );

const recipe = {
  fps: 30,
  bpm: 120,
  bars: 6,
  style: "electronic",
  seed: 11,
  engine: "studio-v2",
  arrangement: {
    tonic: "C",
    mode: "minor",
    progression: [1, 6, 3, 7],
    sections: [
      { bars: 2, instruments: ["pad", "pluck"], density: 0.3, energy: 0.3 },
      {
        bars: 3,
        instruments: ["kick", "snare", "clap", "hat", "bass", "pad", "lead"],
        density: 0.85,
        energy: 0.9,
      },
      { bars: 1, instruments: ["pad"], density: 0.2, energy: 0.3 },
    ],
  },
};

test("studio-v2 scores are deterministic and satisfy the frozen timeline contract", async () => {
  const { generateScore } = await loadSynth();
  const first = generateScore(recipe);
  assert.deepEqual(generateScore(recipe), first);
  assert.notDeepEqual(
    generateScore({ ...recipe, seed: 12 }).audio,
    first.audio,
  );
  const timeline = SynthesizedMusicTimelineSchema.parse(first.timeline);
  assert.equal(timeline.engine, "studio-v2");
  assert.equal(first.audio.length, 44 + Math.round((360 / 30) * 48_000) * 4);
  assert.deepEqual(
    timeline.sections?.map(({ startFrame }) => startFrame),
    [0, 120, 300],
  );
  // The higher-energy arrival gets a crash; the quieter outro does not.
  assert.deepEqual(timeline.accentFrames, [120]);
  const types = new Set<string>(timeline.music.map(({ type }) => type));
  for (const type of ["snare", "clap", "lead", "crash", "riser", "kick"]) {
    assert.ok(types.has(type), type);
  }
  const intro = timeline.music.filter(({ frame }) => frame < 120);
  assert.ok(
    intro.every(({ type, frame }) =>
      type === "snare"
        ? frame >= 105
        : ["pad", "pluck", "riser"].includes(type),
    ),
    "the intro holds its own voices, a riser and a fill only in its last beat",
  );
  assert.ok(intro.some(({ type }) => type === "snare"));
  assert.ok(
    timeline.music.some(({ type, frame }) => type === "riser" && frame < 120),
  );
});

test("studio-v2 scores can span a whole film and expose Scene-local accents", async () => {
  const { generateScore } = await loadSynth();
  const long = SynthesizedMusicTimelineSchema.parse(
    generateScore({
      ...recipe,
      bars: 24,
      arrangement: {
        ...recipe.arrangement,
        sections: [
          { bars: 8, instruments: ["pad", "pluck"], density: 0.3, energy: 0.3 },
          {
            bars: 16,
            instruments: ["kick", "hat", "bass", "lead"],
            density: 0.7,
            energy: 0.8,
          },
        ],
      },
    }).timeline,
  );
  assert.equal(long.bars, 24);
  const scene = resolveSceneMusicTiming({
    timeline: long,
    sceneStartFrame: 400,
    durationInFrames: 200,
  });
  assert.deepEqual(scene.accentFrames, [80]);
  assert.deepEqual(scene.sectionFrames, [80]);
  assert.ok(scene.barFrames.includes(80));
});

test("the original engine keeps its 16-bar limit and rejects studio-only fields", async () => {
  const { makeTimeline } = await loadSynth();
  assert.throws(
    () => makeTimeline({ fps: 30, bpm: 120, bars: 17 }),
    /Invalid bars/u,
  );
  assert.throws(
    () => makeTimeline({ ...recipe, engine: "other" }),
    /Invalid score engine/u,
  );
  assert.throws(
    () => makeTimeline({ ...recipe, arrangement: undefined }),
    /requires an authored arrangement/u,
  );
  const legacy = makeTimeline({ fps: 30, bpm: 120, bars: 1 });
  assert.equal(Object.hasOwn(legacy, "engine"), false);
  assert.equal(Object.hasOwn(legacy, "sections"), false);
  assert.equal(
    SynthesizedMusicTimelineSchema.safeParse({
      ...legacy,
      audioChecksum: `sha256:${"0".repeat(64)}`,
      accentFrames: [0],
    }).success,
    false,
    "accent marks belong only to studio-v2 timelines",
  );
  assert.equal(
    resolveSceneMusicTiming({
      timeline: SynthesizedMusicTimelineSchema.parse({
        ...legacy,
        audioChecksum: `sha256:${"0".repeat(64)}`,
      }),
      sceneStartFrame: 0,
      durationInFrames: 30,
    }).accentFrames,
    undefined,
  );
});

import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { SynthesizedMusicTimelineSchema } from "@axmorf/studio/contracts";

const loadSynth = () =>
  import(
    pathToFileURL(
      resolve("scripts/films/score/synth-score.mjs"),
    ).href
  );

const arrangement = {
  tonic: "D",
  mode: "minor",
  progression: [1, 6, 3, 7],
  swing: 0.15,
  sections: [
    { bars: 2, instruments: ["pad", "pluck"], density: 0.3, energy: 0.4 },
    {
      bars: 2,
      instruments: ["kick", "hat", "bass", "pluck", "pad"],
      density: 0.9,
      energy: 0.85,
    },
  ],
};

test("legacy score recipes keep their existing deterministic audio", async () => {
  const { generateScore } = await loadSynth();
  const score = generateScore({
    fps: 30,
    bpm: 100,
    bars: 2,
    style: "organic",
    seed: 17,
  });
  assert.equal(
    score.timeline.audioChecksum,
    "sha256:43a510eacce05fa33197998a80dab7e86bb7b9e0ec4f4ceb4a8c09c47238ed59",
  );
});

test("authored harmony and sections become reproducible events in the existing frozen timeline", async () => {
  const { generateScore } = await loadSynth();
  const recipe = { fps: 30, bpm: 100, bars: 4, seed: 17, arrangement };
  const score = generateScore(recipe);
  const timeline = SynthesizedMusicTimelineSchema.parse(score.timeline);
  assert.deepEqual(generateScore(recipe), score);
  assert.equal(Object.hasOwn(timeline, "arrangement"), false);
  const sectionBoundary = 8 * 18;
  assert.ok(
    timeline.music
      .filter((event) => event.frame < sectionBoundary)
      .every((event) => ["pad", "pluck"].includes(event.type)),
  );
  assert.deepEqual(
    new Set(
      timeline.music
        .filter((event) => event.frame >= sectionBoundary)
        .map((event) => event.type),
    ),
    new Set(["kick", "hat", "bass", "pluck", "pad"]),
  );
  assert.deepEqual(
    timeline.music
      .filter((event) => event.type === "pad" && event.frame === 0)
      .map((event) => event.note),
    [50, 53, 57],
    "D minor starts with a minor triad, not the legacy C major harmony",
  );
  assert.deepEqual(
    [0, 72, 144, 216].map((frame) =>
      timeline.music
        .filter((event) => event.type === "pad" && event.frame === frame)
        .map((event) => event.note),
    ),
    [
      [50, 53, 57],
      [58, 62, 65],
      [53, 57, 60],
      [60, 64, 67],
    ],
    "every authored degree changes the sounding triad on its bar",
  );
  const transposed = SynthesizedMusicTimelineSchema.parse(
    generateScore({
      ...recipe,
      arrangement: { ...arrangement, tonic: "E" },
    }).timeline,
  );
  assert.deepEqual(
    transposed.music.map((event) => event.note),
    timeline.music.map((event) =>
      ["pad", "pluck", "bass"].includes(event.type)
        ? event.note + 2
        : event.note,
    ),
  );
  assert.notEqual(transposed.audioChecksum, timeline.audioChecksum);
});

test("density and swing change the performance without moving the shared beat grid", async () => {
  const { generateScore } = await loadSynth();
  const section = {
    bars: 2,
    instruments: ["kick", "hat", "bass", "pluck", "pad"],
    energy: 0.8,
  };
  const score = (density: number, swing: number) =>
    SynthesizedMusicTimelineSchema.parse(
      generateScore({
        fps: 60,
        bpm: 120,
        bars: 2,
        arrangement: {
          ...arrangement,
          swing,
          sections: [{ ...section, density }],
        },
      }).timeline,
    );
  const sparse = score(0, 0);
  const dense = score(1, 0);
  const swung = score(1, 0.2);
  assert.ok(dense.music.length > sparse.music.length * 2);
  assert.deepEqual(swung.beatFrames, dense.beatFrames);
  assert.equal(swung.durationInFrames, dense.durationInFrames);
  assert.ok(
    dense.music.some(
      (event, index) => event.frame !== swung.music[index]?.frame,
    ),
  );
  assert.notEqual(sparse.audioChecksum, dense.audioChecksum);
  assert.notEqual(swung.audioChecksum, dense.audioChecksum);
});

test("section energy is audible in PCM and a rest stays silent across its boundaries", async () => {
  const { generateScore } = await loadSynth();
  const score = generateScore({
    fps: 30,
    bpm: 120,
    bars: 3,
    arrangement: {
      ...arrangement,
      progression: [1],
      sections: [
        { bars: 1, instruments: ["pad"], density: 0, energy: 0.2 },
        { bars: 1, instruments: [], density: 0, energy: 0.5 },
        { bars: 1, instruments: ["pad"], density: 0, energy: 0.8 },
      ],
    },
  });
  const timeline = SynthesizedMusicTimelineSchema.parse(score.timeline);
  assert.equal(timeline.music.length, 6);
  const pcm = score.audio.subarray(44);
  const samplesPerBar = 2 * 48_000;
  const rms = (bar: number) => {
    let sum = 0;
    for (let sample = 0; sample < samplesPerBar; sample++) {
      const value = pcm.readInt16LE((bar * samplesPerBar + sample) * 4);
      sum += value * value;
    }
    return Math.sqrt(sum / samplesPerBar);
  };
  assert.equal(rms(1), 0);
  assert.ok(rms(2) > rms(0) * 3);
});

test("maximum supported arrangement fits the existing event and note budgets", async () => {
  const { generateScore } = await loadSynth();
  const { timeline } = generateScore({
    fps: 30,
    bpm: 180,
    bars: 16,
    beatsPerBar: 7,
    arrangement: {
      ...arrangement,
      tonic: "B",
      mode: "major",
      progression: [7],
      swing: 0.4,
      sections: [
        {
          bars: 16,
          instruments: ["kick", "hat", "bass", "pluck", "pad"],
          density: 1,
          energy: 1,
        },
      ],
    },
  });
  assert.ok(SynthesizedMusicTimelineSchema.safeParse(timeline).success);
});

test("a single sparse percussion voice still produces a nonempty valid score", async () => {
  const { generateScore } = await loadSynth();
  const score = generateScore({
    bars: 1,
    arrangement: {
      ...arrangement,
      sections: [{ bars: 1, instruments: ["hat"], density: 0, energy: 0.6 }],
    },
  });
  const timeline = SynthesizedMusicTimelineSchema.parse(score.timeline);
  assert.equal(timeline.music.length, 1);
  assert.equal(timeline.music[0]?.type, "hat");
  assert.ok(score.audio.subarray(44).some((byte: number) => byte !== 0));
});

test("invalid or contradictory arrangements fail before audio generation", async () => {
  const { makeTimeline } = await loadSynth();
  const base = { bars: 4, arrangement };
  const invalid = [
    null,
    [],
    { ...base, extra: true },
    { ...base, arrangement: null },
    { ...base, arrangement: [] },
    { ...base, arrangement: { ...arrangement, extra: true } },
    { ...base, arrangement: { ...arrangement, tonic: "H" } },
    { ...base, arrangement: { ...arrangement, tonic: ["D"] } },
    { ...base, arrangement: { ...arrangement, mode: "dorian" } },
    { ...base, arrangement: { ...arrangement, progression: [] } },
    { ...base, arrangement: { ...arrangement, progression: [0] } },
    { ...base, arrangement: { ...arrangement, progression: [8] } },
    { ...base, arrangement: { ...arrangement, progression: [1.5] } },
    { ...base, arrangement: { ...arrangement, swing: -0.1 } },
    { ...base, arrangement: { ...arrangement, swing: 0.5 } },
    { ...base, arrangement: { ...arrangement, swing: null } },
    { ...base, arrangement: { ...arrangement, sections: [] } },
    { ...base, arrangement: { ...arrangement, sections: [null] } },
    ...[
      { bars: 1 },
      { bars: 4.5 },
      { energy: 0 },
      { energy: Infinity },
      { density: -0.1 },
      { density: 1.1 },
      { instruments: ["piano"] },
      { instruments: ["pad", "pad"] },
      { instruments: [] },
      { extra: true },
    ].map((override) => ({
      ...base,
      arrangement: {
        ...arrangement,
        sections: [{ ...arrangement.sections[0], bars: 4, ...override }],
      },
    })),
  ];
  for (const input of invalid) {
    assert.throws(
      () => makeTimeline(input),
      /score|arrangement|section|Invalid/u,
    );
  }
});

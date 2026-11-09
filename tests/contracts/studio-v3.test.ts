import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FilmMusicOnsetsSchema } from "@axmorf/studio/contracts";
import {
  generateScore,
  makeTimeline,
  synthesizeTimeline,
  master,
} from "../../scripts/films/score/synth-score.mjs";
import { scoreOnsets } from "../../scripts/films/score/storyboard-score.mjs";
import { projectFilmMusicOnsets } from "../../scripts/films/music";

const voices = {
  instruments: ["kick", "snare", "hat", "bass", "pad", "pluck"],
  density: 0.8,
  energy: 0.85,
};
const recipe = {
  engine: "studio-v3",
  fps: 30,
  bpm: 104,
  seed: 20261108,
  durationInFrames: 180,
  arrangement: {
    tonic: "D",
    mode: "minor",
    progression: [1, 6, 3, 7],
    sections: [{ ...voices, from: 0 }],
  },
  hits: [{ frame: 110, kind: "drop", intensity: 1 }],
  breaks: [{ from: 96, to: 110, keep: [] }],
  ending: { landFrame: 162, cadence: "resolve" },
};

test("v3 renders identical WAV bytes across runs, varies with seed and exports compatible events", () => {
  const first = generateScore(recipe);
  const second = generateScore(recipe);
  const md5 = (bytes: Buffer) => createHash("md5").update(bytes).digest("hex");
  assert.equal(md5(first.audio), md5(second.audio));
  assert.deepEqual(first, second);
  assert.notEqual(
    md5(first.audio),
    md5(generateScore({ ...recipe, seed: 19 }).audio),
  );
  const onsets = FilmMusicOnsetsSchema.parse(scoreOnsets(first.timeline));
  assert.deepEqual(
    first.timeline.accentFrames,
    onsets.accents!.map((event) => event.frame),
  );
  assert.ok(
    onsets.accents!.some(
      (entry) => entry.frame === 110 && entry.strength === 1,
    ),
  );
  assert.ok(onsets.fills!.length >= 2);
  assert.deepEqual(onsets.breaks, [{ from: 96, to: 110 }]);
  const legacy = Object.fromEntries(
    Object.entries(onsets).filter(
      ([key]) => !["fills", "breaks", "accents"].includes(key),
    ),
  );
  assert.ok(FilmMusicOnsetsSchema.safeParse(legacy).success);
  assert.equal(
    FilmMusicOnsetsSchema.safeParse({ ...legacy, fills: [{ from: 10, to: 5 }] })
      .success,
    false,
  );
  const absolute = projectFilmMusicOnsets({
    timeline: first.timeline,
    startFrame: 30,
    durationInFrames: 195,
  });
  assert.deepEqual(absolute.breaks, [{ from: 126, to: 140 }]);
  assert.deepEqual(
    absolute.accents!.map((event) => event.frame),
    [30, 140, 192],
  );
  assert.ok(absolute.fills!.every(({ from, to }) => from >= 30 && to <= 195));
});

test("ending cadence strengths preserve the approved PCM for resolve, cut and ring", () => {
  // Captured before the visual-strength correction: changes must not create a new take.
  const checksums = {
    resolve: "36c6baeaa53642c1bdac43233a5663ce321a9a141d5102268feb7eef74a15452",
    cut: "02c74bea6e4f85d27d3f4668896bd13a609030e1db5777c439b0f19f18b67c9f",
    ring: "7270b06e9f823e45cf5f4084e554b49f919949553ad19af4bd6842171d1623e8",
  };
  for (const cadence of ["resolve", "cut", "ring"] as const) {
    const { audio, timeline } = generateScore({
      ...recipe,
      ending: { ...recipe.ending, cadence },
    });
    assert.equal(
      createHash("sha256").update(audio).digest("hex"),
      checksums[cadence],
    );
    const accents = scoreOnsets(timeline).accents!;
    assert.deepEqual(
      accents.filter(({ frame }) => frame === recipe.ending.landFrame),
      cadence === "resolve" ? [{ frame: 162, strength: 0.6 }] : [],
    );
    assert.deepEqual(
      accents.filter(({ frame }) => frame < 162),
      [
        { frame: 0, strength: 0.85 },
        { frame: 110, strength: 1 },
      ],
    );
  }
});

const firstSoundingSample = (audio: Buffer) => {
  for (let sample = 0; 44 + sample * 4 < audio.length; sample++)
    if (
      audio.readInt16LE(44 + sample * 4) ||
      audio.readInt16LE(46 + sample * 4)
    )
      return sample;
  return -1;
};

test("v3 event frames match measured PCM onsets with zero-frame error, including non-divisor fps", () => {
  const timeline = makeTimeline(recipe);
  // Isolate each emitted event, not a second reimplementation of the scheduler.
  // This detects DSP attack delays, sample rounding, pre-echo and PCM quantization.
  const events = timeline.music as {
    type: string;
    frame: number;
    gain: number;
  }[];
  const onsets = scoreOnsets(timeline);
  for (const fps of [24, 30, 59, 120]) {
    for (const type of [
      "kick",
      "snare",
      "clap",
      "hat",
      "bass",
      "crash",
    ] as const) {
      const original = events.find((event) => event.type === type) ?? {
        type,
        gain: 0.7,
        note: 50,
        durationInFrames: 10,
      };
      const frame = 7;
      const audio = synthesizeTimeline({
        ...timeline,
        fps,
        durationInFrames: 32,
        musicWindowInFrames: 32,
        ending: undefined,
        breaks: [],
        music: [{ ...original, frame }],
      });
      const measured = firstSoundingSample(audio);
      assert.ok(measured >= 0, `${type} must actually sound`);
      assert.equal(
        Math.floor((measured * fps) / 48000),
        frame,
        `${type} at ${fps} fps`,
      );
    }
  }
  for (const frame of [
    ...onsets.hits,
    ...onsets.sections,
    ...onsets.accents!.map((event) => event.frame),
  ]) {
    const event = events.find(
      (event) => event.type === "crash" && event.frame === frame,
    )!;
    assert.ok(event, `exported marker f${frame} needs an audible impact`);
    const audio = synthesizeTimeline({
      ...timeline,
      breaks: [],
      ending: undefined,
      music: [event],
    });
    assert.equal(Math.floor((firstSoundingSample(audio) * 30) / 48000), frame);
  }
});

test("v3 fill windows sound at their first frame and full breaks remove reverb as well as dry sound", () => {
  const { timeline, audio } = generateScore(recipe);
  const onsets = scoreOnsets(timeline);
  const events = timeline.music as { type: string; frame: number }[];
  for (const { from, to } of onsets.fills!) {
    const fill = events.filter(
      (event) =>
        event.type === "snare" && event.frame >= from && event.frame < to,
    );
    assert.ok(fill.length > 1);
    const isolated = synthesizeTimeline({ ...timeline, music: fill });
    assert.equal(
      Math.floor((firstSoundingSample(isolated) * 30) / 48000),
      from,
    );
  }
  for (const { from, to } of onsets.breaks!)
    assert.ok(
      audio
        .subarray(44 + from * 1600 * 4, 44 + to * 1600 * 4)
        .every((byte) => byte === 0),
    );
  const selective = {
    ...timeline,
    ending: undefined,
    music: events.filter((event) => ["pad", "pluck"].includes(event.type)),
    breaks: [{ from: 60, to: 90, keep: ["pad"] }],
  };
  const actual = synthesizeTimeline(selective);
  const kept = synthesizeTimeline({
    ...selective,
    music: selective.music.filter((event) => event.type === "pad"),
  });
  assert.deepEqual(
    actual.subarray(44 + 60 * 6400, 44 + 90 * 6400),
    kept.subarray(44 + 60 * 6400, 44 + 90 * 6400),
  );
});

test("v3 supports bars, anchored BPM search and exact cut endings without changing speech", () => {
  const base = Object.fromEntries(
    Object.entries(recipe).filter(
      ([key]) =>
        !["durationInFrames", "hits", "breaks", "ending"].includes(key),
    ),
  );
  const bars = generateScore({
    ...base,
    bars: 2,
    arrangement: { ...recipe.arrangement, sections: [{ ...voices, bars: 2 }] },
  });
  assert.equal(bars.timeline.engine, "studio-v3");
  const searched = generateScore({
    ...recipe,
    bpmRange: [96, 116],
    ending: { landFrame: 162, cadence: "cut" },
  });
  assert.ok(
    (searched.timeline.bpm as number) >= 96 &&
      (searched.timeline.bpm as number) <= 116,
  );
  assert.ok(
    searched.audio.subarray(44 + 162 * 6400).every((byte) => byte === 0),
  );
});

test("v3 mastered WAV preserves measured onsets and silence without loudnorm pre-ringing", () => {
  const directory = mkdtempSync(join(tmpdir(), "axmorf-v3-master-"));
  try {
    const timeline = makeTimeline(recipe);
    for (const type of ["kick", "snare", "hat", "bass", "crash"]) {
      const event = (timeline.music as { type: string }[]).find(
        (entry) => entry.type === type,
      )!;
      const raw = synthesizeTimeline({
        ...timeline,
        breaks: [],
        ending: undefined,
        music: [{ ...event, frame: 30 }],
      });
      const audio = master(raw, directory, true);
      assert.equal(audio.length, raw.length);
      assert.equal(
        Math.floor((firstSoundingSample(audio) * 30) / 48000),
        30,
        type,
      );
      assert.deepEqual(master(raw, directory, true), audio);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

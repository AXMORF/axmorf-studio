import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import test from "node:test";

import {
  SynthesizedMusicTimelineSchema,
  resolveSceneMusicTiming,
} from "@axmorf/studio/contracts";

const script = resolve("scripts/films/score/synth-score.mjs");
const loadSynth = () => import(pathToFileURL(script).href);

test("original synthesis is repeatable, frame-aligned PCM with a fingerprinted fractional beat grid", async () => {
  const { generateScore } = await loadSynth();
  const recipe = { fps: 24, bpm: 103, bars: 2, seed: 19, style: "organic" };
  const first = generateScore(recipe);
  assert.deepEqual(generateScore(recipe), first);
  assert.notDeepEqual(
    generateScore({ ...recipe, seed: 20 }).audio,
    first.audio,
  );
  const timeline = SynthesizedMusicTimelineSchema.parse(first.timeline);
  assert.equal(timeline.durationInFrames, Math.round((8 * 60 * 24) / 103));
  assert.deepEqual(
    timeline.beatFrames,
    Array.from({ length: 8 }, (_, i) => Math.round((i * 60 * 24) / 103)),
  );
  assert.equal(
    first.audio.length,
    44 + Math.round((timeline.durationInFrames / 24) * 48_000) * 4,
  );
  assert.equal(
    timeline.audioChecksum,
    `sha256:${createHash("sha256").update(first.audio).digest("hex")}`,
  );
  assert.equal(
    SynthesizedMusicTimelineSchema.safeParse({ ...timeline, bpm: 105 }).success,
    false,
  );
});

test("one musical grid stays in phase across Scene and loop boundaries without moving speech windows", async () => {
  const { generateScore } = await loadSynth();
  const timeline = SynthesizedMusicTimelineSchema.parse(
    generateScore({ fps: 30, bpm: 120, bars: 1 }).timeline,
  );
  const first = resolveSceneMusicTiming({
    timeline,
    sceneStartFrame: 7,
    durationInFrames: 34,
  });
  const second = resolveSceneMusicTiming({
    timeline,
    sceneStartFrame: 41,
    durationInFrames: 46,
  });
  assert.deepEqual(first.beatFrames, [8, 23]);
  assert.deepEqual(second.beatFrames, [4, 19, 34]);
  assert.deepEqual(second.barFrames, [19]);
  assert.equal(first.sceneStartFrame, 7);
  assert.equal(second.sceneStartFrame, 41);
  assert.throws(() =>
    resolveSceneMusicTiming({
      timeline,
      sceneStartFrame: -1,
      durationInFrames: 30,
    }),
  );
});

test("audio events begin at the shared cue frame", async () => {
  const { makeTimeline, synthesizeTimeline, generateScore } = await loadSynth();
  const timeline = makeTimeline({ fps: 30, bpm: 120, bars: 1 });
  const audio = synthesizeTimeline({
    ...timeline,
    music: [
      { type: "kick", frame: 9, durationInFrames: 2, note: 36, gain: 0.7 },
    ],
  });
  const pcm = audio.subarray(44);
  assert.equal(
    pcm.subarray(0, 9 * 1600 * 4).every((sample: number) => sample === 0),
    true,
  );
  assert.notEqual(pcm.readInt16LE((9 * 1600 + 1) * 4), 0);
  assert.doesNotThrow(() =>
    SynthesizedMusicTimelineSchema.parse(
      generateScore({ fps: 30, bpm: 120, bars: 1 }).timeline,
    ),
  );
});

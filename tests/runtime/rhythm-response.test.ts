import assert from "node:assert/strict";
import test from "node:test";
import {
  pickRhythmResponse,
  resolveBoilSeed,
} from "../../packages/studio/src/remotion/capabilities/rhythm";

test("response rotation is deterministic, covers every choice and never repeats at adjacent cycle seams", () => {
  const choices = Object.freeze(["lift", "stamp", "pen", "sway"]);
  for (const seed of [0, 17, "paper"]) {
    const schedule = Array.from({ length: 100 }, (_, bar) =>
      pickRhythmResponse(bar, choices, { seed }),
    );
    assert.deepEqual(
      schedule,
      Array.from({ length: 100 }, (_, bar) =>
        pickRhythmResponse(bar, choices, { seed }),
      ),
    );
    for (let i = 1; i < schedule.length; i++)
      assert.notEqual(schedule[i], schedule[i - 1]);
    for (let i = 0; i < schedule.length; i += choices.length)
      assert.equal(
        new Set(schedule.slice(i, i + choices.length)).size,
        choices.length,
      );
  }
  assert.notDeepEqual(
    [0, 1, 2, 3].map((i) => pickRhythmResponse(i, choices, { seed: 0 })),
    [0, 1, 2, 3].map((i) => pickRhythmResponse(i, choices, { seed: 17 })),
  );
});
test("empty rotation is absent; duplicates are deduplicated and impossible single-choice rotation is explicit", () => {
  assert.equal(pickRhythmResponse(20, []), null);
  assert.throws(() => pickRhythmResponse(0, ["lift", "lift"]), /two distinct/u);
  for (const bar of [-1, 0.5, Infinity])
    assert.throws(() => pickRhythmResponse(bar, ["a", "b"]));
  for (let bar = 1; bar < 20; bar++)
    assert.notEqual(
      pickRhythmResponse(bar, ["a", "b", "a"]),
      pickRhythmResponse(bar - 1, ["a", "b", "a"]),
    );
});
test("boil steps preserve held drawings and adapt to fps or explicit integer steps", () => {
  assert.deepEqual(
    [0, 1, 2, 3, 5, 6].map((f) => resolveBoilSeed(f)),
    [0, 0, 0, 1, 1, 2],
  );
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((f) => resolveBoilSeed(f, { fps: 24 })),
    [0, 0, 1, 1, 2],
  );
  assert.equal(resolveBoilSeed(9, { fps: 60 }), 1);
  assert.equal(resolveBoilSeed(9, { stepFrames: 2 }), 4);
  assert.equal(resolveBoilSeed(-3), 0);
  for (const stepFrames of [0, -1, 0.5, Infinity])
    assert.throws(() => resolveBoilSeed(0, { stepFrames }));
  assert.throws(() => resolveBoilSeed(Infinity));
  assert.throws(() => resolveBoilSeed(0, { fps: 0 }));
});
test("beat-driven boil changes only on a beat, treats empty grids as still, and ignores duplicate beats", () => {
  const beats = [5, 15, 15, 30];
  assert.deepEqual(
    [0, 4, 5, 6, 14, 15, 29, 30, 100].map((f) => resolveBoilSeed(f, { beats })),
    [0, 0, 6, 6, 6, 16, 16, 31, 31],
  );
  assert.equal(resolveBoilSeed(100, { beats: [] }), 0);
  for (const invalid of [[5, 2], [-1], [0.5]])
    assert.throws(() => resolveBoilSeed(10, { beats: invalid }));
});

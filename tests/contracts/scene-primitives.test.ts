import assert from "node:assert/strict";
import test from "node:test";

import {
  SceneEventIdSchema,
  SceneLocalFrameRangeSchema,
  SceneLocalFrameSchema,
  SceneRendererIdSchema,
  ShotIdSchema,
  assertSceneLocalRangeWithinDuration,
  toSceneLocalFrame,
  toShotLocalFrame,
} from "../../src/contracts/scene-primitives";

test("scene identifiers are stable slugs rather than paths or module identities", () => {
  assert.equal(SceneRendererIdSchema.parse("renderer-opening"), "renderer-opening");
  assert.equal(ShotIdSchema.parse("opening-reveal"), "opening-reveal");
  assert.equal(SceneEventIdSchema.parse("first-pulse"), "first-pulse");

  for (const value of ["", "Opening", "two words", ".", "..", "../shot", "shots/one", "Renderer.tsx"]) {
    assert.throws(() => SceneRendererIdSchema.parse(value));
    assert.throws(() => ShotIdSchema.parse(value));
    assert.throws(() => SceneEventIdSchema.parse(value));
  }
});

test("scene local frames and ranges reject unsafe negative empty and overflowing values", () => {
  assert.equal(SceneLocalFrameSchema.parse(0), 0);
  assert.throws(() => SceneLocalFrameSchema.parse(-1));
  assert.throws(() => SceneLocalFrameSchema.parse(0.5));
  assert.throws(() => SceneLocalFrameSchema.parse(Number.MAX_SAFE_INTEGER + 1));

  const range = SceneLocalFrameRangeSchema.parse({startFrame: 3, endFrame: 10});
  assert.deepEqual(assertSceneLocalRangeWithinDuration(range, 10), range);
  assert.throws(() => SceneLocalFrameRangeSchema.parse({startFrame: 3, endFrame: 3}));
  assert.throws(() => SceneLocalFrameRangeSchema.parse({startFrame: 4, endFrame: 3}));
  assert.throws(() => assertSceneLocalRangeWithinDuration(range, 9));
  assert.throws(() => assertSceneLocalRangeWithinDuration(range, 0));
});

test("scene and shot frame helpers use exact local offsets and fail outside half-open ranges", () => {
  const beatRange = {startFrame: 100, endFrame: 140};
  const shotRange = {startFrame: 8, endFrame: 20};

  assert.equal(toSceneLocalFrame(100, beatRange), 0);
  assert.equal(toSceneLocalFrame(139, beatRange), 39);
  assert.equal(toShotLocalFrame(8, shotRange), 0);
  assert.equal(toShotLocalFrame(19, shotRange), 11);

  assert.throws(() => toSceneLocalFrame(99, beatRange));
  assert.throws(() => toSceneLocalFrame(140, beatRange));
  assert.throws(() => toShotLocalFrame(7, shotRange));
  assert.throws(() => toShotLocalFrame(20, shotRange));
  assert.throws(() => toSceneLocalFrame(Number.MAX_SAFE_INTEGER + 1, beatRange));
});

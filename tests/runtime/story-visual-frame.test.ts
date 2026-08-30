import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveSceneLocalFrame,
  resolveShotLocalFrame,
} from "@axmorf/studio/remotion";

test("Scene and Shot frame helpers preserve exact half-open local coordinates", () => {
  assert.equal(
    resolveSceneLocalFrame(20, { startFrame: 20, endFrame: 140 }),
    0,
  );
  assert.equal(
    resolveSceneLocalFrame(139, { startFrame: 20, endFrame: 140 }),
    119,
  );
  assert.equal(resolveShotLocalFrame(42, { startFrame: 40, endFrame: 80 }), 2);
  for (const frame of [19, 140]) {
    assert.throws(() =>
      resolveSceneLocalFrame(frame, { startFrame: 20, endFrame: 140 }),
    );
  }
  assert.throws(() =>
    resolveShotLocalFrame(80, { startFrame: 40, endFrame: 80 }),
  );
});

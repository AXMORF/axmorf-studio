import assert from "node:assert/strict";
import test from "node:test";

import {
  createSpokenFrameRanges,
  evaluateDuckEnvelope,
} from "../../src/remotion/runtime/global-sound/ducking";

const segments = [
  {kind: "chunk" as const, frameRange: {startFrame: 3, endFrame: 8}},
  {kind: "pause" as const, frameRange: {startFrame: 8, endFrame: 12}},
  {kind: "chunk" as const, frameRange: {startFrame: 12, endFrame: 18}},
];

test("spoken ranges ignore pauses and remain canonical", () => {
  assert.deepEqual(createSpokenFrameRanges(segments, 20), [
    {startFrame: 3, endFrame: 8},
    {startFrame: 12, endFrame: 18},
  ]);
});

test("duck envelope clamps attack release overlap and final frame", () => {
  const ranges = createSpokenFrameRanges(segments, 20);
  const input = {
    ranges,
    durationInFrames: 20,
    attackFrames: 3,
    releaseFrames: 4,
    spokenGain: 0.25,
    unspokenGain: 1,
  };
  assert.equal(evaluateDuckEnvelope({...input, frame: 0}), 1);
  assert.equal(evaluateDuckEnvelope({...input, frame: 3}), 0.25);
  assert.equal(evaluateDuckEnvelope({...input, frame: 8}), 0.25);
  assert.ok(evaluateDuckEnvelope({...input, frame: 10}) < 1);
  assert.equal(evaluateDuckEnvelope({...input, frame: 12}), 0.25);
  assert.equal(evaluateDuckEnvelope({...input, frame: 19}), 0.4375);
  assert.throws(() => evaluateDuckEnvelope({...input, frame: 20}));
});

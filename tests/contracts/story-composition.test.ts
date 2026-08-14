import assert from "node:assert/strict";
import test from "node:test";

import {
  FIXED_INTRO_DURATION_IN_FRAMES,
  FIXED_OUTRO_DURATION_IN_FRAMES,
  STORY_COMPOSITION_TIMELINE_VERSION,
  getStoryCompositionDurationInFrames,
  toStoryCompositionFrame,
} from "../../src/contracts/story-composition";

test("fixed bookends derive the final Composition duration without changing body frames", () => {
  assert.equal(FIXED_INTRO_DURATION_IN_FRAMES, 60);
  assert.equal(FIXED_OUTRO_DURATION_IN_FRAMES, 240);
  assert.equal(STORY_COMPOSITION_TIMELINE_VERSION, "fixed-bookends-v1");
  assert.equal(getStoryCompositionDurationInFrames(120), 420);
  assert.equal(toStoryCompositionFrame(0), 60);
  assert.equal(toStoryCompositionFrame(119), 179);
});

test("fixed bookend duration helpers reject unsafe frame values", () => {
  for (const frame of [-1, 1.5, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => getStoryCompositionDurationInFrames(frame));
  }
  assert.throws(() => toStoryCompositionFrame(-1));
});

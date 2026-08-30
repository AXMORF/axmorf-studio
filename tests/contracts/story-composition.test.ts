import assert from "node:assert/strict";
import test from "node:test";

import {
  STORY_COMPOSITION_TIMELINE_VERSION,
  getStoryCompositionDurationInFrames,
  toStoryCompositionFrame,
} from "@axmorf/studio/contracts";

test("ScenePackage timeline uses SemanticTiming frames without a boundary offset", () => {
  assert.equal(STORY_COMPOSITION_TIMELINE_VERSION, "scene-package-timeline-v1");
  assert.equal(getStoryCompositionDurationInFrames(120), 120);
  assert.equal(toStoryCompositionFrame(0), 0);
  assert.equal(toStoryCompositionFrame(119), 119);
});

test("ScenePackage timeline helpers reject unsafe frame values", () => {
  for (const frame of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => getStoryCompositionDurationInFrames(frame));
  }
  assert.throws(() => toStoryCompositionFrame(-1));
  assert.equal(
    toStoryCompositionFrame(Number.MAX_SAFE_INTEGER),
    Number.MAX_SAFE_INTEGER,
  );
});

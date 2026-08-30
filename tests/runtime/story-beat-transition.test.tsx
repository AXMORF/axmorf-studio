import assert from "node:assert/strict";
import { isValidElement } from "react";
import test from "node:test";
import { Sequence } from "remotion";

import { StoryBeatTransitionOverlay } from "@axmorf/studio/remotion";

test("hard cut creates no node and visual overlay stays inside an equal-duration boundary window", () => {
  assert.equal(
    StoryBeatTransitionOverlay({
      beatTransition: {
        fromMeaningId: "meaning-one",
        toMeaningId: "meaning-two",
        kind: "hard-cut",
        durationInFrames: 0,
        boundaryFrame: 140,
      },
    }),
    null,
  );
  const overlay = StoryBeatTransitionOverlay({
    beatTransition: {
      fromMeaningId: "meaning-one",
      toMeaningId: "meaning-two",
      kind: "visual-overlay-v1",
      durationInFrames: 12,
      boundaryFrame: 140,
    },
  });
  assert.ok(
    isValidElement<{ from: number; durationInFrames: number }>(overlay),
  );
  assert.equal(overlay.type, Sequence);
  assert.equal(overlay.props.from, 128);
  assert.equal(overlay.props.durationInFrames, 12);
});

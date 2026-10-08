import assert from "node:assert/strict";
import { isValidElement, type ReactNode } from "react";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Internals, Sequence } from "remotion";

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

test("a one-frame visual overlay renders one bounded pulse without a degenerate interpolation range", () => {
  const overlay = StoryBeatTransitionOverlay({
    beatTransition: {
      fromMeaningId: "meaning-one",
      toMeaningId: "meaning-two",
      kind: "visual-overlay-v1",
      durationInFrames: 1,
      boundaryFrame: 140,
    },
  });
  assert.ok(
    isValidElement<{
      children: ReactNode;
      from: number;
      durationInFrames: number;
    }>(overlay),
  );
  assert.equal(overlay.props.from, 139);
  assert.equal(overlay.props.durationInFrames, 1);
  const markup = renderToStaticMarkup(
    <Internals.CanUseRemotionHooksProvider>
      <Internals.TimelineContext.Provider
        value={{
          frame: {},
          playing: false,
          rootId: "test",
          imperativePlaying: { current: false },
          audioAndVideoTags: { current: [] },
        }}
      >
        {overlay.props.children}
      </Internals.TimelineContext.Provider>
    </Internals.CanUseRemotionHooksProvider>,
  );
  assert.match(markup, /opacity:0\.06/u);
});

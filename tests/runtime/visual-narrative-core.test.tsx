import assert from "node:assert/strict";
import test from "node:test";
import { Children, isValidElement } from "react";

import {
  NarrativeCore,
  CaptionLayer,
  NarrationAudioTrack,
} from "@axmorf/studio/remotion";

test("visual NarrativeCore omits narration while keeping the top-level caption owner", () => {
  const tree = NarrativeCore({
    src: null,
    narrationStartFrame: null,
    captionCues: [],
    safeAreaPx: { top: 20, right: 20, bottom: 20, left: 20 },
  });
  assert.ok(isValidElement<{ children: React.ReactNode }>(tree));
  const children = Children.toArray(tree.props.children);
  assert.equal(children.length, 1);
  assert.ok(isValidElement(children[0]));
  assert.equal(children[0].type, CaptionLayer);
});

test("narrated NarrativeCore preserves one audio track at its sealed start", () => {
  const tree = NarrativeCore({
    src: "narration.wav",
    narrationStartFrame: 60,
    captionCues: [],
    safeAreaPx: { top: 20, right: 20, bottom: 20, left: 20 },
  });
  assert.ok(isValidElement<{ children: React.ReactNode }>(tree));
  const children = Children.toArray(tree.props.children);
  const tracks = children.filter(
    (node) => isValidElement(node) && node.type === NarrationAudioTrack,
  );
  assert.equal(tracks.length, 1);
  assert.ok(isValidElement<{ narrationStartFrame: number }>(tracks[0]));
  assert.equal(tracks[0].props.narrationStartFrame, 60);
});

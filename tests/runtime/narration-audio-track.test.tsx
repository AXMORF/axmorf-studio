import assert from "node:assert/strict";
import test from "node:test";
import { isValidElement } from "react";
import { Sequence } from "remotion";

import { NarrationAudioTrack } from "../../packages/studio/src/remotion/runtime/narrative-core/NarrationAudioTrack";

test("authored-frame playback explicitly omits the narration audio track", () => {
  assert.equal(
    NarrationAudioTrack({ src: null, narrationStartFrame: null }),
    null,
  );
  for (const props of [
    { src: null, narrationStartFrame: 0 },
    { src: "narration.wav", narrationStartFrame: null },
    { src: "", narrationStartFrame: 0 },
    { src: "narration.wav", narrationStartFrame: -1 },
    { src: "narration.wav", narrationStartFrame: 0.5 },
  ])
    assert.throws(
      () => NarrationAudioTrack(props),
      /explicit absence of both/u,
    );
});

test("narrated playback retains its sealed start frame", () => {
  const element = NarrationAudioTrack({
    src: "narration.wav",
    narrationStartFrame: 15,
  });
  assert.ok(isValidElement<{ from: number }>(element));
  assert.equal(element.type, Sequence);
  assert.equal(element.props.from, 15);
});

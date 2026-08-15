import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  DefaultIntroPreview,
  DefaultOutroPreview,
  SYSTEM_BOOKEND_PREVIEW_SPECS,
} from "../../src/remotion/compositions/bookend-previews/BookendPreviews";

test("System bookend previews bind the default local cue timing and assets", async () => {
  assert.equal(typeof DefaultIntroPreview, "function");
  assert.equal(typeof DefaultOutroPreview, "function");
  assert.deepEqual(SYSTEM_BOOKEND_PREVIEW_SPECS, {
    intro: {
      durationInFrames: 60,
      cue: {
        startFrame: 6,
        durationInFrames: 18,
        volume: 0.82,
        publicPath:
          "public/assets/library/story-bookends/axmorf-intro-chime.wav",
        checksum:
          "sha256:739069dd51389ebac5704cdcd4b16ef43abc458a268931ab5817b834c1f2c475",
      },
    },
    outro: {
      durationInFrames: 240,
      cue: {
        startFrame: 120,
        durationInFrames: 30,
        volume: 0.82,
        publicPath:
          "public/assets/library/story-bookends/axmorf-outro-chime.wav",
        checksum:
          "sha256:7140b3c599b3656e5c3ee26c9c127a5d6a8deb26a336c67574114e4fdbe355b0",
      },
    },
  });
  const source = await readFile(
    new URL(
      "../../src/remotion/compositions/bookend-previews/BookendPreviews.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(source, /<Html5Audio/u);
  assert.match(source, /staticFile\(/u);
  assert.doesNotMatch(source, /src=\{?["']https?:\/\//u);
});

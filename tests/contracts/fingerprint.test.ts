import assert from "node:assert/strict";
import test from "node:test";

import {
  createFingerprint,
  serializeCanonicalJson,
} from "../../src/contracts/fingerprint";
import {
  computeGenerationInputFingerprint,
  computeStoryFingerprint,
} from "../../src/contracts/generation-input";
import { NarrationSpecSchema } from "../../src/contracts/narration";
import { StorySpecSchema } from "../../src/contracts/story";
import { validNarrationSpec, validStorySpec } from "../fixtures/narrative";

test("canonical JSON sorts object keys and preserves array order", () => {
  assert.equal(
    serializeCanonicalJson({ b: 2, a: [3, 1] }),
    '{"a":[3,1],"b":2}',
  );
  assert.notEqual(
    serializeCanonicalJson([1, 2]),
    serializeCanonicalJson([2, 1]),
  );
  assert.throws(() => serializeCanonicalJson({ invalid: undefined }));
  assert.throws(() => serializeCanonicalJson(Number.POSITIVE_INFINITY));
  assert.throws(() => serializeCanonicalJson(new Array(1)));
  assert.throws(() => serializeCanonicalJson({ [Symbol("hidden")]: true }));
});

test("fingerprint uses a stable domain-separated SHA-256 value", () => {
  assert.equal(
    createFingerprint({ namespace: "test", version: 1, value: { b: 2, a: 1 } }),
    "sha256:b4e91d40fea999175beb7d25b9b48f5328882e5bd798c61bff5544822fae64fa",
  );
});

test("generation fingerprint includes ordered ttsChunks and NarrationSpec v2 but excludes pauses", () => {
  const story = StorySpecSchema.parse(validStorySpec);
  const narration = NarrationSpecSchema.parse(validNarrationSpec);
  const changedPause = StorySpecSchema.parse({
    ...validStorySpec,
    beats: [
      {
        ...validStorySpec.beats[0],
        explicitPauses: [{ afterChunkId: "opening-01", pauseMs: 700 }],
      },
      validStorySpec.beats[1],
    ],
  });
  const changedText = StorySpecSchema.parse({
    ...validStorySpec,
    beats: [
      {
        ...validStorySpec.beats[0],
        ttsChunks: [{ chunkId: "opening-01", ttsText: "Changed" }],
      },
      validStorySpec.beats[1],
    ],
  });

  assert.equal(
    computeGenerationInputFingerprint(story, narration),
    computeGenerationInputFingerprint(changedPause, narration),
  );
  assert.notEqual(
    computeGenerationInputFingerprint(story, narration),
    computeGenerationInputFingerprint(changedText, narration),
  );
  assert.throws(() =>
    NarrationSpecSchema.parse({ ...validNarrationSpec, seed: 43 }),
  );
  assert.throws(() =>
    NarrationSpecSchema.parse({ ...validNarrationSpec, schemaVersion: 1 }),
  );
  assert.notEqual(
    computeStoryFingerprint(story),
    computeStoryFingerprint(changedPause),
  );
});

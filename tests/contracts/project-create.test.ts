import assert from "node:assert/strict";
import test from "node:test";

import {
  ProjectCreateInputSchema,
  computeProjectCreateInputFingerprint,
} from "../../src/contracts/project-create";
import { validProjectCreateInput } from "../fixtures/project-create";

test("ProjectCreateInput keeps exact authored Story and TTS chunks", () => {
  const parsed = ProjectCreateInputSchema.parse(validProjectCreateInput);
  assert.deepEqual(parsed.story, validProjectCreateInput.story);
  assert.equal(
    parsed.story.beats[0]?.ttsChunks[0]?.ttsText,
    "Measured audio is authority.",
  );
  assert.match(
    computeProjectCreateInputFingerprint(parsed),
    /^sha256:[0-9a-f]{64}$/u,
  );
});

test("ProjectCreateInput rejects cross-Project, derived, private, path, and runtime fields", () => {
  for (const mutation of [
    { ...validProjectCreateInput, storyId: "other-story" },
    {
      ...validProjectCreateInput,
      visualStyle: {
        ...validProjectCreateInput.visualStyle,
        resourceCatalogFingerprint: `sha256:${"a".repeat(64)}`,
      },
    },
    { ...validProjectCreateInput, providerToken: "private-token" },
    { ...validProjectCreateInput, outputPath: "/tmp/output.mp4" },
    { ...validProjectCreateInput, runtime: { durationInFrames: 300 } },
  ]) {
    assert.throws(() => ProjectCreateInputSchema.parse(mutation));
  }
});

test("ProjectCreateInput rejects silent TTS and incomplete Scene authored identity", () => {
  assert.throws(() =>
    ProjectCreateInputSchema.parse({
      ...validProjectCreateInput,
      story: {
        ...validProjectCreateInput.story,
        beats: [
          {
            kind: "silent-scene",
            meaningId: "silent",
            narrativePurpose: "Invalid caller-derived boundary.",
            ttsChunks: [{ chunkId: "invalid", ttsText: "Must reject." }],
          },
        ],
      },
    }),
  );
  assert.throws(() =>
    ProjectCreateInputSchema.parse({
      ...validProjectCreateInput,
      scenes: [],
    }),
  );
  assert.throws(() =>
    ProjectCreateInputSchema.parse({
      ...validProjectCreateInput,
      scenes: [
        {
          ...validProjectCreateInput.scenes[0],
          candidateResourceIds: ["capability.camera"],
        },
      ],
    }),
  );
});

test("ProjectCreateInput fingerprint is canonical and changes with authored TTS", () => {
  const first = computeProjectCreateInputFingerprint(validProjectCreateInput);
  const reordered = computeProjectCreateInputFingerprint({
    ...validProjectCreateInput,
    globalVisual: validProjectCreateInput.globalVisual,
    scenes: validProjectCreateInput.scenes,
    story: validProjectCreateInput.story,
    brief: validProjectCreateInput.brief,
  });
  assert.equal(first, reordered);
  assert.notEqual(
    first,
    computeProjectCreateInputFingerprint({
      ...validProjectCreateInput,
      story: {
        ...validProjectCreateInput.story,
        beats: [
          {
            ...validProjectCreateInput.story.beats[0],
            ttsChunks: [
              {
                chunkId: "opening-01",
                ttsText: "Changed exact authored words.",
              },
            ],
          },
        ],
      },
    }),
  );
});

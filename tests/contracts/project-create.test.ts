import assert from "node:assert/strict";
import test from "node:test";

import {
  ProjectCreateInputSchema,
  computeProjectCreateInputFingerprint,
} from "@axmorf/studio/contracts";
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

test("ProjectCreateInput accepts optional render overrides with the final media constraints", () => {
  const overrides = { width: 1920, height: 1080, fps: 24, locale: "en-US" };
  const input = {
    ...validProjectCreateInput,
    render: { ...validProjectCreateInput.render, ...overrides },
  };
  assert.deepEqual(ProjectCreateInputSchema.parse(input).render, input.render);
  assert.notEqual(
    computeProjectCreateInputFingerprint(input),
    computeProjectCreateInputFingerprint(validProjectCreateInput),
  );
  for (const invalid of [
    { width: 1081 },
    { height: 0 },
    { width: -1920 },
    { height: 1080.5 },
    { width: "1920" },
    { height: null },
    { fps: 0 },
    { fps: 121 },
    { fps: 29.97 },
    { locale: "en-us" },
    { locale: "" },
    { output: { container: "webm" } },
  ]) {
    assert.equal(
      ProjectCreateInputSchema.safeParse({
        ...validProjectCreateInput,
        render: { ...validProjectCreateInput.render, ...invalid },
      }).success,
      false,
      JSON.stringify(invalid),
    );
  }
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

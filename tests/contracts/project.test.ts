import assert from "node:assert/strict";
import test from "node:test";

import { NarrationSpecSchema } from "@axmorf/studio/contracts";
import {
  NARRATIVE_PROJECT_FILES,
  NarrativeProjectSourceSchema,
  StoryCompositionPropsSchema,
} from "@axmorf/studio/contracts";
import { RenderSpecSchema } from "@axmorf/studio/contracts";
import {
  validNarrationSpec,
  validProjectSource,
  validRenderSpec,
} from "../fixtures/narrative";

test("NarrationSpec v2 stores only the voice-clone identity", () => {
  assert.deepEqual(
    NarrationSpecSchema.parse(validNarrationSpec),
    validNarrationSpec,
  );
  assert.throws(() =>
    NarrationSpecSchema.parse({
      ...validNarrationSpec,
      providerUrl: "http://127.0.0.1:9000",
    }),
  );
  assert.throws(() =>
    NarrationSpecSchema.parse({ ...validNarrationSpec, token: "secret" }),
  );
  assert.throws(() =>
    NarrationSpecSchema.parse({ ...validNarrationSpec, seed: 42 }),
  );
});

test("RenderSpec validates dimensions and the fixed v1 output tuple", () => {
  assert.deepEqual(RenderSpecSchema.parse(validRenderSpec), validRenderSpec);
  assert.throws(() =>
    RenderSpecSchema.parse({ ...validRenderSpec, width: 1919 }),
  );
  assert.throws(() =>
    RenderSpecSchema.parse({
      ...validRenderSpec,
      output: { ...validRenderSpec.output, audioCodec: "opus" },
    }),
  );
});

test("project source identity and Composition props use the Story slug", () => {
  assert.equal(
    NarrativeProjectSourceSchema.parse(validProjectSource).story.storyId,
    "story-example",
  );
  assert.throws(() =>
    NarrativeProjectSourceSchema.parse({
      ...validProjectSource,
      brief: { ...validProjectSource.brief, storyId: "different-story" },
    }),
  );
  assert.deepEqual(
    StoryCompositionPropsSchema.parse({ projectId: "story-example" }),
    {
      projectId: "story-example",
    },
  );
  assert.deepEqual(NARRATIVE_PROJECT_FILES, {
    brief: "brief.json",
    story: "story.json",
    narration: "narration.json",
    render: "render.json",
    sealedNarration: "generated/sealed-narration.generated.json",
    masteredNarration: "generated/mastered-narration.generated.json",
    semanticTiming: "generated/semantic-timing.generated.json",
  });
});

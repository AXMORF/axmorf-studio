import assert from "node:assert/strict";
import test from "node:test";

import {
  CompositionIdSchema,
  MeaningIdSchema,
  PublicProjectPathSchema,
  Sha256DigestSchema,
  StoryIdSchema,
  TtsChunkIdSchema,
} from "@axmorf/studio/contracts";

test("stable ids accept lowercase slugs and reject paths or whitespace", () => {
  assert.equal(StoryIdSchema.parse("story-example"), "story-example");
  assert.equal(MeaningIdSchema.parse("opening-claim"), "opening-claim");
  assert.equal(TtsChunkIdSchema.parse("opening-01"), "opening-01");
  assert.throws(() => StoryIdSchema.parse("Story Example"));
  assert.throws(() => MeaningIdSchema.parse("../opening"));
});

test("composition ids use the Remotion-safe local subset", () => {
  assert.equal(CompositionIdSchema.parse("StoryExample_01"), "StoryExample_01");
  assert.throws(() => CompositionIdSchema.parse("Story Example"));
  assert.throws(() => CompositionIdSchema.parse(".hidden"));
});

test("repository artifact paths stay under public/projects", () => {
  assert.equal(
    PublicProjectPathSchema.parse(
      "public/projects/story-example/narration/complete.wav",
    ),
    "public/projects/story-example/narration/complete.wav",
  );
  assert.throws(() => PublicProjectPathSchema.parse("/tmp/complete.wav"));
  assert.throws(() =>
    PublicProjectPathSchema.parse("public/projects/../secret.wav"),
  );
  assert.throws(() =>
    PublicProjectPathSchema.parse("public\\projects\\story.wav"),
  );
});

test("sha256 digests are lowercase and prefixed", () => {
  const digest = `sha256:${"a".repeat(64)}`;
  assert.equal(Sha256DigestSchema.parse(digest), digest);
  assert.throws(() => Sha256DigestSchema.parse("a".repeat(64)));
  assert.throws(() => Sha256DigestSchema.parse(`sha256:${"A".repeat(64)}`));
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  StorySpecSchema,
  resolveStorySceneGroups,
} from "@axmorf/studio/contracts";

const beats = ["opening", "mechanism", "result"].map((meaningId) => ({
  kind: "narrated-scene" as const,
  meaningId,
  narrativePurpose: meaningId,
  ttsChunks: [{ chunkId: `${meaningId}-speech`, ttsText: meaningId }],
  explicitPauses: [],
}));
const story = {
  schemaVersion: 3,
  storyId: "continuous-proof",
  title: "Continuous",
  beats,
};

test("one visual Scene owns consecutive semantic Beats while preserving their identities", () => {
  const parsed = StorySpecSchema.parse({
    ...story,
    visualScenes: [{ meaningIds: beats.map((beat) => beat.meaningId) }],
  });
  const groups = resolveStorySceneGroups(parsed);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].meaningId, "opening");
  assert.deepEqual(
    groups[0].beats.map((beat) => beat.meaningId),
    ["opening", "mechanism", "result"],
  );
  assert.equal(parsed.beats.length, 3);
  assert.equal(resolveStorySceneGroups(StorySpecSchema.parse(story)).length, 3);
});

test("visual ownership rejects gaps, overlaps, reorder and unknown identities", () => {
  for (const meaningIds of [
    ["opening", "result"],
    ["mechanism", "opening", "result"],
    ["opening", "opening", "result"],
    ["opening", "mechanism", "unknown"],
  ]) {
    assert.equal(
      StorySpecSchema.safeParse({ ...story, visualScenes: [{ meaningIds }] })
        .success,
      false,
    );
  }
  assert.equal(
    StorySpecSchema.safeParse({
      ...story,
      visualScenes: [
        { meaningIds: ["opening", "mechanism"] },
        { meaningIds: ["mechanism", "result"] },
      ],
    }).success,
    false,
  );
});

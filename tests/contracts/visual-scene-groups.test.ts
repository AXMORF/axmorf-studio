import assert from "node:assert/strict";
import test from "node:test";
import {
  StorySpecSchema,
  resolveStorySceneGroups,
  aggregateSceneStoryBeat,
  aggregateSceneTimingBeat,
  generateVisualSemanticTiming,
  RenderSpecSchema,
} from "@axmorf/studio/contracts";

import { validRenderSpec } from "../fixtures/narrative";

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

test("published visual-scene frame timing supports one continuous owner without merging semantic identities", () => {
  const visual = StorySpecSchema.parse({
    ...story,
    beats: beats.map((beat, index) => ({
      kind: "visual-scene",
      meaningId: beat.meaningId,
      narrativePurpose: beat.narrativePurpose,
      durationInFrames: [60, 90, 120][index],
    })),
    visualScenes: [{ meaningIds: beats.map(({ meaningId }) => meaningId) }],
  });
  const timing = generateVisualSemanticTiming({
    story: visual,
    render: RenderSpecSchema.parse({
      ...validRenderSpec,
      leadInFrames: 0,
      tailFrames: 0,
    }),
  });
  const group = resolveStorySceneGroups(visual)[0];
  const owner = aggregateSceneStoryBeat(group.beats);
  assert.equal(owner.kind, "visual-scene");
  if (owner.kind !== "visual-scene") throw new Error("Visual owner missing");
  assert.equal(owner.durationInFrames, 270);
  const window = aggregateSceneTimingBeat(
    timing.storyBeats,
    group.beats.map(({ meaningId }) => meaningId),
    owner,
  );
  assert.equal(window.meaningId, "opening");
  assert.equal(window.endFrame - window.startFrame, 270);
  assert.equal(timing.algorithmId, "authored-frames-v1");
  assert.equal(timing.storyBeats.length, 3);
  assert.deepEqual(timing.captionCues, []);
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPublishingIntent,
  buildSilentScenePreset,
  computePublishingCollectionCatalogFingerprint,
} from "@axmorf/studio/contracts";
import { validStorySpec } from "../fixtures/narrative";

const collections = [
  {
    id: "ai-workflow",
    name: "AI 工作流",
    description: "AI 工具、工作流与系统重构相关内容。",
  },
  {
    id: "tech-explained",
    name: "技术解释",
    description: "面向非专业观众的技术概念解释。",
  },
] as const;

const authored = {
  description: "A publishing description.",
  topics: ["one", "two", "three", "four", "five", "six"],
  collectionId: "ai-workflow",
  chapters: validStorySpec.beats.map(({ meaningId }, index) => ({
    meaningId,
    name: index === 0 ? "开场" : "结论",
  })),
} as const;

test("publishing intent freezes one selected collection from the configured array", () => {
  const intent = buildPublishingIntent({
    story: validStorySpec,
    authored,
    publishingCollections: collections,
  });
  assert.equal(intent.schemaVersion, 2);
  assert.equal(intent.contractVersion, "publishing-intent-v2");
  assert.deepEqual(intent.collection, {
    id: "ai-workflow",
    name: "AI 工作流",
    catalogFingerprint:
      computePublishingCollectionCatalogFingerprint(collections),
  });
});

test("authored-frame films accept no chapters or ordered content chapters, while narrated films still require coverage", () => {
  const story = {
    schemaVersion: 3,
    storyId: validStorySpec.storyId,
    title: "A visual film",
    timingSource: "authored-frames",
    beats: ["gather", "resolve"].map((meaningId) => ({
      kind: "silent-scene",
      meaningId,
      narrativePurpose: meaningId,
      preset: buildSilentScenePreset({
        presetId: meaningId,
        durationInFrames: 30,
        visualIntent: "Keep one moving subject.",
        soundIntent: "No narration.",
        resourceIds: [],
        implementation: { kind: "scene-owner" },
      }),
    })),
  };
  const build = (
    chapters:
      | typeof authored.chapters
      | readonly { meaningId: string; name: string }[],
  ) =>
    buildPublishingIntent({
      story,
      authored: { ...authored, chapters },
      publishingCollections: collections,
    });
  assert.deepEqual(build([]).chapters, []);
  const chapters = [
    { meaningId: "gather", name: "收束" },
    { meaningId: "resolve", name: "结果" },
  ];
  assert.deepEqual(build(chapters).chapters, chapters);
  assert.throws(() => build(chapters.slice(0, 1)));
  assert.throws(() => build([...chapters].reverse()));
  assert.throws(() => build([{ meaningId: "unknown", name: "未知" }]));
  assert.throws(() =>
    buildPublishingIntent({
      story: validStorySpec,
      authored: { ...authored, chapters: [] },
      publishingCollections: collections,
    }),
  );
});

test("publishing intent rejects a free-text or missing collection", () => {
  assert.throws(() =>
    buildPublishingIntent({
      story: validStorySpec,
      authored: { ...authored, collectionId: "not-configured" },
      publishingCollections: collections,
    }),
  );
  assert.throws(() =>
    buildPublishingIntent({
      story: validStorySpec,
      authored: { ...authored, collection: "free text" },
      publishingCollections: collections,
    }),
  );
});

test("publishing intent rejects topics containing whitespace", () => {
  for (const topic of [
    "AI workflow",
    "AI\u0085workflow",
    "AI\u00a0workflow",
    "AI\u3000workflow",
    "AI\ufeffworkflow",
    " AI",
    "AI ",
    "AI\tworkflow",
  ]) {
    assert.throws(() =>
      buildPublishingIntent({
        story: validStorySpec,
        authored: {
          ...authored,
          topics: [topic, "two", "three", "four", "five", "six"],
        },
        publishingCollections: collections,
      }),
    );
  }
});

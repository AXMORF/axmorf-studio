import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPublishingIntent,
  computePublishingCollectionCatalogFingerprint,
} from "../../src/contracts";
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

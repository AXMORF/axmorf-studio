import assert from "node:assert/strict";
import test from "node:test";

import type {
  DeliveryPublish,
  SemanticTiming,
  SourceCurrentAttestation,
} from "../../src/contracts";
import { buildWorkspacePreviewCatalog } from "../../desktop/adapters/workspace-preview-catalog";
import { createWorkspaceProductionLocations } from "../../scripts/project-production/application/production-locations";

const locations = createWorkspaceProductionLocations({
  workspaceRoot: "/workspace",
  applicationSupportRoot: "/app-support",
  runtimeResources: "/app/Resources/runtime-pack",
  cacheRoot: "/cache",
});
const revisionId = `revision-${"a".repeat(64)}`;
const sourceCurrentId = `source-current-${"b".repeat(64)}`;
const runtimeFingerprint = `sha256:${"c".repeat(64)}`;

const source = {
  storyId: "story-one",
  revisionId,
  sourceCurrentId,
} as unknown as SourceCurrentAttestation;

const timing = {
  storyId: "story-one",
  fps: 30,
  durationInFrames: 60,
  leadInFrames: 0,
  tailFrames: 0,
  narrationStartFrame: 0,
  storyBeats: [
    {
      kind: "narrated-scene",
      meaningId: "opening",
      startFrame: 0,
      endFrame: 60,
    },
  ],
  segments: [
    {
      kind: "chunk",
      chunkId: "opening-one",
      meaningId: "opening",
      ttsText: "Opening",
      frameRange: { startFrame: 0, endFrame: 60 },
    },
  ],
  captionCues: [
    {
      chunkId: "opening-one",
      meaningId: "opening",
      text: "Opening",
      startFrame: 0,
      endFrame: 60,
    },
  ],
} as unknown as SemanticTiming;

const publish = (rendererRuntimeFingerprint = runtimeFingerprint) =>
  ({
    storyId: "story-one",
    revisionId,
    sourceCurrentId,
    rendererRuntimeFingerprint,
    deliveryBuildId: `delivery-${"d".repeat(64)}`,
    compositionId: "StoryOne",
    width: 1080,
    height: 1920,
    fps: 30,
    frameCount: 60,
    artifacts: {
      video: { checksum: `sha256:${"e".repeat(64)}`, sizeBytes: 1024 },
    },
    publishing: {
      title: "Story one",
      chapters: [{ meaningId: "opening", name: "开场" }],
    },
  }) as unknown as DeliveryPublish;

const dependencies = (delivery: DeliveryPublish | null) => ({
  discoverProjects: async () => ["story-one"],
  readStory: async () => ({ storyId: "story-one", title: "Story one" }),
  readRender: async () => ({
    schemaVersion: 1 as const,
    compositionId: "StoryOne" as never,
    fps: 30,
    width: 1080,
    height: 1920,
    locale: "zh-CN",
    leadInFrames: 0,
    tailFrames: 0,
    output: {
      container: "mp4" as const,
      videoCodec: "h264" as const,
      audioCodec: "aac" as const,
      audioChannels: 2 as const,
    },
  }),
  readTiming: async () => timing,
  readSourceCurrent: async () => source,
  verifySourceCurrent: async () => source,
  inspectDelivery: async () => delivery,
});

test("source-current without Delivery is explicit and never playable", async () => {
  const snapshot = await buildWorkspacePreviewCatalog({
    locations,
    rendererRuntimeFingerprint: runtimeFingerprint,
    dependencies: dependencies(null),
  });
  assert.deepEqual(snapshot.catalog.entries, []);
  assert.deepEqual(snapshot.catalog.unavailable, [
    { storyId: "story-one", code: "delivery-missing" },
  ]);
  assert.equal(snapshot.projects[0]?.source, "current");
  assert.equal(snapshot.projects[0]?.delivery, "missing");
});

test("runtime fingerprint drift makes Delivery stale without invalidating source", async () => {
  const snapshot = await buildWorkspacePreviewCatalog({
    locations,
    rendererRuntimeFingerprint: runtimeFingerprint,
    dependencies: dependencies(publish(`sha256:${"f".repeat(64)}`)),
  });
  assert.deepEqual(snapshot.catalog.entries, []);
  assert.equal(snapshot.catalog.unavailable[0]?.code, "delivery-stale");
  assert.equal(snapshot.projects[0]?.source, "current");
  assert.equal(snapshot.projects[0]?.delivery, "stale");
});

test("only source/runtime-bound exact Delivery enters Preview Catalog", async () => {
  const snapshot = await buildWorkspacePreviewCatalog({
    locations,
    rendererRuntimeFingerprint: runtimeFingerprint,
    dependencies: dependencies(publish()),
  });
  assert.equal(snapshot.catalog.entries[0]?.storyId, "story-one");
  assert.equal(snapshot.projects[0]?.delivery, "current");
  assert.doesNotMatch(
    JSON.stringify(snapshot.catalog),
    /workspace|runtime-pack|absolutePath|repositoryPath/iu,
  );
});

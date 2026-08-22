import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import {
  PreviewCatalogSchema,
  projectPreviewCatalogForPlayer,
} from "../../desktop/contracts/preview";

test("renderer receives an opaque URL and no path, checksum, or byte size", () => {
  const engineCatalog = PreviewCatalogSchema.parse({
    schemaVersion: 1,
    contractVersion: "desktop-preview-catalog-v1",
    entries: [
      {
        storyId: "story-one",
        revisionId: `revision-${"b".repeat(64)}`,
        deliveryBuildId: `delivery-${"c".repeat(64)}`,
        compositionId: "StoryOne",
        title: "Story one",
        width: 1920,
        height: 1080,
        fps: 30,
        frameCount: 60,
        video: { checksum: `sha256:${"a".repeat(64)}`, sizeBytes: 1024 },
        timeline: {
          durationInFrames: 60,
          leadInFrames: 0,
          tailFrames: 0,
          narrationStartFrame: 0,
          scenes: [
            {
              kind: "narrated-scene",
              meaningId: "opening",
              label: "Opening",
              startFrame: 0,
              endFrame: 60,
            },
          ],
          narration: [
            {
              kind: "chunk",
              chunkId: "opening-one",
              meaningId: "opening",
              text: "Opening",
              startFrame: 0,
              endFrame: 60,
            },
          ],
          captions: [
            {
              chunkId: "opening-one",
              meaningId: "opening",
              text: "Opening",
              startFrame: 0,
              endFrame: 60,
            },
          ],
        },
      },
    ],
    unavailable: [],
  });
  const playerCatalog = projectPreviewCatalogForPlayer(engineCatalog);
  const serialized = JSON.stringify(playerCatalog);
  assert.match(serialized, /axmorf-media:\/\/delivery\/story-one\//u);
  assert.doesNotMatch(serialized, /checksum|sizeBytes|\/deliveries\//u);
});

test("bundled renderer uses native video and exposes three read-only tracks", async () => {
  const [app, html] = await Promise.all([
    readFile(join(process.cwd(), "desktop/renderer/App.tsx"), "utf8"),
    readFile(join(process.cwd(), "desktop/renderer/index.html"), "utf8"),
  ]);
  assert.match(app, /<video/u);
  assert.match(app, /addEventListener\("seeking", sync\)/u);
  assert.match(app, /addEventListener\("seeked", sync\)/u);
  assert.match(app, /addEventListener\("timeupdate", sync\)/u);
  assert.match(app, /Scene/u);
  assert.match(app, /Narration/u);
  assert.match(app, /Caption/u);
  assert.doesNotMatch(app, /@remotion\/player|<Player/u);
  assert.match(html, /media-src 'self' axmorf-media:/u);
  assert.doesNotMatch(html, /https?:\/\//u);
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  RenderLaunchIntentSchema,
  buildDeliveryLaunchManifest,
  buildDeliveryPublishing,
  buildRenderLaunchIntent,
  buildRenderLaunchReceipt,
  createDeliveryId,
} from "../../src/contracts/delivery-launch";

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;

const identity = {
  storyId: "story-example",
  publishingIntentFingerprint: sha("1"),
  publishingChecksum: sha("8"),
  assetAttributionsFingerprint: sha("9"),
  assetAttributionsChecksum: sha("a"),
  coverResultFingerprint: sha("2"),
  renderReadyFingerprint: sha("3"),
  renderPlanFingerprint: sha("4"),
  compositionId: "StoryExample",
  renderArgs: [
    "render",
    "src/index.ts",
    "StoryExample",
    "deliveries/story-example/story-example.mp4",
    "--codec=h264",
    "--audio-codec=aac",
    "--pixel-format=yuv420p",
  ],
  renderLaunchPolicyVersion: "detached-spawn-acknowledgement-v1",
} as const;

test("publishing chapters derive floor-rounded HH:MM:SS from frames", () => {
  const publishing = buildDeliveryPublishing({
    storyId: "story-example",
    title: "Story example",
    description: "A current publishing description.",
    topics: ["one", "two", "three", "four", "five", "six"],
    collection: "Current stories",
    outputFileName: "story-example.mp4",
    coverFileNames: {
      cover4x3: "cover-4x3.png",
      cover3x4: "cover-3x4.png",
    },
    fps: 30,
    frameCount: 120_000,
    plannedDurationSeconds: 4_000,
    chapters: [
      {
        meaningId: "opening",
        name: "开场",
        startFrame: 111_719,
        timecode: "01:02:03",
      },
    ],
  });
  assert.equal(publishing.contractVersion, "delivery-publishing-v2");
  assert.equal(publishing.chapters[0]?.timecode, "01:02:03");
  assert.deepEqual(publishing.coverFileNames, {
    cover4x3: "cover-4x3.png",
    cover3x4: "cover-3x4.png",
  });
  assert.throws(() =>
    buildDeliveryPublishing({
      ...publishing,
      coverFileNames: {
        ...publishing.coverFileNames,
        cover3x4: "wrong.png",
      },
    }),
  );
  assert.throws(() =>
    buildDeliveryPublishing({
      ...publishing,
      chapters: [
        {
          ...publishing.chapters[0],
          timecode: "01:02:04",
        },
      ],
    }),
  );
  assert.throws(() =>
    buildDeliveryPublishing({
      ...publishing,
      chapters: [
        {
          ...publishing.chapters[0],
          startSeconds: 3_723.9,
        },
      ],
    }),
  );
  for (const topic of [
    "AI workflow",
    "AI\u0085workflow",
    "AI\ufeffworkflow",
    " AI",
    "AI ",
    "AI\tworkflow",
  ]) {
    assert.throws(() =>
      buildDeliveryPublishing({
        ...publishing,
        topics: [topic, "two", "three", "four", "five", "six"],
      }),
    );
  }
});

test("delivery identity excludes MP4 completion facts", () => {
  const deliveryId = createDeliveryId(identity);
  const manifest = buildDeliveryLaunchManifest({
    ...identity,
    deliveryId,
    plannedDurationSeconds: 4,
    fps: 30,
    frameCount: 120,
    files: {
      cover4x3: {
        fileName: "cover-4x3.png",
        checksum: sha("5"),
        sizeBytes: 10,
      },
      cover3x4: {
        fileName: "cover-3x4.png",
        checksum: sha("6"),
        sizeBytes: 11,
      },
      publishing: {
        fileName: "publishing.json",
        checksum: sha("7"),
        sizeBytes: 12,
      },
      assetAttributions: {
        fileName: "asset-attributions.json",
        checksum: sha("a"),
        sizeBytes: 13,
      },
    },
  });

  assert.match(deliveryId, /^delivery-[a-f0-9]{64}$/u);
  assert.notEqual(
    createDeliveryId({ ...identity, publishingChecksum: sha("9") }),
    deliveryId,
  );
  assert.notEqual(
    createDeliveryId({ ...identity, assetAttributionsChecksum: sha("b") }),
    deliveryId,
  );
  assert.equal(manifest.contractVersion, "delivery-launch-manifest-v4");
  assert.doesNotMatch(
    JSON.stringify(manifest),
    /actualDuration|mp4Checksum|decode|approved|render-succeeded|complete/iu,
  );
});

test("launch intent and receipt prove only the spawn acknowledgement", () => {
  const deliveryId = createDeliveryId(identity);
  const intent = buildRenderLaunchIntent({
    ...identity,
    deliveryId,
    outputPath: "deliveries/story-example/story-example.mp4",
    logPath: `out/story-example/delivery-render/${deliveryId}.log`,
  });
  const receipt = buildRenderLaunchReceipt({
    intent,
    startedAt: "2026-08-09T00:00:00.000Z",
  });

  assert.equal(intent.contractVersion, "render-launch-intent-v4");
  assert.equal(receipt.contractVersion, "render-launch-receipt-v4");
  assert.equal(receipt.status, "render-started");
  assert.equal("pid" in receipt, false);
  assert.doesNotMatch(JSON.stringify(receipt), /succeeded|complete|verified/iu);
  assert.throws(() => RenderLaunchIntentSchema.parse({ ...intent, pid: 123 }));
});

test("launch argv keeps the fixed Project output path", () => {
  const storyId = "delivery-path-example";
  const collisionIdentity = {
    ...identity,
    storyId,
    compositionId: "DeliveryPlaceholder",
    renderArgs: [
      "render",
      "src/index.ts",
      "DeliveryPlaceholder",
      `deliveries/${storyId}/${storyId}.mp4`,
      "--codec=h264",
      "--audio-codec=aac",
      "--pixel-format=yuv420p",
    ],
  } as const;

  const intent = buildRenderLaunchIntent(collisionIdentity);

  assert.equal(intent.args[3], intent.outputPath);
  assert.equal(intent.args[2], collisionIdentity.compositionId);
});

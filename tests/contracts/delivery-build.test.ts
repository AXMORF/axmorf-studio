import assert from "node:assert/strict";
import test from "node:test";

import {
  DELIVERY_BUILD_POLICY_VERSION,
  buildDeliveryPublish,
  buildDeliveryPublishing,
  createDeliveryBuildId,
  createFingerprint,
} from "../../src/contracts";

const digest = (character: string) => `sha256:${character.repeat(64)}`;
const revisionId = `revision-${"a".repeat(64)}`;

test("Delivery publish validates the exact content identity without treating payload fields as identity", () => {
  const publishing = buildDeliveryPublishing({
    storyId: "delivery-contract",
    title: "Contract delivery",
    description: "A synchronous four-file delivery contract.",
    topics: ["contract", "delivery", "remotion", "revision", "artifact", "video"],
    collection: "Engineering",
    outputFileName: "video.mp4",
    coverFileNames: {
      cover4x3: "cover-4x3.png",
      cover3x4: "cover-3x4.png",
    },
    fps: 30,
    frameCount: 90,
    plannedDurationSeconds: 3,
    chapters: [
      { meaningId: "opening", name: "开场", startFrame: 0, timecode: "00:00:00" },
    ],
  });
  const identity = {
    storyId: "delivery-contract",
    revisionId,
    sourceCurrentId: `source-current-${"b".repeat(64)}`,
    rendererRuntimeFingerprint: digest("f"),
    publishingFingerprint: createFingerprint({
      namespace: "delivery-publishing-input",
      version: 1,
      value: publishing,
    }),
    compositionId: "DeliveryContract",
    fps: 30,
    frameCount: 90,
    width: 1920,
    height: 1080,
    policyVersion: DELIVERY_BUILD_POLICY_VERSION,
  } as const;
  const deliveryBuildId = createDeliveryBuildId(identity);
  const videoMedia = {
    codec: "h264" as const,
    audioCodec: "aac" as const,
    audioChannels: 2 as const,
    width: 1920,
    height: 1080,
    fps: 30,
    frameCount: 90,
    decodedToEof: true as const,
  };
  const cover = (width: number, height: number) => ({
    imageFormat: "png" as const,
    width,
    height,
    decodedToEof: true as const,
  });

  const publish = buildDeliveryPublish({
    ...identity,
    deliveryBuildId,
    artifacts: {
      video: {
        logicalPath: `deliveries/${identity.storyId}/video.mp4`,
        checksum: digest("c"),
        sizeBytes: 3,
        media: videoMedia,
      },
      cover4x3: {
        logicalPath: `deliveries/${identity.storyId}/cover-4x3.png`,
        checksum: digest("d"),
        sizeBytes: 4,
        media: cover(1600, 1200),
      },
      cover3x4: {
        logicalPath: `deliveries/${identity.storyId}/cover-3x4.png`,
        checksum: digest("e"),
        sizeBytes: 5,
        media: cover(1200, 1600),
      },
    },
    publishing,
  });

  assert.equal(publish.deliveryBuildId, deliveryBuildId);
  assert.equal(publish.artifacts.video.logicalPath, "deliveries/delivery-contract/video.mp4");

  for (const changedIdentity of [
    {
      ...identity,
      sourceCurrentId: `source-current-${"2".repeat(64)}`,
    },
    {
      ...identity,
      rendererRuntimeFingerprint: digest("0"),
    },
    {
      ...identity,
      publishingFingerprint: digest("2"),
    },
  ] as const) {
    assert.notEqual(createDeliveryBuildId(changedIdentity), deliveryBuildId);
    assert.throws(
      () =>
        buildDeliveryPublish({
          ...publish,
          ...changedIdentity,
          deliveryBuildId,
        }),
      /Delivery build identity is stale/u,
    );
  }
});

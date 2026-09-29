import assert from "node:assert/strict";
import test from "node:test";

import {
  DELIVERY_FILE_NAMES,
  DELIVERY_FILES,
  deliveryArtifactPath,
  getFixedCoverDimensions,
} from "@axmorf/studio/contracts";

test("public delivery layout preserves exact filenames and rejects unsafe story paths", () => {
  assert.deepEqual(DELIVERY_FILE_NAMES, [
    "cover-3x4.png",
    "cover-4x3.png",
    "publish.json",
    "video.mp4",
  ]);
  assert.equal(
    deliveryArtifactPath("example-story", "video"),
    "deliveries/example-story/video.mp4",
  );
  assert.equal(
    deliveryArtifactPath("example-story", "cover4x3"),
    "deliveries/example-story/cover-4x3.png",
  );
  assert.equal(
    deliveryArtifactPath("example-story", "cover3x4"),
    "deliveries/example-story/cover-3x4.png",
  );
  for (const storyId of [
    "../other",
    "/tmp/story",
    "story/other",
    "story\\other",
  ]) {
    assert.throws(() => deliveryArtifactPath(storyId, "video"));
  }
  assert.equal(Reflect.set(DELIVERY_FILES, "video", "other.mp4"), false);
  assert.equal(Reflect.set(DELIVERY_FILE_NAMES, "0", "other.png"), false);
});

test("delivery cover dimensions retain the fixed cover contract", () => {
  assert.deepEqual(getFixedCoverDimensions("cover-4x3"), {
    width: 1600,
    height: 1200,
  });
  assert.deepEqual(getFixedCoverDimensions("cover-3x4"), {
    width: 1200,
    height: 1600,
  });
});

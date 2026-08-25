import assert from "node:assert/strict";
import test from "node:test";

import {
  currentPreviewPlayerError,
  fitPreviewPlayerSize,
  isFrameInEndExclusiveRange,
  previewPlayerAspectRatio,
  previewFrameToTime,
  timeToPreviewFrame,
} from "../../desktop/renderer/App";

test("video time maps to a clamped floor frame", () => {
  assert.equal(
    timeToPreviewFrame({ currentTime: 1.999, fps: 30, frameCount: 120 }),
    59,
  );
  assert.equal(
    timeToPreviewFrame({ currentTime: -1, fps: 30, frameCount: 120 }),
    0,
  );
  assert.equal(
    timeToPreviewFrame({ currentTime: 99, fps: 30, frameCount: 120 }),
    119,
  );
});

test("timeline ranges and seek use end-exclusive frame authority", () => {
  assert.equal(isFrameInEndExclusiveRange(10, 10, 20), true);
  assert.equal(isFrameInEndExclusiveRange(19, 10, 20), true);
  assert.equal(isFrameInEndExclusiveRange(20, 10, 20), false);
  assert.equal(previewFrameToTime(45, 30), 1.5);
});

test("a late error from the replaced Delivery cannot mask the current video", () => {
  const previousVideoUrl = `axmorf-media://delivery/story-one/delivery-${"a".repeat(64)}/video.mp4`;
  const currentVideoUrl = `axmorf-media://delivery/story-one/delivery-${"b".repeat(64)}/video.mp4`;
  const error = {
    videoUrl: previousVideoUrl,
    message: "stale video failed",
  };

  assert.equal(
    currentPreviewPlayerError({ error, videoUrl: previousVideoUrl }),
    error.message,
  );
  assert.equal(
    currentPreviewPlayerError({ error, videoUrl: currentVideoUrl }),
    null,
  );
  assert.equal(
    currentPreviewPlayerError({ error: null, videoUrl: null }),
    null,
  );
});

test("the Preview Player preserves the selected Delivery aspect ratio", () => {
  assert.equal(
    previewPlayerAspectRatio({ width: 540, height: 960 }),
    "540 / 960",
  );
  assert.equal(
    previewPlayerAspectRatio({ width: 1920, height: 1080 }),
    "1920 / 1080",
  );
});

test("the Preview Player contains portrait and landscape video boxes", () => {
  assert.deepEqual(
    fitPreviewPlayerSize({
      containerWidth: 948,
      containerHeight: 450,
      videoWidth: 540,
      videoHeight: 960,
    }),
    { width: 253.125, height: 450 },
  );
  assert.deepEqual(
    fitPreviewPlayerSize({
      containerWidth: 600,
      containerHeight: 450,
      videoWidth: 1920,
      videoHeight: 1080,
    }),
    { width: 600, height: 337.5 },
  );
});

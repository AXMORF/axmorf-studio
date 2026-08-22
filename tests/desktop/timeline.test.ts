import assert from "node:assert/strict";
import test from "node:test";

import {
  isFrameInEndExclusiveRange,
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

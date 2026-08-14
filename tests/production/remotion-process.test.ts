import assert from "node:assert/strict";
import test from "node:test";

import { buildProductionRenderArgs } from "../../scripts/production/adapters/remotion-process";

test("Narrative Baseline renders only the body range of a final-duration registration", () => {
  const args = buildProductionRenderArgs({
    compositionId: "StoryExample",
    outputPath: "out/story-example/m3-narrative-baseline.mp4",
    durationInFrames: 120,
  });
  assert.ok(args.includes("--frames=0-119"));
  assert.throws(() =>
    buildProductionRenderArgs({
      compositionId: "StoryExample",
      outputPath: "out/story-example/m3-narrative-baseline.mp4",
      durationInFrames: 0,
    }),
  );
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  VideoBriefSchema,
  StorySpecSchema,
  RenderSpecSchema,
  buildDurationBudget,
  buildProjectDurationBudget,
} from "@axmorf/studio/contracts";
import {
  validVideoBrief,
  validStorySpec,
  validRenderSpec,
} from "../fixtures/narrative";

test("the requested total includes boundary Scenes, lead-in and tail before budgeting narration", () => {
  const result = buildDurationBudget({
    targetDurationSeconds: 30,
    fps: 30,
    boundaryFrames: 300,
    leadInFrames: 15,
    tailFrames: 15,
  });
  assert.equal(result.boundarySeconds, 10);
  assert.equal(result.leadAndTailSeconds, 1);
  assert.equal(result.availableNarratedSeconds, 19);
  assert.equal(result.actualTotalSeconds, null);
  assert.equal(result.deltaSeconds, null);
  assert.equal(result.measurement, "not-yet-sealed");
  assert.equal(result.comparison, "not-yet-measured");
});

test("an exhausted budget is reported without rejecting the authoring or inventing a speech estimate", () => {
  for (const targetDurationSeconds of [9, 10]) {
    const result = buildDurationBudget({
      targetDurationSeconds,
      fps: 30,
      boundaryFrames: 300,
    });
    assert.equal(result.availableNarratedSeconds, 0);
    assert.equal(result.budgetState, "no-narration-budget");
    assert.equal(result.actualTotalSeconds, null);
  }
});

test("sealed frame duration is reported exactly without enforcing a hidden tolerance or replacing timing", () => {
  for (const [frames, comparison] of [
    [1045, "longer-than-target"],
    [900, "matches-target"],
    [899, "shorter-than-target"],
  ] as const) {
    const result = buildDurationBudget({
      targetDurationSeconds: 30,
      fps: 30,
      boundaryFrames: 300,
      actualDurationInFrames: frames,
    });
    assert.equal(result.actualTotalSeconds, frames / 30);
    assert.equal(result.deltaSeconds, frames / 30 - 30);
    assert.equal(result.comparison, comparison);
    assert.equal(result.measurement, "sealed-semantic-timing");
  }
});

test("a Project without boundary Scenes keeps its render padding in the total", () => {
  const result = buildProjectDurationBudget({
    brief: VideoBriefSchema.parse(validVideoBrief),
    story: StorySpecSchema.parse(validStorySpec),
    render: RenderSpecSchema.parse(validRenderSpec),
  });
  assert.equal(result.boundarySeconds, 0);
  assert.equal(
    result.availableNarratedSeconds,
    validVideoBrief.targetDurationSeconds -
      (validRenderSpec.leadInFrames + validRenderSpec.tailFrames) /
        validRenderSpec.fps,
  );
});

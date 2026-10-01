import assert from "node:assert/strict";
import test from "node:test";
import {
  buildShotPlanSet,
  SceneMotionPlanSchema,
} from "@axmorf/studio/contracts";
import { createScenePlans } from "../fixtures/scene/scene-input";
import {
  planMotionReview,
  planActionReview,
} from "../../scripts/scene-review/motion";
import { parseSceneReviewArguments } from "../../scripts/scene-review/cli";
import { motionState } from "../../proofs/motion-first/state";

test("Temporal review keeps whole scenes and overlaps exact boundaries", () => {
  const clips = planMotionReview(
    [
      { startFrame: 0, endFrame: 2 },
      { startFrame: 2, endFrame: 90 },
    ],
    30,
    90,
  );
  assert.deepEqual(
    clips.slice(0, 2).map(({ startFrame, endFrame }) => [startFrame, endFrame]),
    [
      [0, 2],
      [2, 90],
    ],
  );
  assert.deepEqual([clips[2].startFrame, clips[2].endFrame], [0, 25]);
  assert.equal(new Set(clips.map((c) => c.file)).size, clips.length);
  assert.equal(
    parseSceneReviewArguments(["--project", "story-example", "--motion"])
      .motion,
    true,
  );
  assert.throws(() =>
    parseSceneReviewArguments(["--project", "story-example", "--skip-review"]),
  );
});
test("Temporal review rejects gaps, overlaps and stale frame totals", () => {
  for (const ranges of [
    [],
    [{ startFrame: 1, endFrame: 90 }],
    [{ startFrame: 0, endFrame: 89 }],
    [
      { startFrame: 0, endFrame: 50 },
      { startFrame: 49, endFrame: 90 },
    ],
  ])
    assert.throws(() => planMotionReview(ranges, 30, 90));
});

test("Explicit lead-in and tail preserve the validated Scene timeline", () => {
  const clips = planMotionReview(
    [
      { startFrame: 15, endFrame: 56 },
      { startFrame: 56, endFrame: 84 },
    ],
    30,
    96,
    { startFrame: 15, endFrame: 84 },
  );
  assert.equal(clips[0].startFrame, 15);
  assert.equal(clips[1].endFrame, 84);
  assert.throws(() =>
    planMotionReview([{ startFrame: 15, endFrame: 83 }], 30, 96, {
      startFrame: 15,
      endFrame: 84,
    }),
  );
});
test("Sample animation is frame-order independent and continuous across narration boundaries", () => {
  const frames = [0, 106, 107, 213, 214, 314, 315, 456, 457, 607, 608, 757];
  const states = frames.map(motionState);
  assert.deepEqual([...frames].reverse().map(motionState).reverse(), states);
  for (const boundary of [107, 214, 315, 457, 608]) {
    const before = Object.values(motionState(boundary - 1)).flat();
    const after = Object.values(motionState(boundary)).flat();
    after.forEach((value, index) =>
      assert.ok(Math.abs(value - before[index]) < 0.08),
    );
  }
  assert.equal(motionState(106).answer, 0);
  assert.equal(motionState(213).answer, 1);
  assert.equal(motionState(757).tokens[2], 1);
});

test("Action review offsets cause/result/hold evidence and scopes revision without automatic approval", () => {
  const { shots } = createScenePlans();
  const state = {
    x: 0.5,
    y: 0.5,
    scale: 1,
    rotation: 0,
    opacity: 1,
    reveal: 1,
    value: 0,
  };
  const motionPlan = SceneMotionPlanSchema.parse({
    schemaVersion: 1,
    objects: [
      {
        objectId: "subject",
        meaning: "Measured subject",
        keyframes: [
          { frame: 0, state, easing: "linear" },
          { frame: 80, state: { ...state, value: 1 }, easing: "linear" },
          { frame: 119, state: { ...state, value: 1 }, easing: "linear" },
        ],
      },
    ],
    actions: [
      {
        actionId: "grow",
        shotId: shots.shots[0].shotId,
        kind: "compare",
        explanatoryPurpose: "Show the increase",
        initialState: "Zero",
        resultingState: "One",
        objectIds: ["subject"],
        frameRange: { startFrame: 0, endFrame: 120 },
        syncAnchorId: "outline-closes",
        readingHoldFrames: 30,
      },
    ],
    handoff: {
      kind: "end",
      reason: "Complete comparison",
      incoming: [],
      outgoing: [],
    },
  });
  const planned = planActionReview(
    buildShotPlanSet({ ...shots, motionPlan }),
    15,
  );
  assert.deepEqual(planned[0].sampleFrames, [15, 59, 104, 134]);
  assert.deepEqual(planned[0].readingHold, { startFrame: 105, endFrame: 135 });
  assert.deepEqual(planned[0].revisionTarget.meaningIds, [shots.meaningId]);
  assert.equal(planned[0].assessment, "needs-temporal-review");
  assert.deepEqual(planActionReview(shots, 15), []);
  assert.throws(() => planActionReview(shots, -1));
});

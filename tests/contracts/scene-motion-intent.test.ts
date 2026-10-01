import assert from "node:assert/strict";
import test from "node:test";
import {
  IntentSceneMotionPlanSchema,
  validateSceneMotionPlan,
  validateMotionContinuity,
} from "@axmorf/studio/contracts";
import { createScenePlans } from "../fixtures/scene/scene-input";
const intent = () =>
  IntentSceneMotionPlanSchema.parse({
    schemaVersion: 2,
    objects: [{ objectId: "quantity", meaning: "Measured quantity" }],
    actions: [
      {
        actionId: "explain",
        shotId: "trace-shot",
        kind: "authored-physical-simulation",
        explanatoryPurpose:
          "Show the increase through a content-specific simulation",
        initialState: "No measured amount",
        resultingState: "Forty measured units",
        objectIds: ["quantity"],
        frameRange: { startFrame: 0, endFrame: 120 },
        syncAnchorId: "outline-closes",
        readingHoldFrames: 30,
      },
    ],
    handoff: {
      kind: "motivated-cut",
      reason: "Switch to a different claim",
      incoming: [],
      outgoing: [],
    },
  });
const check = (plan: unknown) => {
  const { shots, anchors } = createScenePlans();
  return validateSceneMotionPlan({
    plan,
    shots: shots.shots,
    anchors: anchors.anchors,
    duration: 120,
    narrationCues: [{ startFrame: 0, endFrame: 120 }],
  });
};
test("Intent plans allow custom actions without mandatory geometry, trajectories or reusable components", () => {
  const plan = check(intent());
  assert.equal(plan.schemaVersion, 2);
  assert.ok(!("keyframes" in plan.objects[0]));
});
test("Intent plans still reject missing subjects, detached narration anchors, owning shots and empty purpose", () => {
  const plan = intent();
  for (const patch of [
    { objectIds: ["missing"] },
    { syncAnchorId: "missing" },
    { shotId: "missing" },
    { explanatoryPurpose: "" },
    { frameRange: { startFrame: 0, endFrame: 121 } },
  ])
    assert.throws(() =>
      check({ ...plan, actions: [{ ...plan.actions[0], ...patch }] }),
    );
});
test("Purposeful static hold and motivated cut have no required motion count", () => {
  const plan = intent();
  assert.doesNotThrow(() =>
    check({
      ...plan,
      actions: [
        {
          ...plan.actions[0],
          kind: "hold",
          syncAnchorId: null,
          readingHoldFrames: 0,
        },
      ],
    }),
  );
  assert.doesNotThrow(() => validateMotionContinuity([plan, plan]));
});
test("Custom continuity checks promised identity without claiming numerical pose or pixel proof", () => {
  const before = IntentSceneMotionPlanSchema.parse({
    ...intent(),
    handoff: {
      kind: "continuous",
      reason: "Follow the same quantity",
      incoming: [],
      outgoing: [{ continuityId: "quantity", objectId: "quantity" }],
    },
  });
  assert.throws(
    () => validateMotionContinuity([before, intent()]),
    /Missing continuity/u,
  );
  const after = IntentSceneMotionPlanSchema.parse({
    ...intent(),
    handoff: {
      ...intent().handoff,
      incoming: [{ continuityId: "quantity", objectId: "quantity" }],
    },
  });
  assert.doesNotThrow(() => validateMotionContinuity([before, after]));
});

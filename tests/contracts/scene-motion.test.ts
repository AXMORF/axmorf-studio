import assert from "node:assert/strict";
import test from "node:test";
import {
  TrackedSceneMotionPlanSchema as SceneMotionPlanSchema,
  buildShotPlanSet,
  resolveMotionTrackState,
  validateSceneMotionPlan,
  validateMotionContinuity,
} from "@axmorf/studio/contracts";
import { createScenePlans } from "../fixtures/scene/scene-input";

const state = (value = 0) => ({
  x: 0.5,
  y: 0.5,
  scale: 1,
  rotation: 0,
  opacity: 1,
  reveal: 1,
  value,
});
const motion = () =>
  SceneMotionPlanSchema.parse({
    schemaVersion: 1,
    objects: [
      {
        objectId: "measured-value",
        meaning: "Quantity being compared",
        keyframes: [
          { frame: 0, state: state(), easing: "linear" },
          { frame: 80, state: state(40), easing: "ease-in-out" },
          { frame: 119, state: state(40), easing: "linear" },
        ],
      },
    ],
    actions: [
      {
        actionId: "show-increase",
        shotId: "trace-shot",
        kind: "compare",
        explanatoryPurpose:
          "Show the measured increase rather than an unchanged number card",
        initialState: "No measured amount shown",
        resultingState: "Forty units shown",
        objectIds: ["measured-value"],
        frameRange: { startFrame: 0, endFrame: 120 },
        syncAnchorId: "outline-closes",
        readingHoldFrames: 30,
      },
    ],
    handoff: {
      kind: "end",
      reason: "Complete the standalone comparison",
      incoming: [],
      outgoing: [],
    },
  });
const check = (
  plan: unknown,
  narrationCues = [{ startFrame: 0, endFrame: 120 }],
) => {
  const { shots, anchors } = createScenePlans();
  return validateSceneMotionPlan({
    plan,
    shots: shots.shots,
    anchors: anchors.anchors,
    duration: 120,
    narrationCues,
  });
};

test("Motion plans bind changed states to exact shots, narration anchors and stable reading holds", () => {
  const plan = check(motion());
  assert.equal(plan.schemaVersion, 1);
  if (plan.schemaVersion !== 1) throw new Error("Expected tracked plan");
  assert.equal(resolveMotionTrackState(plan.objects[0], 40).value, 20);
  assert.equal(resolveMotionTrackState(plan.objects[0], 100).value, 40);
  const { shots } = createScenePlans();
  const built = buildShotPlanSet({ ...shots, motionPlan: plan });
  assert.notEqual(built.shotPlanFingerprint, shots.shotPlanFingerprint);
});

test("Motion cannot pass with a static track, invented object, detached anchor or changing hold", () => {
  const plan = motion();
  const variants = [
    {
      ...plan,
      objects: [
        {
          ...plan.objects[0],
          keyframes: plan.objects[0].keyframes.map((k) => ({
            ...k,
            state: state(),
          })),
        },
      ],
    },
    { ...plan, actions: [{ ...plan.actions[0], objectIds: ["missing"] }] },
    { ...plan, actions: [{ ...plan.actions[0], syncAnchorId: "missing" }] },
    {
      ...plan,
      actions: [
        { ...plan.actions[0], frameRange: { startFrame: 60, endFrame: 120 } },
      ],
    },
    { ...plan, actions: [{ ...plan.actions[0], readingHoldFrames: 60 }] },
    { ...plan, actions: [{ ...plan.actions[0], shotId: "missing-shot" }] },
  ];
  for (const variant of variants) assert.throws(() => check(variant));
  assert.throws(
    () => check(plan, [{ startFrame: 55, endFrame: 120 }]),
    /sealed narration/u,
  );
});

test("Deliberate holds are explicit and require stable state without a camera quota", () => {
  const plan = motion();
  const held = {
    ...plan,
    objects: [
      {
        ...plan.objects[0],
        keyframes: plan.objects[0].keyframes.map((k) => ({
          ...k,
          state: state(40),
        })),
      },
    ],
    actions: [
      {
        ...plan.actions[0],
        kind: "hold",
        syncAnchorId: null,
        readingHoldFrames: 0,
        explanatoryPurpose: "Give viewers time to read the comparison result",
      },
    ],
  };
  assert.doesNotThrow(() => check(held));
  assert.throws(
    () => check({ ...plan, actions: [{ ...plan.actions[0], kind: "hold" }] }),
    /holds must remain stable/u,
  );
});

test("Continuous object handoffs reject missing identities and pose jumps; motivated cuts are explicit", () => {
  const before = SceneMotionPlanSchema.parse({
    ...motion(),
    handoff: {
      kind: "continuous",
      reason: "Follow the same measured quantity into the next explanation",
      incoming: [],
      outgoing: [{ continuityId: "quantity", objectId: "measured-value" }],
    },
  });
  const after = SceneMotionPlanSchema.parse({
    ...motion(),
    objects: [
      {
        ...motion().objects[0],
        keyframes: motion().objects[0].keyframes.map((k) => ({
          ...k,
          state: state(40),
        })),
      },
    ],
    handoff: {
      kind: "end",
      reason: "Conclude",
      incoming: [{ continuityId: "quantity", objectId: "measured-value" }],
      outgoing: [],
    },
  });
  assert.doesNotThrow(() => validateMotionContinuity([before, after]));
  assert.throws(
    () => validateMotionContinuity([before, motion()]),
    /Missing continuity/u,
  );
  assert.throws(
    () => validateMotionContinuity([before, undefined]),
    /next Scene motion plan/u,
  );
  assert.throws(
    () =>
      validateMotionContinuity([
        before,
        SceneMotionPlanSchema.parse({ ...after, objects: motion().objects }),
      ]),
    /pose jumps/u,
  );
});

test("Object interpolation is repeatable at action boundaries and rejects invalid frame state", () => {
  const track = motion().objects[0];
  const frames = [0, 1, 54, 79, 80, 81, 119];
  const forward = frames.map((frame) => resolveMotionTrackState(track, frame));
  assert.deepEqual(
    [...frames]
      .reverse()
      .map((frame) => resolveMotionTrackState(track, frame))
      .reverse(),
    forward,
  );
  assert.ok(
    Math.abs(
      resolveMotionTrackState(track, 80).value -
        resolveMotionTrackState(track, 79).value,
    ) < 0.03,
  );
  assert.throws(() => resolveMotionTrackState(track, Number.NaN));
  assert.throws(() =>
    SceneMotionPlanSchema.parse({
      ...motion(),
      objects: [
        { ...track, keyframes: [track.keyframes[1], track.keyframes[0]] },
      ],
    }),
  );
});

test("Purposeful hard cuts do not demand object pose continuity and old plans remain unchanged", () => {
  const cut = SceneMotionPlanSchema.parse({
    ...motion(),
    handoff: {
      kind: "motivated-cut",
      reason: "Switch from measured results to the separate counterexample",
      incoming: [],
      outgoing: [],
    },
  });
  assert.doesNotThrow(() => validateMotionContinuity([cut, motion()]));
  assert.throws(() =>
    SceneMotionPlanSchema.parse({
      ...cut,
      handoff: { ...cut.handoff, reason: "" },
    }),
  );
  const { shots } = createScenePlans();
  assert.equal(
    buildShotPlanSet(shots).shotPlanFingerprint,
    shots.shotPlanFingerprint,
  );
  assert.equal(buildShotPlanSet(shots).motionPlan, undefined);
});

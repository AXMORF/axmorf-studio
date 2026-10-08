import assert from "node:assert/strict";
import test from "node:test";
import {
  buildShotPlanSet,
  IntentSceneMotionPlanSchema,
  MeaningIdSchema,
} from "@axmorf/studio/contracts";
import { resolveSceneActionTiming } from "@axmorf/studio/remotion";
import { createScenePlans } from "../fixtures/scene/scene-input";

const fixture = (readingHoldFrames = 30, kind = "trace") => {
  const { shots: base, anchors } = createScenePlans();
  const motionPlan = IntentSceneMotionPlanSchema.parse({
    schemaVersion: 2,
    objects: [{ objectId: "path", meaning: "A route becoming connected" }],
    actions: [
      {
        actionId: "join",
        shotId: "trace-shot",
        kind,
        explanatoryPurpose: "Connect the missing segment",
        initialState: "Disconnected",
        resultingState: "Connected",
        objectIds: ["path"],
        frameRange: { startFrame: 0, endFrame: 120 },
        syncAnchorId: kind === "hold" ? null : "outline-closes",
        readingHoldFrames,
      },
    ],
    handoff: {
      kind: "end",
      reason: "The route is complete",
      incoming: [],
      outgoing: [],
    },
  });
  const shots = buildShotPlanSet({ ...base, motionPlan });
  return { shots, syncAnchors: anchors, actionId: "join" };
};

test("Custom action timing consumes the declared anchor and exclusive reading window", () => {
  const input = fixture();
  const at = (sceneFrame: number) =>
    resolveSceneActionTiming({ ...input, sceneFrame });
  assert.equal(at(-1).phase, "before");
  assert.equal(at(0).phase, "anticipation");
  assert.equal(at(53).anticipationProgress, 1);
  assert.equal(at(54).phase, "change");
  assert.equal(at(54).changeProgress, 0);
  assert.equal(at(89).changeProgress, 1);
  assert.equal(at(90).phase, "reading-hold");
  assert.equal(at(119).changeProgress, 1);
  assert.equal(at(120).phase, "after");
  const frames = [0, 54, 75, 119, 12];
  assert.deepEqual(frames.map(at), [...frames].reverse().map(at).reverse());
});

test("No hold, deliberate hold and one-frame changes are seek-safe", () => {
  const noHold = fixture(0);
  assert.equal(
    resolveSceneActionTiming({ ...noHold, sceneFrame: 119 }).changeProgress,
    1,
  );
  assert.equal(
    resolveSceneActionTiming({ ...noHold, sceneFrame: 119 }).phase,
    "change",
  );
  const hold = fixture(0, "hold");
  assert.equal(
    resolveSceneActionTiming({ ...hold, sceneFrame: 0 }).phase,
    "reading-hold",
  );
  assert.equal(
    resolveSceneActionTiming({ ...hold, sceneFrame: 119 }).changeProgress,
    1,
  );
  const single = fixture(65);
  assert.equal(
    resolveSceneActionTiming({ ...single, sceneFrame: 53 }).changeProgress,
    0,
  );
  assert.equal(
    resolveSceneActionTiming({ ...single, sceneFrame: 54 }).changeProgress,
    1,
  );
  assert.equal(
    resolveSceneActionTiming({ ...single, sceneFrame: 55 }).phase,
    "reading-hold",
  );
});

test("Action timing rejects crossed inputs and missing events instead of guessing a clock", () => {
  const input = fixture();
  assert.throws(
    () =>
      resolveSceneActionTiming({
        ...input,
        actionId: "missing",
        sceneFrame: 0,
      }),
    /not declared/u,
  );
  assert.throws(
    () => resolveSceneActionTiming({ ...input, sceneFrame: Infinity }),
    /finite/u,
  );
  assert.throws(
    () =>
      resolveSceneActionTiming({
        ...input,
        syncAnchors: {
          ...input.syncAnchors,
          meaningId: MeaningIdSchema.parse("elsewhere"),
        },
        sceneFrame: 0,
      }),
    /cross-bound/u,
  );
  assert.throws(
    () =>
      resolveSceneActionTiming({
        ...input,
        syncAnchors: { ...input.syncAnchors, anchors: [] },
        sceneFrame: 0,
      }),
    /missing/u,
  );
});

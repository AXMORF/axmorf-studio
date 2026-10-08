import assert from "node:assert/strict";
import test from "node:test";

import {
  SceneMotionPlanSchema,
  buildNotApplicableFidelityReceipt,
  buildSceneSoundPlan,
  buildSceneSyncAnchors,
  buildSceneTaskInputV7,
  buildSceneVisualPlan,
  buildShotPlanSet,
  buildShotRecipeSelection,
} from "@axmorf/studio/contracts";
import { buildScenePackage } from "../../scripts/scene-package/domain";
import { createScenePackageInput } from "../fixtures/scene/package-input";

const createMotionPackageInput = (
  kind: "narrated-scene" | "visual-scene",
  anchorFrame = 54,
) => {
  const fixture = createScenePackageInput();
  const durationInFrames = fixture.shots.sceneDurationInFrames;
  const task = buildSceneTaskInputV7({
    ...fixture.task,
    storyBeat:
      kind === "visual-scene"
        ? {
            kind,
            meaningId: fixture.task.meaningId,
            narrativePurpose: "The completed trace causes a visible fill.",
            durationInFrames,
          }
        : fixture.task.storyBeat,
    timingBeat:
      kind === "visual-scene"
        ? { ...fixture.task.timingBeat, kind, durationInFrames }
        : fixture.task.timingBeat,
  });
  const motionPlan = SceneMotionPlanSchema.parse({
    schemaVersion: 2,
    objects: [{ objectId: "shape", meaning: "The traced proof shape." }],
    actions: [
      {
        actionId: "trace-and-fill",
        shotId: fixture.shots.shots[0].shotId,
        kind: "authored-trace-fill",
        explanatoryPurpose: "Show the completed trace causing the fill.",
        initialState: "An unfinished outline.",
        resultingState: "A filled proof shape.",
        objectIds: ["shape"],
        frameRange: { startFrame: 0, endFrame: durationInFrames },
        syncAnchorId: fixture.anchors.anchors[0].eventId,
        readingHoldFrames: 30,
      },
    ],
    handoff: {
      kind: "end",
      reason: "The proof resolves.",
      incoming: [],
      outgoing: [],
    },
  });
  const taskInputFingerprint = task.taskInputFingerprint;
  const selection = buildShotRecipeSelection({
    taskInputFingerprint,
    selections: [],
  });
  return {
    ...fixture,
    task,
    // Final file-backed generation supplies [] for genuinely absent captions.
    narrationCues:
      kind === "visual-scene" ? [] : [{ startFrame: 0, endFrame: 120 }],
    visual: buildSceneVisualPlan({ ...fixture.visual, taskInputFingerprint }),
    shots: buildShotPlanSet({
      ...fixture.shots,
      taskInputFingerprint,
      motionPlan,
    }),
    anchors: buildSceneSyncAnchors({
      ...fixture.anchors,
      taskInputFingerprint,
      anchors: fixture.anchors.anchors.map((anchor) => ({
        ...anchor,
        sceneLocalFrame: anchorFrame,
      })),
    }),
    sound: buildSceneSoundPlan({ ...fixture.sound, taskInputFingerprint }),
    selection,
    fidelityReceipt: buildNotApplicableFidelityReceipt({
      selectionFingerprint: selection.selectionFingerprint,
      reason: "empty",
    }),
    current: { ...fixture.current, timingBeat: task.timingBeat },
  };
};

test("final ScenePackage accepts visual event anchors with genuinely absent captions", () => {
  const input = createMotionPackageInput("visual-scene");
  const scenePackage = buildScenePackage(input);
  assert.equal(
    scenePackage.taskInputFingerprint,
    input.task.taskInputFingerprint,
  );
  assert.deepEqual(scenePackage.beatFrameRange, {
    startFrame: 20,
    endFrame: 140,
  });
});

test("visual ScenePackage still rejects an anchor inside the reading hold", () => {
  assert.throws(
    () => buildScenePackage(createMotionPackageInput("visual-scene", 96)),
    /before its reading hold/u,
  );
});

test("narrated ScenePackage still requires its anchor inside sealed cue windows", () => {
  const input = createMotionPackageInput("narrated-scene");
  assert.doesNotThrow(() => buildScenePackage(input));
  for (const narrationCues of [[], [{ startFrame: 0, endFrame: 30 }]]) {
    assert.throws(
      () => buildScenePackage({ ...input, narrationCues }),
      /sealed narration cue windows/u,
    );
  }
});

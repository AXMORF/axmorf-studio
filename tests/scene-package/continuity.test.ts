import assert from "node:assert/strict";
import test from "node:test";

import {
  SceneMotionPlanSchema,
  buildNotApplicableFidelityReceipt,
  buildSceneContinuityContract,
  buildSceneSoundPlan,
  buildSceneSyncAnchors,
  buildSceneTaskInputV7,
  buildSceneVisualPlan,
  buildShotPlanSet,
  buildShotRecipeSelection,
  buildSilentScenePreset,
} from "@axmorf/studio/contracts";
import { validateSceneArtifactBundle } from "../../scripts/scene-package/domain";
import { createScenePackageInput } from "../fixtures/scene/package-input";

const createSilentOwnerBundle = (
  handoffKind: "continuous" | "motivated-cut",
) => {
  const fixture = createScenePackageInput();
  const durationInFrames = fixture.shots.sceneDurationInFrames;
  const preset = buildSilentScenePreset({
    presetId: "custom-opening",
    durationInFrames,
    visualIntent: "Show a proof outline.",
    soundIntent: "No sound.",
    resourceIds: fixture.selectedResources
      .map(({ selected }) => selected.resourceId)
      .sort(),
    implementation: { kind: "scene-owner" },
  });
  const beat = {
    kind: "silent-scene" as const,
    meaningId: fixture.task.meaningId,
    narrativePurpose: "Show the custom opening.",
    preset,
  };
  const continuityBrief = "Cut into the narrated explanation.";
  const handoffs = buildSceneContinuityContract({
    storyId: fixture.task.storyId,
    beat,
    brief: { meaningId: beat.meaningId, continuityBrief },
    previous: null,
    next: {
      beat: { kind: "narrated-scene", meaningId: "next" },
      brief: {
        meaningId: "next",
        continuityBrief: "Continue the explanation.",
      },
    },
  });
  const task = buildSceneTaskInputV7({
    ...fixture.task,
    storyBeat: beat,
    timingBeat: {
      kind: "silent-scene",
      meaningId: beat.meaningId,
      startFrame: fixture.task.timingBeat.startFrame,
      endFrame: fixture.task.timingBeat.startFrame + durationInFrames,
      presetFingerprint: preset.presetFingerprint,
      presetDurationInFrames: durationInFrames,
    },
    allowedResourceIds: preset.resourceIds,
    continuity: {
      previousMeaningId: null,
      previousSummary: null,
      nextMeaningId: "next",
      nextSummary: "The narrated explanation.",
      continuityBrief,
      handoffs,
    },
  });
  const motionPlan = SceneMotionPlanSchema.parse({
    schemaVersion: 2,
    objects: [{ objectId: "proof", meaning: "Opening proof outline." }],
    actions: [
      {
        actionId: "hold-proof",
        shotId: fixture.shots.shots[0].shotId,
        kind: "hold",
        explanatoryPurpose: "Allow viewers to read the proof.",
        initialState: "Proof outline.",
        resultingState: "Proof outline.",
        objectIds: ["proof"],
        frameRange: { startFrame: 0, endFrame: durationInFrames },
        syncAnchorId: null,
        readingHoldFrames: 0,
      },
    ],
    handoff: {
      kind: handoffKind,
      reason: continuityBrief,
      incoming: [],
      outgoing:
        handoffKind === "continuous"
          ? [{ continuityId: "invented-proof", objectId: "proof" }]
          : [],
    },
  });
  const selection = buildShotRecipeSelection({
    taskInputFingerprint: task.taskInputFingerprint,
    selections: [],
  });
  return {
    task,
    visual: buildSceneVisualPlan({
      ...fixture.visual,
      taskInputFingerprint: task.taskInputFingerprint,
    }),
    shots: buildShotPlanSet({
      ...fixture.shots,
      taskInputFingerprint: task.taskInputFingerprint,
      motionPlan,
    }),
    anchors: buildSceneSyncAnchors({
      ...fixture.anchors,
      taskInputFingerprint: task.taskInputFingerprint,
    }),
    sound: buildSceneSoundPlan({
      ...fixture.sound,
      taskInputFingerprint: task.taskInputFingerprint,
    }),
    selection,
    fidelityReceipt: buildNotApplicableFidelityReceipt({
      selectionFingerprint: selection.selectionFingerprint,
      reason: "empty",
    }),
    selectedResources: fixture.selectedResources,
  };
};

test("Silent scene-owner rejects invented continuity against its frozen outgoing cut", () => {
  const bundle = createSilentOwnerBundle("continuous");
  assert.equal(bundle.task.storyBeat.kind, "silent-scene");
  assert.equal(bundle.task.continuity.handoffs?.outgoing.kind, "motivated-cut");
  assert.throws(
    () => validateSceneArtifactBundle(bundle),
    /frozen outgoing kind/u,
  );
});

test("Silent scene-owner accepts its frozen motivated cut with complete plan fingerprints", () => {
  assert.doesNotThrow(() =>
    validateSceneArtifactBundle(createSilentOwnerBundle("motivated-cut")),
  );
});

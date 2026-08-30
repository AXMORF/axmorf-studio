import assert from "node:assert/strict";
import test from "node:test";

import {
  SceneSoundPlanSchema,
  ShotPlanSetSchema,
  buildSceneSoundPlan,
  resolveSceneSoundContributions,
  validateScenePlanBundle,
} from "@axmorf/studio/contracts";
import { createScenePlans, sha } from "../fixtures/scene/scene-input";

test("visual Shot anchor and explicit empty sound plans form one strict 120-frame Scene", () => {
  const { anchors, shots, sound, task, visual } = createScenePlans();
  assert.deepEqual(
    visual.orderedShotIds,
    shots.shots.map((shot) => shot.shotId),
  );
  assert.equal(shots.shots[0].primaryRange.endFrame, 120);
  assert.equal(anchors.anchors[0].sceneLocalFrame, 54);
  assert.deepEqual(sound.contributions, []);
  assert.equal(task.timingBeat.endFrame - task.timingBeat.startFrame, 120);
  assert.doesNotThrow(() =>
    validateScenePlanBundle({
      taskInputFingerprint: task.taskInputFingerprint,
      meaningId: task.meaningId,
      sceneDurationInFrames: 120,
      allowedResourceIds: task.allowedResourceIds,
      visualPlan: visual,
      shotPlan: shots,
      syncAnchors: anchors,
      soundPlan: sound,
    }),
  );
});

test("ShotPlanSet rejects duplicate unordered empty and out-of-window primary ranges", () => {
  const { shots } = createScenePlans();
  const shot = shots.shots[0];
  for (const mutation of [
    { ...shots, shots: [shot, shot] },
    { ...shots, shots: [{ ...shot, order: 1 }] },
    {
      ...shots,
      shots: [{ ...shot, primaryRange: { startFrame: 5, endFrame: 5 } }],
    },
    {
      ...shots,
      shots: [{ ...shot, primaryRange: { startFrame: 0, endFrame: 121 } }],
    },
  ]) {
    assert.throws(() => ShotPlanSetSchema.parse(mutation));
  }
});

test("Shot plans cannot own renderer caption narration chunk or module identities", () => {
  const { shots } = createScenePlans();
  for (const forbidden of [
    "rendererId",
    "component",
    "modulePath",
    "captionCue",
    "chunkId",
    "ttsChunk",
  ]) {
    assert.throws(() =>
      ShotPlanSetSchema.parse({
        ...shots,
        shots: [{ ...shots.shots[0], [forbidden]: "forbidden" }],
      }),
    );
  }
});

test("Scene sound contributions resolve anchor xor explicit frame without clamp or final-assembly fields", () => {
  const { anchors, task } = createScenePlans();
  const soundResource = {
    schemaVersion: 1,
    resourceId: "asset.proof-sfx",
    kind: "asset",
    role: "sound-effect",
    descriptorFingerprint: sha("a"),
    catalogFingerprint: task.resourceCatalogFingerprint,
  } as const;
  const plan = buildSceneSoundPlan({
    taskInputFingerprint: task.taskInputFingerprint,
    meaningId: task.meaningId,
    sceneDurationInFrames: 120,
    contributions: [
      {
        contributionId: "handoff",
        resource: soundResource,
        timing: { kind: "anchor", eventId: "outline-closes", offsetFrames: 2 },
        durationInFrames: 12,
        volume: 0.5,
      },
      {
        contributionId: "settle",
        resource: soundResource,
        timing: { kind: "explicit", sceneLocalFrame: 90 },
        durationInFrames: 10,
        volume: 0.4,
      },
    ],
  });
  assert.deepEqual(
    resolveSceneSoundContributions({ soundPlan: plan, syncAnchors: anchors }),
    [
      { contributionId: "handoff", startFrame: 56, endFrame: 68 },
      { contributionId: "settle", startFrame: 90, endFrame: 100 },
    ],
  );
  assert.throws(() =>
    resolveSceneSoundContributions({
      soundPlan: buildSceneSoundPlan({
        ...plan,
        contributions: [
          {
            ...plan.contributions[0],
            timing: { kind: "anchor", eventId: "missing", offsetFrames: 0 },
          },
        ],
      }),
      syncAnchors: anchors,
    }),
  );
  for (const forbidden of [
    "narration",
    "bgm",
    "ducking",
    "mastering",
    "url",
    "provider",
  ]) {
    assert.throws(() =>
      SceneSoundPlanSchema.parse({ ...plan, [forbidden]: true }),
    );
  }
});

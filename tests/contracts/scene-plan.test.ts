import assert from "node:assert/strict";
import test from "node:test";

import {
  SceneSoundPlanSchema,
  ShotPlanSetSchema,
  buildSceneSoundPlan,
  resolveSceneSoundCues,
  validateScenePlanBundle,
} from "../../src/contracts/scene-plan";
import { createM6ScenePlans, sha } from "../fixtures/scene/m6-scene-input";

test("visual Shot anchor and explicit empty sound plans form one strict 120-frame Scene", () => {
  const { anchors, shots, sound, task, visual } = createM6ScenePlans();
  assert.deepEqual(
    visual.orderedShotIds,
    shots.shots.map((shot) => shot.shotId),
  );
  assert.equal(shots.shots[0].primaryRange.endFrame, 120);
  assert.equal(anchors.anchors[0].sceneLocalFrame, 54);
  assert.equal(sound.ambience, null);
  assert.deepEqual(sound.cues, []);
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
  const { shots } = createM6ScenePlans();
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
  const { shots } = createM6ScenePlans();
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

test("Scene-local sound resolves anchor xor explicit frame without clamp or M8 fields", () => {
  const { anchors, task } = createM6ScenePlans();
  const ambience = {
    schemaVersion: 1,
    resourceId: "asset.proof-ambience",
    kind: "asset",
    role: "scene-ambience",
    descriptorFingerprint: sha("a"),
    catalogFingerprint: task.resourceCatalogFingerprint,
  } as const;
  const cueResource = {
    ...ambience,
    resourceId: "asset.proof-sfx",
    role: "scene-sfx" as const,
  };
  const plan = buildSceneSoundPlan({
    taskInputFingerprint: task.taskInputFingerprint,
    meaningId: task.meaningId,
    sceneDurationInFrames: 120,
    ambience,
    cues: [
      {
        cueId: "handoff",
        resource: cueResource,
        timing: { kind: "anchor", eventId: "outline-closes", offsetFrames: 2 },
        durationInFrames: 12,
        volume: 0.5,
      },
      {
        cueId: "settle",
        resource: cueResource,
        timing: { kind: "explicit", sceneLocalFrame: 90 },
        durationInFrames: 10,
        volume: 0.4,
      },
    ],
  });
  assert.deepEqual(
    resolveSceneSoundCues({ soundPlan: plan, syncAnchors: anchors }),
    [
      { cueId: "handoff", startFrame: 56, endFrame: 68 },
      { cueId: "settle", startFrame: 90, endFrame: 100 },
    ],
  );
  assert.throws(() =>
    resolveSceneSoundCues({
      soundPlan: buildSceneSoundPlan({
        ...plan,
        cues: [
          {
            ...plan.cues[0],
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

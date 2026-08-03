import assert from "node:assert/strict";
import test from "node:test";

import {
  GlobalSoundPlanSchema,
  createGlobalSoundPlan,
} from "../../src/contracts/global-sound";

const sha = (value: string) => `sha256:${value.repeat(64)}`;

const input = () => ({
  schemaVersion: 1 as const,
  planVersion: "global-sound-plan-v1" as const,
  storyId: "synthetic-proof",
  compositionId: "SyntheticProof",
  fps: 30,
  durationInFrames: 120,
  semanticTimingFingerprint: sha("1"),
  catalogFingerprint: sha("2"),
  assets: [
    {
      resourceId: "asset.cross-scene-ambience",
      role: "cross-scene-ambience" as const,
      publicPath: "public/projects/synthetic/global-audio/ambience.wav",
      checksum: sha("3"),
      descriptorFingerprint: sha("4"),
      licenseFingerprint: sha("5"),
      startFrame: 0,
      endFrame: 120,
    },
    {
      resourceId: "asset.global-bgm",
      role: "global-bgm" as const,
      publicPath: "public/projects/synthetic/global-audio/bgm.wav",
      checksum: sha("6"),
      descriptorFingerprint: sha("7"),
      licenseFingerprint: sha("8"),
      startFrame: 0,
      endFrame: 120,
    },
  ],
  duckingPolicy: {
    policyId: "semantic-spoken-min-envelope-v1" as const,
    attackFrames: 6,
    releaseFrames: 9,
    spokenGain: 0.35,
    unspokenGain: 1,
  },
  masteringPolicy: {
    policyId: "deterministic-gain-stage-v1" as const,
    narrationGain: 1 as const,
    sceneBusGain: 0.8,
    ambienceGain: 0.18,
    bgmGain: 0.12,
    integratedLoudnessMinLufs: -19,
    integratedLoudnessMaxLufs: -14,
    truePeakCeilingDbtp: -1,
  },
});

test("GlobalSoundPlan is strict canonical and owns only two full-length global buses", () => {
  const plan = createGlobalSoundPlan(input());
  assert.doesNotThrow(() => GlobalSoundPlanSchema.parse(plan));
  assert.deepEqual(
    plan.assets.map((asset) => asset.role),
    ["cross-scene-ambience", "global-bgm"],
  );
  const reversed = createGlobalSoundPlan({
    ...input(),
    assets: [...input().assets].reverse(),
  });
  assert.equal(plan.planFingerprint, reversed.planFingerprint);
  assert.notEqual(
    plan.planFingerprint,
    createGlobalSoundPlan({
      ...input(),
      duckingPolicy: {...input().duckingPolicy, attackFrames: 7},
    }).planFingerprint,
  );
});

test("GlobalSoundPlan rejects Scene authority dynamic inputs and unsafe ranges", () => {
  for (const mutation of [
    {...input(), meaningId: "beat-1"},
    {...input(), cues: []},
    {...input(), sceneSfxOverrides: []},
    {...input(), assets: input().assets.map((asset) => ({...asset, publicPath: "https://example.com/audio.wav"}))},
    {...input(), assets: input().assets.map((asset) => ({...asset, endFrame: 119}))},
    {...input(), duckingPolicy: {...input().duckingPolicy, attackFrames: 0}},
    {...input(), masteringPolicy: {...input().masteringPolicy, narrationGain: 0.9}},
  ]) {
    assert.throws(() => createGlobalSoundPlan(mutation));
  }
});

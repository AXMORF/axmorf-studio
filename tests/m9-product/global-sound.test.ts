import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import test from "node:test";

import {
  GlobalSoundPlanSchema,
  ResourceCatalogSchema,
  SemanticTimingSchema,
} from "../../src/contracts";
import {
  evaluateDuckEnvelope,
  createSpokenFrameRanges,
} from "../../src/remotion/runtime/global-sound/ducking";
import {productComicVerticalFinalAssemblyData} from "../../src/projects/product-comic-vertical/final-assembly-data";
import {
  inspectCanonicalWav,
  validateProductComicGlobalAudio,
} from "../../scripts/m9-product/global-audio";

const rootDir = process.cwd();
const readJson = async (path: string): Promise<unknown> =>
  JSON.parse(await readFile(join(rootDir, path), "utf8"));

test("M9 GlobalSound binds exactly two full-length project-authored PCM assets", async () => {
  const data = productComicVerticalFinalAssemblyData;
  const plan = GlobalSoundPlanSchema.parse(data.finalSound.plan);
  const catalog = ResourceCatalogSchema.parse(data.assemblyCatalog);
  assert.deepEqual(plan.assets.map(({role}) => role), [
    "cross-scene-ambience",
    "global-bgm",
  ]);
  assert.ok(plan.assets.every(({startFrame, endFrame}) => startFrame === 0 && endFrame === 5116));
  assert.equal(plan.masteringPolicy.narrationGain, 1);
  assert.deepEqual(
    [
      plan.masteringPolicy.integratedLoudnessMinLufs,
      plan.masteringPolicy.integratedLoudnessMaxLufs,
      plan.masteringPolicy.truePeakCeilingDbtp,
    ],
    [-24, -16, -1],
  );
  const receipt = await validateProductComicGlobalAudio({rootDir});
  assert.equal(receipt.assets.length, 2);
  for (const asset of plan.assets) {
    const descriptor = catalog.entries.find(({descriptor}) => descriptor.id === asset.resourceId)?.descriptor;
    assert.ok(descriptor?.kind === "asset");
    if (descriptor?.kind !== "asset") continue;
    assert.equal(descriptor.mediaRole, asset.role);
    assert.equal(descriptor.checksum, asset.checksum);
    assert.equal(descriptor.license.id, "Project-Authored");
    assert.equal(descriptor.license.verificationStatus, "verified");
    assert.equal(descriptor.media?.sampleRate, 48_000);
    const facts = inspectCanonicalWav(await readFile(join(rootDir, asset.publicPath)));
    assert.deepEqual(facts, {
      sampleRate: 48_000,
      channels: 1,
      bitsPerSample: 16,
      sampleFrameCount: 8_185_600,
    });
  }
});

test("M9 ducking derives only from sealed absolute spoken ranges with clamp and minimum overlap", async () => {
  const timing = SemanticTimingSchema.parse(
    await readJson("src/projects/product-comic-vertical/generated/semantic-timing.generated.json"),
  );
  const ranges = createSpokenFrameRanges(timing.segments, timing.durationInFrames);
  assert.deepEqual(
    productComicVerticalFinalAssemblyData.finalSound.spokenRanges,
    ranges,
  );
  assert.deepEqual(ranges[0], {startFrame: 15, endFrame: 303});
  const policy = productComicVerticalFinalAssemblyData.finalSound.plan.duckingPolicy;
  const envelope = (frame: number) =>
    evaluateDuckEnvelope({
      frame,
      ranges,
      durationInFrames: timing.durationInFrames,
      ...policy,
    });
  assert.equal(envelope(15), policy.spokenGain);
  assert.equal(envelope(302), policy.spokenGain);
  assert.equal(envelope(303), policy.spokenGain);
  assert.ok(envelope(5115) > policy.spokenGain);
  assert.ok(envelope(5115) < policy.unspokenGain);
  assert.equal(
    evaluateDuckEnvelope({
      frame: 12,
      ranges: [
        {startFrame: 10, endFrame: 12},
        {startFrame: 14, endFrame: 16},
      ],
      durationInFrames: 30,
      attackFrames: 5,
      releaseFrames: 5,
      spokenGain: 0.25,
      unspokenGain: 1,
    }),
    0.25,
  );
});

test("M9 GlobalSound fails closed on Scene cues timing gain duration and checksum drift", () => {
  const plan = productComicVerticalFinalAssemblyData.finalSound.plan;
  for (const changed of [
    {...plan, durationInFrames: 5115},
    {...plan, semanticTimingFingerprint: `sha256:${"0".repeat(64)}`},
    {...plan, masteringPolicy: {...plan.masteringPolicy, narrationGain: 0.9}},
    {
      ...plan,
      assets: plan.assets.map((asset, index) =>
        index === 0
          ? {...asset, checksum: `sha256:${"1".repeat(64)}`}
          : asset,
      ),
    },
    {
      ...plan,
      assets: plan.assets.map((asset, index) =>
        index === 0 ? {...asset, role: "scene-sfx"} : asset,
      ),
    },
  ]) {
    assert.throws(() => GlobalSoundPlanSchema.parse(changed));
  }
});

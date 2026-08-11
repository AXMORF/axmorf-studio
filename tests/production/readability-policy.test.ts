import assert from "node:assert/strict";
import test from "node:test";

import {
  CAPTION_DISPLAY_UNIT_ALGORITHM_ID,
  countCaptionDisplayHalfUnits,
  ProductionReadabilityPolicySchema,
  resolveProductionReadabilityPolicy,
  validateCaptionDisplayBudget,
} from "../../src/contracts/production-readability";

test("resolves the scale=1 readability baseline for portrait and landscape", () => {
  for (const [width, height] of [
    [1080, 1920],
    [1920, 1080],
  ] as const) {
    const policy = resolveProductionReadabilityPolicy({ width, height });
    assert.equal(policy.policyId, "production-readability-v2");
    assert.deepEqual(policy.scale, { numerator: 1080, denominator: 1080 });
    assert.equal(policy.edgeInsetPx, 90);
    assert.equal(policy.typographyPolicy.minFontSizePx, 36);
    assert.equal(policy.captionPolicy.captionFontSizePx, 40);
    assert.equal(policy.captionPolicy.captionBottomInsetPx, 180);
    assert.equal(policy.captionPolicy.captionGapPx, 30);
    assert.equal(policy.captionPolicy.captionBoxHeightPx, 146);
    assert.equal(policy.sceneBottomInsetPx, 360);
    assert.deepEqual(policy.sceneContentSafeAreaPx, {
      top: 90,
      right: 90,
      bottom: 360,
      left: 90,
    });
    assert.deepEqual(policy.captionSafeAreaPx, {
      top: 90,
      right: 90,
      bottom: 180,
      left: 90,
    });
  }
});

test("derives caption and Scene bottom insets from the configured edge inset", () => {
  const policy = resolveProductionReadabilityPolicy({
    width: 1080,
    height: 1920,
    edgeInsetPx: 120,
  });
  assert.equal(policy.edgeInsetPx, 120);
  assert.equal(policy.captionPolicy.captionBottomInsetPx, 240);
  assert.equal(policy.sceneBottomInsetPx, 420);
  assert.deepEqual(policy.sceneContentSafeAreaPx, {
    top: 120,
    right: 120,
    bottom: 420,
    left: 120,
  });
});

test("uses integer rational scaling and never scales below one", () => {
  const doubled = resolveProductionReadabilityPolicy({
    width: 2160,
    height: 3840,
  });
  assert.deepEqual(doubled.scale, { numerator: 2160, denominator: 1080 });
  assert.equal(doubled.edgeInsetPx, 180);
  assert.equal(doubled.typographyPolicy.minFontSizePx, 72);
  assert.equal(doubled.captionPolicy.captionFontSizePx, 80);
  assert.equal(doubled.captionPolicy.captionBoxHeightPx, 292);
  assert.equal(doubled.sceneBottomInsetPx, 720);

  const small = resolveProductionReadabilityPolicy({
    width: 720,
    height: 1280,
  });
  assert.deepEqual(small.scale, { numerator: 1080, denominator: 1080 });
  assert.equal(small.edgeInsetPx, 90);
});

test("policy fingerprints are byte-stable and reject derived-field drift", () => {
  const first = resolveProductionReadabilityPolicy({
    width: 1080,
    height: 1920,
  });
  const second = resolveProductionReadabilityPolicy({
    width: 1080,
    height: 1920,
  });
  assert.deepEqual(first, second);
  assert.equal(first.policyFingerprint, second.policyFingerprint);
  assert.throws(
    () =>
      ProductionReadabilityPolicySchema.parse({
        ...first,
        sceneBottomInsetPx: first.sceneBottomInsetPx + 10,
      }),
    /stale|derived|fingerprint/iu,
  );
});

test("caption-display-unit-v1 counts Unicode graphemes in integer half-units", () => {
  assert.equal(CAPTION_DISPLAY_UNIT_ALGORITHM_ID, "caption-display-unit-v1");
  assert.equal(countCaptionDisplayHalfUnits("中".repeat(36)), 72);
  assert.equal(countCaptionDisplayHalfUnits("A".repeat(72)), 72);
  assert.equal(countCaptionDisplayHalfUnits("中A🙂"), 5);
  assert.equal(countCaptionDisplayHalfUnits("👨‍👩‍👧‍👦"), 2);
  assert.equal(countCaptionDisplayHalfUnits("e\u0301"), 2);
});

test("caption budget passes 36 CJK units, rejects 37, and never rewrites text", () => {
  const accepted = "中".repeat(36);
  const rejected = "中".repeat(37);
  assert.deepEqual(
    validateCaptionDisplayBudget({ chunkId: "accepted", ttsText: accepted }),
    {
      chunkId: "accepted",
      ttsText: accepted,
      displayHalfUnits: 72,
    },
  );
  assert.throws(
    () =>
      validateCaptionDisplayBudget({ chunkId: "rejected", ttsText: rejected }),
    /rejected.*72 half-units/iu,
  );
  assert.equal(rejected, "中".repeat(37));
});

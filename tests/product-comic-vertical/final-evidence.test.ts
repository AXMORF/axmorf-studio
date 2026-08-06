import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import {
  FinalPreviewEvidenceSchema,
  createFinalPreviewEvidence,
} from "../../src/contracts";
import {
  M9_CONTACT_SHEET_PATH,
  M9_FINAL_PREVIEW_PATH,
  M9_REVIEW_FRAMES,
  assertM9MasteringMeasurements,
  runM9FinalPreviewEvidence,
  validateM9FinalAssemblyReview,
} from "../../scripts/project-tools/product-comic-vertical/final-evidence";

const rootDir = process.cwd();

test("M9 final review frames are automatic ordered complete and bounded", () => {
  assert.ok(M9_REVIEW_FRAMES.length >= 34 && M9_REVIEW_FRAMES.length <= 50);
  assert.deepEqual(
    M9_REVIEW_FRAMES,
    [...M9_REVIEW_FRAMES].sort((a, b) => a - b),
  );
  assert.equal(new Set(M9_REVIEW_FRAMES).size, M9_REVIEW_FRAMES.length);
  assert.equal(M9_REVIEW_FRAMES[0], 0);
  assert.equal(M9_REVIEW_FRAMES.at(-1), 5115);
  for (const boundary of [
    580, 1083, 1316, 1816, 2373, 3103, 3651, 4212, 4703,
  ]) {
    assert.ok(M9_REVIEW_FRAMES.includes(boundary - 1));
    assert.ok(M9_REVIEW_FRAMES.includes(boundary));
  }
  for (const exactPhase of [1129, 1172, 1246]) {
    assert.ok(M9_REVIEW_FRAMES.includes(exactPhase));
  }
});

test("M9 final evidence binds current full preview contact sheet technical facts and review", async () => {
  const evidence = await runM9FinalPreviewEvidence({ rootDir, mode: "check" });
  assert.doesNotThrow(() => FinalPreviewEvidenceSchema.parse(evidence));
  assert.equal(evidence.media.fullPreview.relativePath, M9_FINAL_PREVIEW_PATH);
  assert.equal(evidence.media.contactSheet.relativePath, M9_CONTACT_SHEET_PATH);
  assert.equal(
    evidence.media.representativeStills.length,
    M9_REVIEW_FRAMES.length,
  );
  assert.deepEqual(
    evidence.media.representativeStills.map(({ frame }) => frame),
    M9_REVIEW_FRAMES,
  );
  assert.deepEqual(
    {
      codec: evidence.technical.videoCodec,
      dimensions: [evidence.technical.width, evidence.technical.height],
      fps: [evidence.technical.fpsNumerator, evidence.technical.fpsDenominator],
      frames: evidence.technical.frameCount,
      audio: [
        evidence.technical.audioCodec,
        evidence.technical.sampleRate,
        evidence.technical.channelLayout,
      ],
      decodedToEof: evidence.technical.decodedToEof,
    },
    {
      codec: "h264",
      dimensions: [1080, 1920],
      fps: [30, 1],
      frames: 5116,
      audio: ["aac", 48_000, "stereo"],
      decodedToEof: true,
    },
  );
  assert.ok(evidence.technical.integratedLoudnessLufs >= -24);
  assert.ok(evidence.technical.integratedLoudnessLufs <= -16);
  assert.ok(evidence.technical.truePeakDbtp <= -1);
  assert.ok(evidence.technical.samplePeakDbfs <= -1);
  assert.equal(evidence.aggregateStatus, "ready-for-user-approval");
});

test("M9 final review is current pass-only and cannot represent user approval", async () => {
  const raw = JSON.parse(
    await readFile(
      join(
        rootDir,
        "src/projects/product-comic-vertical/reviews/final-assembly-review.json",
      ),
      "utf8",
    ),
  );
  const review = await validateM9FinalAssemblyReview({
    rootDir,
    rawReview: raw,
  });
  assert.equal(review.aggregateStatus, "pass");
  await assert.rejects(
    validateM9FinalAssemblyReview({
      rootDir,
      rawReview: { ...raw, approvalReference: "user-approved-current-preview" },
    }),
    /cannot represent user approval/iu,
  );
});

test("M9 evidence and mastering boundaries fail closed", async () => {
  const current = await runM9FinalPreviewEvidence({ rootDir, mode: "check" });
  assert.throws(() =>
    FinalPreviewEvidenceSchema.parse({
      ...current,
      finalAssemblyFingerprint: `sha256:${"0".repeat(64)}`,
    }),
  );
  assert.throws(() =>
    createFinalPreviewEvidence({
      ...current,
      evidenceFingerprint: undefined,
      aggregateStatus: "pass",
    }),
  );
  assert.throws(() =>
    assertM9MasteringMeasurements({
      integratedLoudnessLufs: -18,
      truePeakDbtp: -0.9,
      samplePeakDbfs: -2,
      integratedLoudnessMinLufs: -24,
      integratedLoudnessMaxLufs: -16,
      truePeakCeilingDbtp: -1,
    }),
  );
});

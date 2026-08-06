import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import {
  M8_CONTACT_SHEET_PATH,
  M8_FINAL_PREVIEW_PATH,
  M8_REPRESENTATIVE_FRAMES,
  runM8FinalPreviewEvidence,
  validateM8FinalAssemblyReview,
} from "../../scripts/project-tools/gps-relativity/final-evidence";
import { readJsonFile } from "../../scripts/scene-package/project-files";

const rootDir = join(import.meta.dirname, "../..");
const evidencePath = join(
  rootDir,
  "src/projects/gps-relativity/generated/m8-final-preview-evidence.generated.json",
);
const reviewPath = join(
  rootDir,
  "src/projects/gps-relativity/reviews/m8-final-assembly-review.json",
);

test("M8 representative frames are exact sorted and cover all locked probes", () => {
  assert.deepEqual(
    M8_REPRESENTATIVE_FRAMES,
    [
      0, 188, 349, 360, 361, 373, 530, 684, 695, 696, 708, 855, 1006, 1017,
      1018, 1030, 1280, 1409, 1420, 1421, 1432, 1433, 1445, 1580, 1715, 1730,
    ],
  );
  assert.equal(new Set(M8_REPRESENTATIVE_FRAMES).size, 26);
});

test("current final preview evidence binds media technical facts review and M8 identities", async () => {
  const review = await validateM8FinalAssemblyReview({
    rootDir,
    rawReview: await readJsonFile(reviewPath),
  });
  assert.equal(review.aggregateStatus, "pass");
  assert.equal(review.globalSound.status, "pass");
  assert.equal(review.globalVisual.status, "pass");
  assert.equal(review.finalContinuity.status, "pass");
  assert.equal(review.normalSpeed.status, "pass");
  assert.equal(review.normalSpeed.completedFullPlayback, true);
  assert.equal(review.normalSpeed.playbackRate, 1);

  const evidence = await runM8FinalPreviewEvidence({ rootDir, mode: "check" });
  assert.equal(evidence.aggregateStatus, "ready-for-user-approval");
  assert.equal(evidence.media.fullPreview.relativePath, M8_FINAL_PREVIEW_PATH);
  assert.equal(evidence.media.contactSheet.relativePath, M8_CONTACT_SHEET_PATH);
  assert.deepEqual(
    evidence.media.representativeStills.map(({ frame }) => frame),
    M8_REPRESENTATIVE_FRAMES,
  );
  assert.deepEqual(
    {
      videoCodec: evidence.technical.videoCodec,
      width: evidence.technical.width,
      height: evidence.technical.height,
      fpsNumerator: evidence.technical.fpsNumerator,
      fpsDenominator: evidence.technical.fpsDenominator,
      frameCount: evidence.technical.frameCount,
      audioCodec: evidence.technical.audioCodec,
      sampleRate: evidence.technical.sampleRate,
      channelLayout: evidence.technical.channelLayout,
      decodedToEof: evidence.technical.decodedToEof,
    },
    {
      videoCodec: "h264",
      width: 1920,
      height: 1080,
      fpsNumerator: 30,
      fpsDenominator: 1,
      frameCount: 1731,
      audioCodec: "aac",
      sampleRate: 48_000,
      channelLayout: "stereo",
      decodedToEof: true,
    },
  );
  assert.ok(evidence.technical.durationSeconds >= 57.7);
  assert.ok(evidence.technical.durationSeconds <= 57.8);
  assert.ok(evidence.technical.integratedLoudnessLufs >= -24);
  assert.ok(evidence.technical.integratedLoudnessLufs <= -16);
  assert.ok(evidence.technical.truePeakDbtp <= -1);
  assert.ok(evidence.technical.samplePeakDbfs <= -1);
});

test("M8 evidence check is read-only and byte-exact across repeated checks", async () => {
  const before = await readFile(evidencePath);
  const mtime = (await stat(evidencePath)).mtimeMs;
  await runM8FinalPreviewEvidence({ rootDir, mode: "check" });
  await runM8FinalPreviewEvidence({ rootDir, mode: "check" });
  assert.deepEqual(await readFile(evidencePath), before);
  assert.equal((await stat(evidencePath)).mtimeMs, mtime);
});

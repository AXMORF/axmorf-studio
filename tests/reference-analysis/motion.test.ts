import assert from "node:assert/strict";
import test from "node:test";

import {
  describeReferenceChange,
  estimateReferenceImageMotion,
} from "../../scripts/reference-analysis/motion";
import {
  describeCoarseReferenceIntervals,
  refineReferenceBracket,
  selectReferenceRefinementWindows,
} from "../../scripts/reference-analysis/diagnostics";
import { fixtureGrayFrame } from "./fixtures";

test("textured image registration estimates signed translation and centered zoom without semantic camera approval", () => {
  const base = fixtureGrayFrame();
  const translation = estimateReferenceImageMotion(
    base,
    fixtureGrayFrame({ translationX: 2.5, translationY: -1.5 }),
  );
  assert.equal(translation.status, "estimated");
  assert.ok(Math.abs(translation.transform!.translationXPixels - 2.5) <= 0.5);
  assert.ok(Math.abs(translation.transform!.translationYPixels + 1.5) <= 0.5);
  assert.ok(Math.abs(translation.transform!.centeredScale - 1) <= 0.02);
  assert.equal(translation.semanticCamera, "not-assessed");
  assert.ok(translation.evidence.evaluatedTransforms <= 550);
  const zoom = estimateReferenceImageMotion(
    base,
    fixtureGrayFrame({ scale: 1.1 }),
  );
  assert.equal(zoom.status, "estimated");
  assert.ok(Math.abs(zoom.transform!.centeredScale - 1.1) <= 0.025);
  assert.ok(zoom.evidence.normalizedFitResidual! < 0.025);
  const shift = describeReferenceChange(
    base,
    fixtureGrayFrame({ translationX: 4 }),
    0.02,
  );
  assert.equal(shift.explainedByImageMotion, true);
  assert.equal(shift.abruptChangeCandidate, false);
});

test("flat, periodic and incompatible imagery withholds image motion parameters", () => {
  const flat = estimateReferenceImageMotion(
    new Uint8Array(64 * 36).fill(50),
    new Uint8Array(64 * 36).fill(50),
  );
  assert.equal(flat.status, "unobservable");
  assert.equal(flat.transform, null);
  const repeated = Uint8Array.from({ length: 64 * 36 }, (_, index) =>
    index % 4 < 2 ? 20 : 220,
  );
  const periodic = estimateReferenceImageMotion(repeated, repeated);
  assert.equal(periodic.status, "ambiguous");
  assert.equal(periodic.transform, null);
  const unrelated = estimateReferenceImageMotion(
    fixtureGrayFrame(),
    fixtureGrayFrame({ invert: true }),
  );
  assert.equal(unrelated.status, "poor-fit");
  assert.equal(unrelated.transform, null);
  assert.throws(
    () => estimateReferenceImageMotion(Uint8Array.of(1), Uint8Array.of(1)),
    /complete/u,
  );
});

test("known hard cut refines to an adjacent nominal bracket while a smooth fade yields no abrupt candidate", async () => {
  const hardFrame = (nominalFrame: number) => ({
    nominalFrame,
    pixels: new Uint8Array(64 * 36).fill(nominalFrame < 7 ? 0 : 255),
  });
  const coarse = describeCoarseReferenceIntervals(
    [hardFrame(0), hardFrame(15)],
    30,
    0.3,
  )[0]!;
  const refined = await refineReferenceBracket({
    interval: coarse,
    fps: 30,
    threshold: 0.3,
    readFrame: async (frame) => hardFrame(frame),
    checkDeadline: () => {},
  });
  assert.equal(refined.beforeFrame, 6);
  assert.equal(refined.afterFrame, 7);
  assert.equal(refined.abruptChangeCandidate, true);
  assert.equal(refined.confidence.sourceFrameBoundaryVerified, false);
  assert.equal(refined.confidence.calibratedProbability, null);
  assert.equal(
    refined.confidence.evidenceLevel,
    "adjacent-nominal-grid-change",
  );
  const fadeFrame = (nominalFrame: number) => ({
    nominalFrame,
    pixels: new Uint8Array(64 * 36).fill(Math.round((nominalFrame / 15) * 255)),
  });
  const fade = describeCoarseReferenceIntervals(
    [fadeFrame(0), fadeFrame(15)],
    30,
    0.3,
  )[0]!;
  const faded = await refineReferenceBracket({
    interval: fade,
    fps: 30,
    threshold: 0.3,
    readFrame: async (frame) => fadeFrame(frame),
    checkDeadline: () => {},
  });
  assert.equal(faded.abruptChangeCandidate, false);
  assert.equal(
    faded.confidence.evidenceLevel,
    "no-abrupt-change-in-tested-bracket",
  );
});

test("flash-like reversals remain explicitly ambiguous and hidden fast cuts can be missed", () => {
  const dark = { nominalFrame: 0, pixels: new Uint8Array(64 * 36) };
  const flash = { nominalFrame: 15, pixels: new Uint8Array(64 * 36).fill(255) };
  const restored = { nominalFrame: 30, pixels: new Uint8Array(64 * 36) };
  const intervals = describeCoarseReferenceIntervals(
    [dark, flash, restored],
    30,
    0.3,
  );
  assert.ok(
    intervals.every(({ transientOrFlashPossible }) => transientOrFlashPossible),
  );
  const hidden = describeCoarseReferenceIntervals([dark, restored], 30, 0.3);
  assert.equal(selectReferenceRefinementWindows(hidden).length, 0);
});

test("refinement window/step budgets are enforced and uncertainty survives a wide bracket", async () => {
  const frame = (nominalFrame: number) => ({
    nominalFrame,
    pixels: new Uint8Array(64 * 36).fill(nominalFrame < 10000 ? 0 : 255),
  });
  const interval = describeCoarseReferenceIntervals(
    [frame(0), frame(30000)],
    30,
    0.3,
  )[0]!;
  assert.equal(
    selectReferenceRefinementWindows(
      Array.from({ length: 30 }, (_, index) => ({
        ...interval,
        beforeFrame: index,
      })),
    ).length,
    12,
  );
  let reads = 0;
  const refined = await refineReferenceBracket({
    interval,
    fps: 30,
    threshold: 0.3,
    readFrame: async (index) => {
      reads++;
      return frame(index);
    },
    checkDeadline: () => {},
  });
  assert.equal(refined.refinementSteps, 8);
  assert.equal(refined.refinementBudgetExhausted, true);
  assert.ok(refined.nominalBoundaryFrameRange.resolutionFrames > 1);
  assert.equal(
    refined.confidence.evidenceLevel,
    "unresolved-nominal-grid-range-change",
  );
  assert.equal(reads, 26);
});

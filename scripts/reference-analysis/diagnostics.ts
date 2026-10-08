import {
  meanAbsolutePixelDifference,
  REFERENCE_MAX_REFINEMENT_STEPS,
  REFERENCE_MAX_REFINEMENT_WINDOWS,
} from "./domain";
import { describeReferenceChange } from "./motion";

export type ReferenceSample = Readonly<{
  nominalFrame: number;
  pixels: Uint8Array;
}>;

export const describeCoarseReferenceIntervals = (
  samples: readonly ReferenceSample[],
  fps: number,
  threshold: number,
) =>
  samples.slice(1).map((sample, index) => {
    const previous = samples[index];
    const before = samples[index - 1];
    const after = samples[index + 2];
    const transientBefore =
      before !== undefined &&
      meanAbsolutePixelDifference(before.pixels, sample.pixels) <
        Math.min(0.1, threshold / 2);
    const transientAfter =
      after !== undefined &&
      meanAbsolutePixelDifference(previous.pixels, after.pixels) <
        Math.min(0.1, threshold / 2);
    const change = describeReferenceChange(
      previous.pixels,
      sample.pixels,
      threshold,
    );
    return {
      beforeFrame: previous.nominalFrame,
      afterFrame: sample.nominalFrame,
      startSeconds: previous.nominalFrame / fps,
      endSeconds: sample.nominalFrame / fps,
      ...change,
      transientOrFlashPossible:
        change.abruptChangeCandidate && (transientBefore || transientAfter),
    };
  });

export type ReferenceCoarseInterval = ReturnType<
  typeof describeCoarseReferenceIntervals
>[number];

export const selectReferenceRefinementWindows = (
  intervals: readonly ReferenceCoarseInterval[],
) =>
  intervals
    .filter(({ abruptChangeCandidate }) => abruptChangeCandidate)
    .sort(
      (left, right) =>
        right.normalizedMeanAbsoluteDifference -
          left.normalizedMeanAbsoluteDifference ||
        left.beforeFrame - right.beforeFrame,
    )
    .slice(0, REFERENCE_MAX_REFINEMENT_WINDOWS);

export const refineReferenceBracket = async ({
  interval,
  fps,
  threshold,
  readFrame,
  checkDeadline,
}: {
  readonly interval: ReferenceCoarseInterval;
  readonly fps: number;
  readonly threshold: number;
  readonly readFrame: (nominalFrame: number) => Promise<ReferenceSample>;
  readonly checkDeadline: () => void;
}) => {
  let beforeFrame = interval.beforeFrame;
  let afterFrame = interval.afterFrame;
  const trace: {
    nominalFrame: number;
    leftDifference: number;
    rightDifference: number;
    retainedHalf: "left" | "right";
  }[] = [];
  while (
    afterFrame - beforeFrame > 1 &&
    trace.length < REFERENCE_MAX_REFINEMENT_STEPS
  ) {
    checkDeadline();
    const midpoint = Math.floor((beforeFrame + afterFrame) / 2);
    const [before, middle, after] = await Promise.all([
      readFrame(beforeFrame),
      readFrame(midpoint),
      readFrame(afterFrame),
    ]);
    const left = describeReferenceChange(
      before.pixels,
      middle.pixels,
      threshold,
    );
    const right = describeReferenceChange(
      middle.pixels,
      after.pixels,
      threshold,
    );
    const leftStrength = left.explainedByImageMotion
      ? 0
      : left.normalizedMeanAbsoluteDifference;
    const rightStrength = right.explainedByImageMotion
      ? 0
      : right.normalizedMeanAbsoluteDifference;
    const retainedHalf =
      leftStrength >= rightStrength ? ("left" as const) : ("right" as const);
    trace.push({
      nominalFrame: midpoint,
      leftDifference: left.normalizedMeanAbsoluteDifference,
      rightDifference: right.normalizedMeanAbsoluteDifference,
      retainedHalf,
    });
    if (retainedHalf === "left") afterFrame = midpoint;
    else beforeFrame = midpoint;
  }
  const before = await readFrame(beforeFrame),
    after = await readFrame(afterFrame);
  const change = describeReferenceChange(
    before.pixels,
    after.pixels,
    threshold,
  );
  const resolutionFrames = afterFrame - beforeFrame;
  return {
    coarseBeforeFrame: interval.beforeFrame,
    coarseAfterFrame: interval.afterFrame,
    beforeFrame,
    afterFrame,
    startSeconds: beforeFrame / fps,
    endSeconds: afterFrame / fps,
    nominalBoundaryFrameRange: {
      lowerExclusive: beforeFrame,
      upperInclusive: afterFrame,
      resolutionFrames,
    },
    refinementSteps: trace.length,
    refinementBudgetExhausted: resolutionFrames > 1,
    trace,
    ...change,
    confidence: {
      interpretation: interval.transientOrFlashPossible
        ? ("transient-or-flash-possible" as const)
        : ("cut-or-fast-image-change-possible" as const),
      evidenceLevel: !change.abruptChangeCandidate
        ? ("no-abrupt-change-in-tested-bracket" as const)
        : resolutionFrames === 1
          ? ("adjacent-nominal-grid-change" as const)
          : ("unresolved-nominal-grid-range-change" as const),
      calibratedProbability: null,
      sourceFrameBoundaryVerified: false,
    },
  };
};

export type ReferenceRefinement = Awaited<
  ReturnType<typeof refineReferenceBracket>
>;

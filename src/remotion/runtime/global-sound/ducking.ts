import {createFingerprint} from "../../../contracts/fingerprint";

export type SpokenFrameRange = {
  readonly startFrame: number;
  readonly endFrame: number;
};

type TimingSegment = {
  readonly kind: "chunk" | "pause";
  readonly frameRange: SpokenFrameRange;
};

export const createSpokenFrameRanges = (
  segments: readonly TimingSegment[],
  durationInFrames: number,
): readonly SpokenFrameRange[] => {
  if (!Number.isSafeInteger(durationInFrames) || durationInFrames <= 0) {
    throw new Error("Global sound duration must be a positive integer.");
  }
  let previousEnd = 0;
  const ranges: SpokenFrameRange[] = [];
  segments.forEach((segment) => {
    const {startFrame, endFrame} = segment.frameRange;
    if (
      !Number.isSafeInteger(startFrame) ||
      !Number.isSafeInteger(endFrame) ||
      startFrame < previousEnd ||
      endFrame < startFrame ||
      endFrame > durationInFrames
    ) {
      throw new Error("SemanticTiming frame ranges are not canonical.");
    }
    previousEnd = endFrame;
    if (segment.kind === "chunk") {
      if (endFrame <= startFrame) {
        throw new Error("Spoken ranges must be non-empty.");
      }
      ranges.push({startFrame, endFrame});
    }
  });
  return ranges;
};

const interpolateLinear = (
  value: number,
  inputStart: number,
  inputEnd: number,
  outputStart: number,
  outputEnd: number,
) => {
  if (value <= inputStart) return outputStart;
  if (value >= inputEnd) return outputEnd;
  return (
    outputStart +
    ((value - inputStart) / (inputEnd - inputStart)) *
      (outputEnd - outputStart)
  );
};

export const evaluateDuckEnvelope = ({
  frame,
  ranges,
  durationInFrames,
  attackFrames,
  releaseFrames,
  spokenGain,
  unspokenGain,
}: {
  readonly frame: number;
  readonly ranges: readonly SpokenFrameRange[];
  readonly durationInFrames: number;
  readonly attackFrames: number;
  readonly releaseFrames: number;
  readonly spokenGain: number;
  readonly unspokenGain: number;
}): number => {
  if (
    !Number.isSafeInteger(frame) ||
    frame < 0 ||
    frame >= durationInFrames
  ) {
    throw new Error("Duck envelope frame is outside the composition.");
  }
  if (
    !Number.isSafeInteger(attackFrames) ||
    attackFrames <= 0 ||
    !Number.isSafeInteger(releaseFrames) ||
    releaseFrames <= 0 ||
    ![spokenGain, unspokenGain].every(Number.isFinite) ||
    spokenGain < 0 ||
    spokenGain >= unspokenGain ||
    unspokenGain > 1
  ) {
    throw new Error("Duck envelope policy is invalid.");
  }
  let gain = unspokenGain;
  for (const range of ranges) {
    const attackStart = Math.max(0, range.startFrame - attackFrames);
    const releaseEnd = range.endFrame + releaseFrames;
    let rangeGain = unspokenGain;
    if (frame >= attackStart && frame < range.startFrame) {
      rangeGain = interpolateLinear(
        frame,
        attackStart,
        range.startFrame,
        unspokenGain,
        spokenGain,
      );
    } else if (frame >= range.startFrame && frame <= range.endFrame) {
      rangeGain = spokenGain;
    } else if (frame > range.endFrame && frame < releaseEnd) {
      rangeGain = interpolateLinear(
        frame,
        range.endFrame,
        releaseEnd,
        spokenGain,
        unspokenGain,
      );
    }
    gain = Math.min(gain, rangeGain);
  }
  return gain;
};

export const createDuckEnvelopeFingerprint = ({
  ranges,
  durationInFrames,
  attackFrames,
  releaseFrames,
  spokenGain,
  unspokenGain,
}: Omit<Parameters<typeof evaluateDuckEnvelope>[0], "frame">) =>
  createFingerprint({
    namespace: "semantic-spoken-min-envelope",
    version: 1,
    value: {
      policyId: "semantic-spoken-min-envelope-v1",
      ranges,
      durationInFrames,
      attackFrames,
      releaseFrames,
      spokenGain,
      unspokenGain,
    },
  });

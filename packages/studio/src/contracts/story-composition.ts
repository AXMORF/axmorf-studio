export const STORY_COMPOSITION_TIMELINE_VERSION =
  "scene-package-timeline-v1" as const;

const assertSafeFrame = (frame: number, label: string, allowZero: boolean) => {
  if (!Number.isSafeInteger(frame) || (allowZero ? frame < 0 : frame <= 0)) {
    throw new Error(
      `${label} must be a ${allowZero ? "non-negative" : "positive"} safe integer.`,
    );
  }
};

export const getStoryCompositionDurationInFrames = (
  semanticTimingDurationInFrames: number,
) => {
  assertSafeFrame(
    semanticTimingDurationInFrames,
    "SemanticTiming duration",
    false,
  );
  return semanticTimingDurationInFrames;
};

export const toStoryCompositionFrame = (semanticFrame: number) => {
  assertSafeFrame(semanticFrame, "Semantic frame", true);
  return semanticFrame;
};

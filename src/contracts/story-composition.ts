export const STORY_COMPOSITION_TIMELINE_VERSION = "fixed-bookends-v1" as const;
export const FIXED_INTRO_DURATION_IN_FRAMES = 60;
export const FIXED_OUTRO_DURATION_IN_FRAMES = 240;

const assertSafeFrame = (frame: number, label: string, allowZero: boolean) => {
  if (!Number.isSafeInteger(frame) || (allowZero ? frame < 0 : frame <= 0)) {
    throw new Error(
      `${label} must be a ${allowZero ? "non-negative" : "positive"} safe integer.`,
    );
  }
};

export const getStoryCompositionDurationInFrames = (
  bodyDurationInFrames: number,
) => {
  assertSafeFrame(bodyDurationInFrames, "Body duration", false);
  const durationInFrames =
    FIXED_INTRO_DURATION_IN_FRAMES +
    bodyDurationInFrames +
    FIXED_OUTRO_DURATION_IN_FRAMES;
  assertSafeFrame(durationInFrames, "Story Composition duration", false);
  return durationInFrames;
};

export const toStoryCompositionFrame = (bodyFrame: number) => {
  assertSafeFrame(bodyFrame, "Body frame", true);
  const compositionFrame = FIXED_INTRO_DURATION_IN_FRAMES + bodyFrame;
  assertSafeFrame(compositionFrame, "Story Composition frame", true);
  return compositionFrame;
};

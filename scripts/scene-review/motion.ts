/** Temporal evidence is for human review; it is never an aesthetic approval. */
export const planMotionReview = (
  ranges: readonly Readonly<{ startFrame: number; endFrame: number }>[],
  fps: number,
  frameCount: number,
  contentRange: Readonly<{ startFrame: number; endFrame: number }> = {
    startFrame: 0,
    endFrame: frameCount,
  },
) => {
  if (
    !Number.isInteger(fps) ||
    fps <= 0 ||
    !Number.isInteger(frameCount) ||
    frameCount <= 0 ||
    ranges.length === 0 ||
    !Number.isInteger(contentRange.startFrame) ||
    !Number.isInteger(contentRange.endFrame) ||
    contentRange.startFrame < 0 ||
    contentRange.endFrame > frameCount ||
    contentRange.startFrame >= contentRange.endFrame
  ) {
    throw new Error("Invalid motion review timeline.");
  }
  let previousEnd = contentRange.startFrame;
  for (const range of ranges) {
    if (
      !Number.isInteger(range.startFrame) ||
      !Number.isInteger(range.endFrame) ||
      range.startFrame !== previousEnd ||
      range.endFrame <= range.startFrame ||
      range.endFrame > contentRange.endFrame
    ) {
      throw new Error(
        "Motion review ranges must cover the exact contiguous timeline.",
      );
    }
    previousEnd = range.endFrame;
  }
  if (previousEnd !== contentRange.endFrame)
    throw new Error("Motion review timeline is incomplete.");
  const radius = Math.max(1, Math.round(fps * 0.75));
  return [
    ...ranges.map((range, index) => ({
      ...range,
      kind: "scene" as const,
      file: `motion-scene-${String(index + 1).padStart(4, "0")}.mp4`,
    })),
    ...ranges.slice(1).map((range, index) => ({
      kind: "boundary" as const,
      startFrame: Math.max(0, range.startFrame - radius),
      endFrame: Math.min(frameCount, range.startFrame + radius),
      file: `motion-boundary-${String(index + 1).padStart(4, "0")}.mp4`,
    })),
  ];
};

/** Action windows point reviewers at causes, results and reading holds; no automatic pass. */
export const planActionReview = (
  shots: import("@axmorf/studio/contracts").ShotPlanSet,
  sceneStartFrame: number,
) => {
  if (!Number.isSafeInteger(sceneStartFrame) || sceneStartFrame < 0)
    throw new Error("Invalid Scene review offset.");
  const motion = shots.motionPlan;
  if (motion === undefined) return [];
  return motion.actions.map((action) => {
    const startFrame = sceneStartFrame + action.frameRange.startFrame;
    const endFrame = sceneStartFrame + action.frameRange.endFrame;
    const holdStartFrame = endFrame - action.readingHoldFrames;
    return {
      meaningId: shots.meaningId,
      actionId: action.actionId,
      shotId: action.shotId,
      objectIds: action.objectIds,
      kind: action.kind,
      explanatoryPurpose: action.explanatoryPurpose,
      initialState: action.initialState,
      resultingState: action.resultingState,
      sourcePlanFingerprint: shots.shotPlanFingerprint,
      frameRange: { startFrame, endFrame },
      readingHold:
        action.readingHoldFrames > 0
          ? { startFrame: holdStartFrame, endFrame }
          : null,
      sampleFrames: [
        ...new Set([
          startFrame,
          Math.floor((startFrame + holdStartFrame - 1) / 2),
          Math.max(startFrame, holdStartFrame - 1),
          endFrame - 1,
        ]),
      ].sort((a, b) => a - b),
      revisionTarget: {
        meaningIds: [shots.meaningId],
        actionIds: [action.actionId],
        preserve: ["sealed narration samples", "unaffected Scene assets"],
        reviewQuestions: [
          "Does the action explain the intended cause and result?",
          "Can labels be read during motion and the declared hold?",
          "Does the handoff preserve the intended subject or justify a cut?",
        ],
      },
      implementation:
        motion.schemaVersion === 2 ? "custom-intent" : "optional-tracked",
      assessment: "needs-temporal-review" as const,
    };
  });
};

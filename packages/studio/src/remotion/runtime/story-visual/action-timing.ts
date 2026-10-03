import type {
  SceneSyncAnchorSet,
  ShotPlanSet,
} from "../../../contracts/scene-plan";

const progress = (frame: number, first: number, last: number) =>
  frame < first
    ? 0
    : last <= first
      ? 1
      : Math.min(1, (frame - first) / (last - first));

/**
 * Consume authored intent timing without prescribing a shape, renderer or easing.
 * End frames are exclusive. The last changing frame reaches the result so a
 * reading hold can keep that result, including when an action has only one frame.
 */
export const resolveSceneActionTiming = ({
  shots,
  syncAnchors,
  actionId,
  sceneFrame,
}: {
  readonly shots: ShotPlanSet;
  readonly syncAnchors: SceneSyncAnchorSet;
  readonly actionId: string;
  readonly sceneFrame: number;
}) => {
  if (!Number.isFinite(sceneFrame))
    throw new Error("Scene action frame must be finite.");
  if (
    shots.meaningId !== syncAnchors.meaningId ||
    shots.taskInputFingerprint !== syncAnchors.taskInputFingerprint ||
    shots.sceneDurationInFrames !== syncAnchors.sceneDurationInFrames
  )
    throw new Error("Scene action plans are cross-bound.");
  const action = shots.motionPlan?.actions.find(
    (item) => item.actionId === actionId,
  );
  if (!action) throw new Error(`Scene action is not declared: ${actionId}.`);
  const { startFrame, endFrame } = action.frameRange;
  const anchor =
    action.syncAnchorId === null
      ? null
      : syncAnchors.anchors.find(
          (item) => item.eventId === action.syncAnchorId,
        );
  if (action.syncAnchorId !== null && !anchor)
    throw new Error("Scene action sync anchor is missing.");
  const changeStartFrame = anchor?.sceneLocalFrame ?? startFrame;
  const holdStartFrame =
    action.kind === "hold" ? startFrame : endFrame - action.readingHoldFrames;
  if (
    changeStartFrame < startFrame ||
    (action.kind !== "hold" && changeStartFrame >= holdStartFrame)
  )
    throw new Error("Scene action anchor must precede its reading hold.");
  const phase =
    sceneFrame < startFrame
      ? "before"
      : sceneFrame >= endFrame
        ? "after"
        : sceneFrame >= holdStartFrame
          ? "reading-hold"
          : sceneFrame < changeStartFrame
            ? "anticipation"
            : "change";
  return {
    action,
    phase,
    startFrame,
    changeStartFrame,
    holdStartFrame,
    endFrame,
    anticipationProgress: progress(
      sceneFrame,
      startFrame,
      changeStartFrame - 1,
    ),
    changeProgress:
      action.kind === "hold"
        ? sceneFrame < startFrame
          ? 0
          : 1
        : progress(sceneFrame, changeStartFrame, holdStartFrame - 1),
    elapsedFrames: sceneFrame - startFrame,
  } as const;
};

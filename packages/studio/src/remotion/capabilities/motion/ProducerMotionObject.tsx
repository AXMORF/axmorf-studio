import type { ReactNode } from "react";
import {
  resolveMotionTrackState,
  type SceneMotionPlan,
  type MotionObjectState,
} from "../../../contracts/scene-motion";

export const resolveSceneMotionObjectState = (
  plan: SceneMotionPlan,
  objectId: string,
  frame: number,
) => {
  if (plan.schemaVersion !== 1)
    throw new Error(
      "ProducerMotionObject requires optional tracked geometry (motionPlan v1); render intent plans with authored animation code.",
    );
  const track = plan.objects.find((object) => object.objectId === objectId);
  if (track === undefined)
    throw new Error(`Undeclared motion object: ${objectId}.`);
  return resolveMotionTrackState(track, frame);
};

/** Children draw authored content; this primitive prescribes no metaphor, palette or effect. */
export const ProducerMotionObject = ({
  plan,
  objectId,
  frame,
  width,
  height,
  children,
}: {
  readonly plan: SceneMotionPlan;
  readonly objectId: string;
  readonly frame: number;
  readonly width: number;
  readonly height: number;
  readonly children: ReactNode | ((state: MotionObjectState) => ReactNode);
}) => {
  const state = resolveSceneMotionObjectState(plan, objectId, frame);
  return (
    <div
      data-motion-object={objectId}
      style={{
        position: "absolute",
        left: state.x * width,
        top: state.y * height,
        opacity: state.opacity,
        transform: `translate(-50%, -50%) rotate(${state.rotation}deg) scale(${state.scale})`,
        transformOrigin: "center",
      }}
    >
      {typeof children === "function" ? children(state) : children}
    </div>
  );
};

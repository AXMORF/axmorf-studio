import { z } from "zod";
import {
  SceneEventIdSchema,
  SceneLocalFrameRangeSchema,
  ShotIdSchema,
} from "./scene-primitives";

const Id = z
  .string()
  .min(1)
  .max(96)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
const Text = z.string().trim().min(1).max(1600);

/** Geometry is viewport-relative, while value remains in the authored data domain. */
export const MotionObjectStateSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    scale: z.number().finite().positive(),
    rotation: z.number().finite(),
    opacity: z.number().min(0).max(1),
    reveal: z.number().min(0).max(1),
    value: z.number().finite(),
  })
  .strict()
  .readonly();
export type MotionObjectState = z.infer<typeof MotionObjectStateSchema>;

export const MotionObjectTrackSchema = z
  .object({
    objectId: Id,
    meaning: Text,
    keyframes: z
      .array(
        z
          .object({
            frame: z.number().int().safe().nonnegative(),
            state: MotionObjectStateSchema,
            easing: z.enum(["linear", "ease-in-out", "ease-out"]),
          })
          .strict()
          .readonly(),
      )
      .min(1)
      .max(128)
      .readonly(),
  })
  .strict()
  .superRefine((track, context) => {
    if (
      track.keyframes[0].frame !== 0 ||
      track.keyframes.some(
        (keyframe, index) =>
          index > 0 && keyframe.frame <= track.keyframes[index - 1].frame,
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "Object keyframes must begin at zero and strictly increase.",
        path: ["keyframes"],
      });
    }
  })
  .readonly();
export type MotionObjectTrack = z.infer<typeof MotionObjectTrackSchema>;

const Handoff = z
  .object({ continuityId: Id, objectId: Id })
  .strict()
  .readonly();
const TrackedPlan = z
  .object({
    schemaVersion: z.literal(1),
    objects: z.array(MotionObjectTrackSchema).min(1).max(64).readonly(),
    actions: z
      .array(
        z
          .object({
            actionId: Id,
            shotId: ShotIdSchema,
            kind: z.enum([
              "reveal",
              "transform",
              "connect",
              "compare",
              "trace",
              "proof",
              "hold",
            ]),
            explanatoryPurpose: Text,
            initialState: Text,
            resultingState: Text,
            objectIds: z.array(Id).min(1).max(32).readonly(),
            frameRange: SceneLocalFrameRangeSchema,
            syncAnchorId: SceneEventIdSchema.nullable(),
            readingHoldFrames: z.number().int().safe().nonnegative(),
          })
          .strict()
          .readonly(),
      )
      .min(1)
      .max(128)
      .readonly(),
    handoff: z
      .object({
        kind: z.enum(["continuous", "motivated-cut", "end"]),
        reason: Text,
        incoming: z.array(Handoff).max(32).readonly(),
        outgoing: z.array(Handoff).max(32).readonly(),
      })
      .strict()
      .readonly(),
  })
  .strict();

/** Intent is executable review context, not a mandatory geometry or component recipe. */
const IntentPlan = TrackedPlan.extend({
  schemaVersion: z.literal(2),
  objects: z
    .array(z.object({ objectId: Id, meaning: Text }).strict().readonly())
    .min(1)
    .max(64)
    .readonly(),
  actions: TrackedPlan.shape.actions
    .unwrap()
    .element.unwrap()
    .extend({ kind: Text })
    .readonly()
    .array()
    .min(1)
    .max(128)
    .readonly(),
}).strict();

const validateReferences = (
  plan: z.infer<typeof TrackedPlan> | z.infer<typeof IntentPlan>,
  context: z.RefinementCtx,
) => {
  const objects = new Set(plan.objects.map((o) => o.objectId));
  if (
    objects.size !== plan.objects.length ||
    new Set(plan.actions.map((a) => a.actionId)).size !== plan.actions.length
  )
    context.addIssue({
      code: "custom",
      message: "Motion object and action identities must be unique.",
    });
  for (const action of plan.actions) {
    if (
      new Set(action.objectIds).size !== action.objectIds.length ||
      action.objectIds.some((id) => !objects.has(id))
    )
      context.addIssue({
        code: "custom",
        message: "Action object references must be declared and unique.",
      });
    if (
      action.readingHoldFrames >=
      action.frameRange.endFrame - action.frameRange.startFrame
    )
      context.addIssue({
        code: "custom",
        message: "Reading hold must leave time for the explanatory action.",
      });
    if (action.kind !== "hold" && action.syncAnchorId === null)
      context.addIssue({
        code: "custom",
        message:
          "Explanatory motion requires a declared narration sync anchor.",
      });
  }
  for (const direction of ["incoming", "outgoing"] as const) {
    const handoffs = plan.handoff[direction];
    if (
      new Set(handoffs.map((h) => h.continuityId)).size !== handoffs.length ||
      handoffs.some((h) => !objects.has(h.objectId))
    )
      context.addIssue({
        code: "custom",
        message:
          "Continuity identities must be unique and bind existing objects.",
      });
  }
  if (plan.handoff.kind === "continuous" && plan.handoff.outgoing.length === 0)
    context.addIssue({
      code: "custom",
      message: "Continuous transition needs an outgoing object identity.",
    });
  if (plan.handoff.kind === "end" && plan.handoff.outgoing.length > 0)
    context.addIssue({
      code: "custom",
      message: "End transition cannot promise an outgoing object.",
    });
};
export const TrackedSceneMotionPlanSchema =
  TrackedPlan.superRefine(validateReferences).readonly();
export const IntentSceneMotionPlanSchema =
  IntentPlan.superRefine(validateReferences).readonly();
export const SceneMotionPlanSchema = z.union([
  TrackedSceneMotionPlanSchema,
  IntentSceneMotionPlanSchema,
]);
export type SceneMotionPlan = z.infer<typeof SceneMotionPlanSchema>;

export const resolveMotionTrackState = (
  track: MotionObjectTrack,
  frame: number,
): MotionObjectState => {
  if (!Number.isFinite(frame)) throw new Error("Motion frame must be finite.");
  const first = track.keyframes[0];
  const last = track.keyframes[track.keyframes.length - 1];
  if (frame <= first.frame) return first.state;
  if (frame >= last.frame) return last.state;
  const index = track.keyframes.findIndex(
    (keyframe) => keyframe.frame >= frame,
  );
  const from = track.keyframes[index - 1];
  const to = track.keyframes[index];
  const t = (frame - from.frame) / (to.frame - from.frame);
  const p =
    to.easing === "ease-in-out"
      ? t * t * (3 - 2 * t)
      : to.easing === "ease-out"
        ? 1 - (1 - t) ** 3
        : t;
  const blend = (key: keyof MotionObjectState) =>
    from.state[key] + (to.state[key] - from.state[key]) * p;
  return {
    x: blend("x"),
    y: blend("y"),
    scale: blend("scale"),
    rotation: blend("rotation"),
    opacity: blend("opacity"),
    reveal: blend("reveal"),
    value: blend("value"),
  };
};

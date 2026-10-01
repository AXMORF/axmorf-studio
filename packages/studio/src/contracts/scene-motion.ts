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

export const SCENE_MOTION_REQUIREMENT_ID = "scene-content-motion-v1" as const;
export const SCENE_MOTION_REQUIREMENT = Object.freeze({
  requirementId: SCENE_MOTION_REQUIREMENT_ID,
  scope: "all-scenes",
  targetMeaningIds: [],
  category: "visual",
  owner: "scene-agent",
  verification: "contract",
  severity: "error",
  statement:
    "Narrated Scenes require an intent-first motionPlan: explanatory purpose, subjects/actions, narration alignment, readable holds and continuity. Custom frame-driven animation and optional tracked components are allowed. DOM dependency evidence is limited; actual temporal review is required and is not automatic aesthetic approval.",
} as const);

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

export const validateSceneMotionPlan = ({
  plan: rawPlan,
  shots,
  anchors,
  duration,
  narrationCues,
}: {
  readonly plan: unknown;
  readonly shots: readonly Readonly<{
    shotId: string;
    primaryRange: { startFrame: number; endFrame: number };
    syncAnchorIds: readonly string[];
  }>[];
  readonly anchors: readonly Readonly<{
    eventId: string;
    sceneLocalFrame: number;
  }>[];
  readonly duration: number;
  readonly narrationCues?: readonly Readonly<{
    startFrame: number;
    endFrame: number;
  }>[];
}) => {
  const plan = SceneMotionPlanSchema.parse(rawPlan);
  if (plan.schemaVersion === 1)
    for (const object of plan.objects)
      if (object.keyframes.at(-1)?.frame !== duration - 1)
        throw new Error(
          "Every object track must cover the immutable Scene duration.",
        );
  for (const shot of shots)
    if (!plan.actions.some((action) => action.shotId === shot.shotId))
      throw new Error(
        "Every shot needs an explanatory action or an explicit deliberate hold.",
      );
  for (const action of plan.actions) {
    const shot = shots.find((s) => s.shotId === action.shotId);
    const range = action.frameRange;
    if (
      !shot ||
      range.startFrame < shot.primaryRange.startFrame ||
      range.endFrame > shot.primaryRange.endFrame
    )
      throw new Error("Motion action exceeds its owning shot.");
    if (action.syncAnchorId !== null) {
      const anchor = anchors.find((a) => a.eventId === action.syncAnchorId);
      if (
        !anchor ||
        !shot.syncAnchorIds.includes(anchor.eventId) ||
        anchor.sceneLocalFrame < range.startFrame ||
        anchor.sceneLocalFrame >= range.endFrame - action.readingHoldFrames
      )
        throw new Error(
          "Motion sync anchor must belong to the action before its reading hold.",
        );
      if (
        narrationCues &&
        !narrationCues.some(
          (cue) =>
            cue.startFrame <= anchor.sceneLocalFrame &&
            anchor.sceneLocalFrame < cue.endFrame,
        )
      )
        throw new Error(
          "Motion sync anchor is outside the sealed narration cue windows.",
        );
    }
    // Intent-only plans retain timing/reference checks; their geometry is reviewed in rendered previews.
    if (plan.schemaVersion === 2) continue;
    const moving = action.objectIds.some((id) => {
      const object = plan.objects.find((o) => o.objectId === id)!;
      const samples = [
        range.startFrame,
        range.endFrame - 1,
        ...object.keyframes
          .filter((k) => k.frame > range.startFrame && k.frame < range.endFrame)
          .map((k) => k.frame),
      ];
      return (
        new Set(
          samples.map((frame) =>
            JSON.stringify(resolveMotionTrackState(object, frame)),
          ),
        ).size > 1
      );
    });
    if (
      (action.kind === "hold" && moving) ||
      (action.kind !== "hold" && !moving)
    )
      throw new Error(
        "Declared motion must change object state; deliberate holds must remain stable.",
      );
    if (action.readingHoldFrames > 0)
      for (const id of action.objectIds) {
        const object = plan.objects.find((o) => o.objectId === id)!;
        const start = range.endFrame - action.readingHoldFrames;
        const samples = [
          start,
          range.endFrame - 1,
          ...object.keyframes
            .filter((k) => k.frame > start && k.frame < range.endFrame)
            .map((k) => k.frame),
        ];
        if (
          new Set(
            samples.map((frame) =>
              JSON.stringify(resolveMotionTrackState(object, frame)),
            ),
          ).size !== 1
        )
          throw new Error(
            "Reading hold must be stable in the declared object tracks.",
          );
      }
  }
  return plan;
};

/** A mechanical pose check, not proof of visual identity or a compelling transition. */
export const validateMotionContinuity = (
  plans: readonly (SceneMotionPlan | undefined)[],
) => {
  for (let index = 1; index < plans.length; index++) {
    const previous = plans[index - 1];
    const next = plans[index];
    if (previous?.handoff.kind !== "continuous") continue;
    if (next === undefined)
      throw new Error(
        "Continuous handoff requires the next Scene motion plan.",
      );
    for (const outgoing of previous.handoff.outgoing) {
      const incoming = next.handoff.incoming.find(
        (h) => h.continuityId === outgoing.continuityId,
      );
      if (!incoming)
        throw new Error(
          `Missing continuity handoff: ${outgoing.continuityId}.`,
        );
      // Custom implementations promise identity, not a prescribed pose; inspect the actual handoff.
      if (previous.schemaVersion !== 1 || next.schemaVersion !== 1) continue;
      const before = previous.objects
        .find((o) => o.objectId === outgoing.objectId)!
        .keyframes.at(-1)!.state;
      const after = next.objects.find((o) => o.objectId === incoming.objectId)!
        .keyframes[0].state;
      if (JSON.stringify(before) !== JSON.stringify(after))
        throw new Error(
          `Object pose jumps at continuous handoff: ${outgoing.continuityId}.`,
        );
    }
  }
};

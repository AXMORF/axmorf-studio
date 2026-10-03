import { z } from "zod";
import { createFingerprint } from "./fingerprint";
import { MeaningIdSchema, StoryIdSchema } from "./primitives";
import { MotionObjectStateSchema, type SceneMotionPlan } from "./scene-motion";

const Text = z.string().trim().min(1).max(1600);

/** Root authors a shared subject before the two isolated Scene tasks exist. */
export const SceneOutgoingHandoffSchema = z
  .object({
    subject: Text,
    trackedState: MotionObjectStateSchema.optional(),
  })
  .strict()
  .readonly();

const ContinuousHandoffSchema = SceneOutgoingHandoffSchema.unwrap()
  .extend({
    kind: z.literal("continuous"),
    continuityId: z.string().regex(/^handoff-[0-9a-f]{64}$/u),
    reason: Text,
  })
  .strict()
  .readonly();

export const SceneContinuityContractSchema = z
  .object({
    contractVersion: z.literal("scene-continuity-v1"),
    incoming: ContinuousHandoffSchema.nullable(),
    outgoing: z.union([
      ContinuousHandoffSchema,
      z
        .object({ kind: z.enum(["motivated-cut", "end"]), reason: Text })
        .strict()
        .readonly(),
    ]),
  })
  .strict()
  .readonly();
export type SceneContinuityContract = z.infer<
  typeof SceneContinuityContractSchema
>;

export const computeSceneContinuityId = (
  storyId: string,
  fromMeaningId: string,
  toMeaningId: string,
) =>
  `handoff-${createFingerprint({
    namespace: "scene-continuity",
    version: 1,
    value: {
      storyId: StoryIdSchema.parse(storyId),
      fromMeaningId: MeaningIdSchema.parse(fromMeaningId),
      toMeaningId: MeaningIdSchema.parse(toMeaningId),
    },
  }).slice("sha256:".length)}`;

type Beat = Readonly<{
  kind: "narrated-scene" | "silent-scene";
  meaningId: string;
}>;
type Brief = Readonly<{
  meaningId: string;
  continuityBrief: string;
  outgoingHandoff?: z.infer<typeof SceneOutgoingHandoffSchema>;
}>;
type Neighbor = Readonly<{ beat: Beat; brief: Brief }>;

export const buildSceneContinuityContract = ({
  storyId,
  beat,
  brief,
  previous,
  next,
}: {
  readonly storyId: string;
  readonly beat: Beat;
  readonly brief: Brief;
  readonly previous: Neighbor | null;
  readonly next: Neighbor | null;
}): SceneContinuityContract => {
  const seam = (from: Neighbor, to: Neighbor | null) => {
    if (
      from.brief.meaningId !== from.beat.meaningId ||
      (to && to.brief.meaningId !== to.beat.meaningId)
    )
      throw new Error("Scene continuity authoring is cross-bound.");
    if (from.brief.outgoingHandoff === undefined) return null;
    if (
      from.beat.kind !== "narrated-scene" ||
      to?.beat.kind !== "narrated-scene"
    )
      throw new Error(
        "Continuous handoffs require two adjacent authored narrated Scenes.",
      );
    return ContinuousHandoffSchema.parse({
      ...from.brief.outgoingHandoff,
      kind: "continuous",
      continuityId: computeSceneContinuityId(
        storyId,
        from.beat.meaningId,
        to.beat.meaningId,
      ),
      reason: from.brief.continuityBrief,
    });
  };
  const current = { beat, brief };
  return SceneContinuityContractSchema.parse({
    contractVersion: "scene-continuity-v1",
    incoming: previous === null ? null : seam(previous, current),
    outgoing: seam(current, next) ?? {
      kind: next === null ? "end" : "motivated-cut",
      reason: brief.continuityBrief,
    },
  });
};

/** Checks each task against the same immutable seam, before any artifact commit. */
export const validateSceneMotionHandoffs = (
  plan: SceneMotionPlan,
  contract: SceneContinuityContract,
) => {
  if (plan.handoff.kind !== contract.outgoing.kind)
    throw new Error("Scene handoff differs from its frozen outgoing kind.");
  for (const direction of ["incoming", "outgoing"] as const) {
    const expected =
      direction === "incoming"
        ? contract.incoming
        : contract.outgoing.kind === "continuous"
          ? contract.outgoing
          : null;
    const actual = plan.handoff[direction];
    if (
      actual.length !== (expected === null ? 0 : 1) ||
      (expected && actual[0]?.continuityId !== expected.continuityId)
    )
      throw new Error(
        `Scene handoff differs from its frozen ${direction} identity.`,
      );
    if (expected === null) continue;
    const object = plan.objects.find(
      ({ objectId }) => objectId === actual[0].objectId,
    );
    if (!object || object.meaning !== expected.subject)
      throw new Error(
        `Scene handoff differs from its frozen ${direction} subject.`,
      );
    if (plan.schemaVersion !== 1) continue;
    if (expected.trackedState === undefined)
      throw new Error(
        "Tracked continuous handoffs require Root-authored trackedState; use intent v2 for an untracked seam.",
      );
    const track = plan.objects.find(
      ({ objectId }) => objectId === actual[0].objectId,
    )!;
    const pose =
      direction === "incoming"
        ? track.keyframes[0].state
        : track.keyframes.at(-1)!.state;
    if (JSON.stringify(pose) !== JSON.stringify(expected.trackedState))
      throw new Error(
        `Scene handoff differs from its frozen ${direction} pose.`,
      );
  }
};

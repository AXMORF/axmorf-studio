import { z } from "zod";

import type { VideoBrief } from "./brief";
import type { RenderSpec } from "./render";
import type { SemanticTiming } from "./semantic-timing";
import type { StorySpec } from "./story";

const FramesSchema = z.number().int().nonnegative().safe();
const SecondsSchema = z.number().finite().nonnegative();

/** Read-only guidance, never a timing, validation or content-identity authority. */
export const DurationBudgetSchema = z
  .object({
    targetTotalSeconds: z.number().positive().finite(),
    boundarySeconds: SecondsSchema,
    leadAndTailSeconds: SecondsSchema,
    availableNarratedSeconds: SecondsSchema,
    budgetState: z.enum(["narration-budget-available", "no-narration-budget"]),
    actualTotalSeconds: SecondsSchema.nullable(),
    deltaSeconds: z.number().finite().nullable(),
    measurement: z.enum(["not-yet-sealed", "sealed-semantic-timing"]),
    comparison: z.enum([
      "not-yet-measured",
      "longer-than-target",
      "shorter-than-target",
      "matches-target",
    ]),
    guidance: z.array(z.string()).readonly(),
  })
  .strict()
  .readonly();

export type DurationBudget = z.infer<typeof DurationBudgetSchema>;

export const buildDurationBudget = ({
  targetDurationSeconds,
  fps,
  boundaryFrames,
  leadInFrames = 0,
  tailFrames = 0,
  actualDurationInFrames,
}: {
  readonly targetDurationSeconds: number;
  readonly fps: number;
  readonly boundaryFrames: number;
  readonly leadInFrames?: number;
  readonly tailFrames?: number;
  readonly actualDurationInFrames?: number;
}): DurationBudget => {
  z.number().positive().finite().parse(targetDurationSeconds);
  z.number().positive().finite().parse(fps);
  for (const frames of [boundaryFrames, leadInFrames, tailFrames]) {
    FramesSchema.parse(frames);
  }
  const boundarySeconds = boundaryFrames / fps;
  const leadAndTailSeconds = (leadInFrames + tailFrames) / fps;
  const available =
    targetDurationSeconds - boundarySeconds - leadAndTailSeconds;
  const actualTotalSeconds =
    actualDurationInFrames === undefined
      ? null
      : z.number().int().positive().safe().parse(actualDurationInFrames) / fps;
  const deltaSeconds =
    actualTotalSeconds === null
      ? null
      : actualTotalSeconds - targetDurationSeconds;
  return DurationBudgetSchema.parse({
    targetTotalSeconds: targetDurationSeconds,
    boundarySeconds,
    leadAndTailSeconds,
    availableNarratedSeconds: Math.max(0, available),
    budgetState:
      available > 0 ? "narration-budget-available" : "no-narration-budget",
    actualTotalSeconds,
    deltaSeconds,
    measurement:
      actualTotalSeconds === null ? "not-yet-sealed" : "sealed-semantic-timing",
    comparison:
      deltaSeconds === null
        ? "not-yet-measured"
        : deltaSeconds > 0
          ? "longer-than-target"
          : deltaSeconds < 0
            ? "shorter-than-target"
            : "matches-target",
    guidance: [
      "targetTotalSeconds includes silent opening/ending Scenes and render lead-in/tail; availableNarratedSeconds must cover speech and pauses.",
      "Before project:create, budget narration text against availableNarratedSeconds using the selected language and voice; text estimates are not measured duration.",
      "After sealing, actualTotalSeconds follows PCM-derived semantic timing. The target is advisory, with no implicit tolerance, audio truncation or automatic retry.",
      "If a duration change is needed, report the measured deviation and use an explicitly requested project revision; do not edit live authoring or an active attempt.",
    ],
  });
};

export const buildProjectDurationBudget = ({
  brief,
  story,
  render,
  timing,
}: {
  readonly brief: VideoBrief;
  readonly story: StorySpec;
  readonly render: RenderSpec;
  readonly timing?: SemanticTiming;
}): DurationBudget =>
  buildDurationBudget({
    targetDurationSeconds: brief.targetDurationSeconds,
    fps: render.fps,
    boundaryFrames: story.beats.reduce(
      (total, beat) =>
        total +
        (beat.kind === "silent-scene" ? beat.preset.durationInFrames : 0),
      0,
    ),
    leadInFrames: render.leadInFrames,
    tailFrames: render.tailFrames,
    ...(timing === undefined
      ? {}
      : { actualDurationInFrames: timing.durationInFrames }),
  });

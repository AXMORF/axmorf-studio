import { z } from "zod";

import {
  computeGenerationInputFingerprint,
  computeStoryFingerprint,
} from "./generation-input";
import type { NarrationSpec } from "./narration";
import {
  Sha256DigestSchema,
  StoryIdSchema,
  VoiceProfileIdSchema,
} from "./primitives";
import type { StorySpec } from "./story";

export const STORY_CHECK_IDS = [
  "story-beat-order",
  "narrative-completeness",
  "authored-tts-chunks",
  "voice-profile-selection",
  "pronunciation-risks",
] as const;

export type StoryCheckId = (typeof STORY_CHECK_IDS)[number];

const StoryCheckItemSchema = z
  .object({
    checkId: z.enum(STORY_CHECK_IDS),
    status: z.enum(["pass", "warn", "fail"]),
    note: z.string().trim().min(1),
  })
  .strict()
  .readonly();

export const StoryCheckReportSchema = z
  .object({
    schemaVersion: z.literal(1),
    storyId: StoryIdSchema,
    storyFingerprint: Sha256DigestSchema,
    generationInputFingerprint: Sha256DigestSchema,
    voiceProfileId: VoiceProfileIdSchema,
    decision: z.enum(["proceed", "revise"]),
    checks: z.array(StoryCheckItemSchema).length(STORY_CHECK_IDS.length).readonly(),
  })
  .strict()
  .superRefine((report, context) => {
    report.checks.forEach((check, index) => {
      if (check.checkId !== STORY_CHECK_IDS[index]) {
        context.addIssue({
          code: "custom",
          message: "StoryCheck items must contain every required check in order.",
          path: ["checks", index, "checkId"],
        });
      }
    });

    const hasFailure = report.checks.some((check) => check.status === "fail");
    if (
      (report.decision === "proceed" && hasFailure) ||
      (report.decision === "revise" && !hasFailure)
    ) {
      context.addIssue({
        code: "custom",
        message:
          'StoryCheck decision must be "proceed" exactly when no check has failed.',
        path: ["decision"],
      });
    }
  })
  .readonly();

export type StoryCheckReport = z.infer<typeof StoryCheckReportSchema>;

export const validateStoryCheckReport = ({
  story,
  narration,
  report,
}: {
  readonly story: StorySpec;
  readonly narration: NarrationSpec;
  readonly report: unknown;
}): StoryCheckReport => {
  const parsed = StoryCheckReportSchema.parse(report);
  if (parsed.storyId !== story.storyId)
    throw new Error("StoryCheck storyId does not match StorySpec.");
  if (parsed.storyFingerprint !== computeStoryFingerprint(story))
    throw new Error("StoryCheck story fingerprint is stale.");
  if (
    parsed.generationInputFingerprint !==
    computeGenerationInputFingerprint(story, narration)
  )
    throw new Error("StoryCheck generation input fingerprint is stale.");
  if (parsed.voiceProfileId !== narration.voiceProfileId)
    throw new Error("StoryCheck voice profile does not match NarrationSpec.");
  return parsed;
};

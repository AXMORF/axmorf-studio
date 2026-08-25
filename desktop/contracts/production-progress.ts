import { z } from "zod";

import {
  ExecutionAttemptProgressSchema,
  StoryIdSchema,
} from "../../src/contracts";

export const DesktopProductionProgressSchema = z
  .strictObject({
    storyId: StoryIdSchema,
    attemptId: z.string().uuid(),
    revisionId: z.string().regex(/^revision-[a-f0-9]{64}$/u),
    state: z.enum(["waiting-for-agent", "converging", "succeeded", "failed"]),
    updatedAt: z.string().datetime({ offset: true }),
    dirtyAgentTaskCount: z.number().int().nonnegative(),
    reusedTaskCount: z.number().int().nonnegative(),
    committedTaskCount: z.number().int().nonnegative(),
    currentTaskCount: z.number().int().nonnegative(),
    failedTaskCount: z.number().int().nonnegative(),
    terminalResult: z.enum([
      "pending",
      "source-current",
      "delivery-current",
      "failed",
    ]),
    deliveryBuildId: z
      .string()
      .regex(/^delivery-[a-f0-9]{64}$/u)
      .nullable(),
    diagnosticCode: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
      .nullable(),
    deliveryFilesComplete: z.boolean(),
  })
  .superRefine((progress, context) => {
    if (
      (progress.terminalResult === "delivery-current") !==
      (progress.deliveryBuildId !== null && progress.deliveryFilesComplete)
    ) {
      context.addIssue({
        code: "custom",
        message: "Only a current Delivery may expose complete delivery files.",
        path: ["deliveryBuildId"],
      });
    }
  })
  .readonly();

export type DesktopProductionProgress = z.infer<
  typeof DesktopProductionProgressSchema
>;

export const projectDesktopProductionProgress = (rawAttempt: unknown) => {
  const attempt = ExecutionAttemptProgressSchema.parse(rawAttempt);
  return DesktopProductionProgressSchema.parse({
    storyId: attempt.storyId,
    attemptId: attempt.attemptId,
    revisionId: attempt.revisionId,
    state: attempt.state,
    updatedAt: attempt.updatedAt,
    dirtyAgentTaskCount: attempt.taskSummary.dirtyAgentTaskCount,
    reusedTaskCount: attempt.taskSummary.reusedTaskCount,
    committedTaskCount: attempt.taskOutcomeSummary.committedTaskCount,
    currentTaskCount: attempt.taskOutcomeSummary.currentTaskCount,
    failedTaskCount: attempt.taskOutcomeSummary.failedTaskCount,
    terminalResult: attempt.terminalResult.status,
    deliveryBuildId: attempt.terminalResult.deliveryBuildId,
    diagnosticCode: attempt.diagnosticCode,
    deliveryFilesComplete:
      attempt.terminalResult.status === "delivery-current" &&
      attempt.terminalResult.deliveryMedia.length === 3,
  });
};

import { z } from "zod";

import { Sha256DigestSchema, StoryIdSchema } from "./primitives";
import { ProductionRevisionIdSchema } from "./production-revision";
import { ProducerTaskKindSchema, TaskRevisionSchema } from "./producer-task";

export const EXECUTION_ATTEMPT_VERSION = "execution-attempt-v2" as const;
export const EXECUTION_ATTEMPT_EVENT_VERSION =
  "execution-attempt-event-v2" as const;
export const EXECUTION_ATTEMPT_PROGRESS_VERSION =
  "execution-attempt-progress-v2" as const;

export const ExecutionAttemptStateSchema = z.enum([
  "planning",
  "waiting-for-agent",
  "converging",
  "succeeded",
  "failed",
]);

export const ExecutionDiagnosticCodeSchema = z
  .string()
  .min(1)
  .max(96)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);

export const ExecutionAttemptTaskSummarySchema = z
  .object({
    reusedTaskCount: z.number().int().nonnegative(),
    dirtyAgentTaskCount: z.number().int().nonnegative(),
    dirtyFixedTaskCount: z.number().int().nonnegative(),
    blockedTaskCount: z.number().int().nonnegative(),
  })
  .strict()
  .readonly();

export const ExecutionAttemptCacheDecisionSchema = z
  .object({
    taskRevision: TaskRevisionSchema,
    taskKind: ProducerTaskKindSchema,
    semanticId: z.string().min(1).nullable(),
    status: z.enum(["reused", "dirty", "missing", "incompatible", "blocked"]),
    reasonCode: z.enum([
      "artifact-valid",
      "artifact-missing",
      "checksum-drift",
      "input-changed",
      "dependency-changed",
      "validator-version-changed",
      "dependency-blocked",
    ]),
    dependencyTaskRevisions: z.array(TaskRevisionSchema),
  })
  .strict()
  .readonly();

export const ExecutionAttemptTaskOutcomeSchema = z
  .object({
    taskRevision: TaskRevisionSchema,
    taskKind: ProducerTaskKindSchema,
    outcome: z.enum(["artifact-committed", "artifact-current", "failed"]),
    artifactFingerprint: Sha256DigestSchema.nullable(),
    diagnosticCode: ExecutionDiagnosticCodeSchema.nullable(),
  })
  .strict()
  .superRefine((outcome, context) => {
    const failed = outcome.outcome === "failed";
    if (failed !== (outcome.diagnosticCode !== null)) {
      context.addIssue({
        code: "custom",
        message: "Failed task outcomes require one diagnostic code.",
        path: ["diagnosticCode"],
      });
    }
    if (failed === (outcome.artifactFingerprint !== null)) {
      context.addIssue({
        code: "custom",
        message: "Only successful task outcomes bind an artifact.",
        path: ["artifactFingerprint"],
      });
    }
  })
  .readonly();

export const ExecutionAttemptDeliveryResultSchema = z
  .object({
    status: z.enum(["not-verified", "verified", "failed"]),
    deliveryBuildId: z
      .string()
      .regex(/^delivery-[0-9a-f]{64}$/u)
      .nullable(),
    diagnosticCode: ExecutionDiagnosticCodeSchema.nullable(),
  })
  .strict()
  .superRefine((result, context) => {
    if ((result.status === "verified") !== (result.deliveryBuildId !== null)) {
      context.addIssue({
        code: "custom",
        message: "Only a verified delivery binds a DeliveryBuildId.",
        path: ["deliveryBuildId"],
      });
    }
    if ((result.status === "failed") !== (result.diagnosticCode !== null)) {
      context.addIssue({
        code: "custom",
        message: "Only a failed delivery has a diagnostic code.",
        path: ["diagnosticCode"],
      });
    }
  })
  .readonly();

const CacheDecisionListSchema = z
  .array(ExecutionAttemptCacheDecisionSchema)
  .superRefine((decisions, context) => {
    const revisions = decisions.map(({ taskRevision }) => taskRevision);
    const sorted = [...revisions].sort();
    if (
      revisions.some((revision, index) => revision !== sorted[index]) ||
      new Set(revisions).size !== revisions.length
    ) {
      context.addIssue({
        code: "custom",
        message: "Attempt cache decisions must be sorted and unique.",
      });
    }
  });

const ExecutionAttemptIdentityShape = {
  attemptId: z.string().uuid(),
  storyId: StoryIdSchema,
  revisionId: ProductionRevisionIdSchema,
} as const;

const ExecutionAttemptPlanShape = {
  planFingerprint: Sha256DigestSchema.nullable(),
  artifactSetFingerprint: Sha256DigestSchema.nullable(),
  cacheDecisions: CacheDecisionListSchema,
} as const;

const validatePlanBinding = (
  value: {
    readonly planFingerprint: string | null;
    readonly artifactSetFingerprint: string | null;
    readonly cacheDecisions: readonly unknown[];
  },
  context: z.RefinementCtx,
) => {
  const hasPlan = value.planFingerprint !== null;
  if (hasPlan !== (value.artifactSetFingerprint !== null)) {
    context.addIssue({
      code: "custom",
      message: "Attempt plan fingerprints must be present together.",
      path: ["planFingerprint"],
    });
  }
  if (!hasPlan && value.cacheDecisions.length > 0) {
    context.addIssue({
      code: "custom",
      message: "Attempt cache decisions require a plan fingerprint.",
      path: ["cacheDecisions"],
    });
  }
};

export const ExecutionAttemptSchema = z
  .object({
    schemaVersion: z.literal(2),
    contractVersion: z.literal(EXECUTION_ATTEMPT_VERSION),
    ...ExecutionAttemptIdentityShape,
    ...ExecutionAttemptPlanShape,
    state: z.enum(["planning", "waiting-for-agent", "converging"]),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
    dirtyTaskRevisions: z.array(TaskRevisionSchema),
    taskSummary: ExecutionAttemptTaskSummarySchema,
    diagnosticCode: ExecutionDiagnosticCodeSchema.nullable(),
  })
  .strict()
  .superRefine((attempt, context) => {
    validatePlanBinding(attempt, context);
  })
  .readonly();

export const ExecutionAttemptEventSchema = z
  .object({
    schemaVersion: z.literal(2),
    contractVersion: z.literal(EXECUTION_ATTEMPT_EVENT_VERSION),
    eventId: z.string().uuid(),
    eventKind: z.enum([
      "plan-recorded",
      "attempt-opened",
      "task-terminal",
      "delivery-terminal",
    ]),
    recordedAt: z.string().datetime({ offset: true }),
    ...ExecutionAttemptIdentityShape,
    taskOutcome: ExecutionAttemptTaskOutcomeSchema.nullable(),
    deliveryResult: ExecutionAttemptDeliveryResultSchema.nullable(),
  })
  .strict()
  .superRefine((event, context) => {
    if (
      (event.eventKind === "task-terminal") !==
      (event.taskOutcome !== null)
    ) {
      context.addIssue({
        code: "custom",
        message: "Task terminal events require exactly one task outcome.",
        path: ["taskOutcome"],
      });
    }
    if (
      (event.eventKind === "delivery-terminal") !==
      (event.deliveryResult !== null)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Delivery terminal events require exactly one delivery result.",
        path: ["deliveryResult"],
      });
    }
    if (event.deliveryResult?.status === "not-verified") {
      context.addIssue({
        code: "custom",
        message: "A terminal delivery event cannot be not-verified.",
        path: ["deliveryResult", "status"],
      });
    }
  })
  .readonly();

export const ExecutionAttemptTaskOutcomeSummarySchema = z
  .object({
    committedTaskCount: z.number().int().nonnegative(),
    currentTaskCount: z.number().int().nonnegative(),
    failedTaskCount: z.number().int().nonnegative(),
  })
  .strict()
  .readonly();

export const ExecutionAttemptProgressSchema = z
  .object({
    schemaVersion: z.literal(2),
    contractVersion: z.literal(EXECUTION_ATTEMPT_PROGRESS_VERSION),
    ...ExecutionAttemptIdentityShape,
    ...ExecutionAttemptPlanShape,
    state: ExecutionAttemptStateSchema,
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
    dirtyTaskRevisions: z.array(TaskRevisionSchema),
    taskSummary: ExecutionAttemptTaskSummarySchema,
    diagnosticCode: ExecutionDiagnosticCodeSchema.nullable(),
    eventCount: z.number().int().nonnegative(),
    taskOutcomes: z.array(ExecutionAttemptTaskOutcomeSchema),
    taskOutcomeSummary: ExecutionAttemptTaskOutcomeSummarySchema,
    deliveryResult: ExecutionAttemptDeliveryResultSchema,
  })
  .strict()
  .superRefine((progress, context) => {
    validatePlanBinding(progress, context);
    const revisions = progress.taskOutcomes.map(
      ({ taskRevision }) => taskRevision,
    );
    const sorted = [...revisions].sort();
    if (
      revisions.some((revision, index) => revision !== sorted[index]) ||
      new Set(revisions).size !== revisions.length
    ) {
      context.addIssue({
        code: "custom",
        message: "Attempt task outcomes must be sorted and unique.",
        path: ["taskOutcomes"],
      });
    }
    const expected = {
      committedTaskCount: progress.taskOutcomes.filter(
        ({ outcome }) => outcome === "artifact-committed",
      ).length,
      currentTaskCount: progress.taskOutcomes.filter(
        ({ outcome }) => outcome === "artifact-current",
      ).length,
      failedTaskCount: progress.taskOutcomes.filter(
        ({ outcome }) => outcome === "failed",
      ).length,
    };
    for (const key of Object.keys(expected) as Array<keyof typeof expected>) {
      if (progress.taskOutcomeSummary[key] !== expected[key]) {
        context.addIssue({
          code: "custom",
          message: "Attempt task outcome summary is stale.",
          path: ["taskOutcomeSummary", key],
        });
      }
    }
    if (
      (progress.deliveryResult.status === "verified") !==
        (progress.state === "succeeded") ||
      (progress.deliveryResult.status === "failed") !==
        (progress.state === "failed")
    ) {
      context.addIssue({
        code: "custom",
        message: "Execution attempt delivery result does not match its state.",
        path: ["deliveryResult"],
      });
    }
  })
  .readonly();

export type ExecutionAttempt = z.infer<typeof ExecutionAttemptSchema>;
export type ExecutionAttemptEvent = z.infer<typeof ExecutionAttemptEventSchema>;
export type ExecutionAttemptCacheDecision = z.infer<
  typeof ExecutionAttemptCacheDecisionSchema
>;
export type ExecutionAttemptTaskOutcome = z.infer<
  typeof ExecutionAttemptTaskOutcomeSchema
>;
export type ExecutionAttemptDeliveryResult = z.infer<
  typeof ExecutionAttemptDeliveryResultSchema
>;
export type ExecutionAttemptProgress = z.infer<
  typeof ExecutionAttemptProgressSchema
>;

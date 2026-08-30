import { z } from "zod";

import {
  ActualProductionCostSchema,
  DeliveryMediaListSchema,
  DiagnosticInputIdSchema,
  DiagnosticSubjectSchema,
  EstimatedProductionCostSchema,
  TaskDecisionExplanationListSchema,
  TaskDecisionExplanationSchema,
} from "./production-inspection";
import { serializeCanonicalJson } from "./fingerprint";
import { Sha256DigestSchema, StoryIdSchema } from "./primitives";
import { ProductionRevisionIdSchema } from "./production-revision";
import {
  ProducerLogicalPathSchema,
  ProducerTaskKindSchema,
  TaskRevisionSchema,
} from "./producer-task";

export const EXECUTION_ATTEMPT_VERSION = "execution-attempt-v3" as const;
export const EXECUTION_ATTEMPT_EVENT_VERSION =
  "execution-attempt-event-v3" as const;
export const EXECUTION_ATTEMPT_PROGRESS_VERSION =
  "execution-attempt-progress-v3" as const;

export const ExecutionAttemptStateSchema = z.enum([
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

const DiagnosticLogicalPathSchema = ProducerLogicalPathSchema.refine(
  (value) =>
    ["inputs/", "project/", "public/", "src/"].some((prefix) =>
      value.startsWith(prefix),
    ),
  "Diagnostic paths must use a safe task-local prefix.",
);

export const TaskDiagnosticInputFingerprintSchema = z
  .object({ id: DiagnosticInputIdSchema, fingerprint: Sha256DigestSchema })
  .strict()
  .readonly();

export const TaskDiagnosticDependencySchema = z
  .object({
    taskKind: ProducerTaskKindSchema,
    subject: DiagnosticSubjectSchema,
    taskRevision: TaskRevisionSchema,
  })
  .strict()
  .readonly();

const snapshotDependencyKey = (
  value: z.infer<typeof TaskDiagnosticDependencySchema>,
) => `${value.taskKind}:${value.subject.kind}:${value.subject.id}`;

export const TaskDiagnosticSnapshotSchema = z
  .object({
    taskKind: ProducerTaskKindSchema,
    subject: DiagnosticSubjectSchema,
    taskRevision: TaskRevisionSchema,
    inputFingerprints: z.array(TaskDiagnosticInputFingerprintSchema).readonly(),
    validatorPolicyVersion: z.string().min(1).max(160),
    declaredReadSet: z.array(DiagnosticLogicalPathSchema).readonly(),
    declaredOutputSet: z.array(DiagnosticLogicalPathSchema).min(1).readonly(),
    dependencies: z.array(TaskDiagnosticDependencySchema).readonly(),
    decision: TaskDecisionExplanationSchema,
  })
  .strict()
  .superRefine((snapshot, context) => {
    const collections = [
      ["inputFingerprints", snapshot.inputFingerprints.map(({ id }) => id)],
      ["declaredReadSet", snapshot.declaredReadSet],
      ["declaredOutputSet", snapshot.declaredOutputSet],
      ["dependencies", snapshot.dependencies.map(snapshotDependencyKey)],
    ] as const;
    for (const [path, values] of collections) {
      const sorted = [...values].sort();
      if (
        values.some((value, index) => value !== sorted[index]) ||
        new Set(values).size !== values.length
      ) {
        context.addIssue({
          code: "custom",
          message: `${path} must be sorted and unique.`,
          path: [path],
        });
      }
    }
    if (
      snapshot.decision.taskRevision !== snapshot.taskRevision ||
      snapshot.decision.taskKind !== snapshot.taskKind ||
      serializeCanonicalJson(snapshot.decision.subject) !==
        serializeCanonicalJson(snapshot.subject)
    ) {
      context.addIssue({
        code: "custom",
        message: "Diagnostic snapshot decision is stale.",
        path: ["decision"],
      });
    }
  })
  .readonly();

export const TaskDiagnosticSnapshotListSchema = z
  .array(TaskDiagnosticSnapshotSchema)
  .superRefine((snapshots, context) => {
    const revisions = snapshots.map(({ taskRevision }) => taskRevision);
    const sorted = [...revisions].sort();
    if (
      revisions.some((revision, index) => revision !== sorted[index]) ||
      new Set(revisions).size !== revisions.length
    ) {
      context.addIssue({
        code: "custom",
        message: "Task diagnostic snapshots must be sorted and unique.",
      });
    }
    const subjects = snapshots.map(
      ({ taskKind, subject }) => `${taskKind}:${subject.kind}:${subject.id}`,
    );
    if (new Set(subjects).size !== subjects.length) {
      context.addIssue({
        code: "custom",
        message: "Task diagnostic snapshot subjects must be unique per task kind.",
      });
    }
  })
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
    deliveryMedia: DeliveryMediaListSchema,
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
    if (result.status === "not-verified" && result.deliveryMedia.length > 0) {
      context.addIssue({
        code: "custom",
        message: "Unverified delivery cannot report completed media work.",
        path: ["deliveryMedia"],
      });
    }
  })
  .readonly();

const ExecutionAttemptIdentityShape = {
  attemptId: z.string().uuid(),
  storyId: StoryIdSchema,
  revisionId: ProductionRevisionIdSchema,
} as const;

const ExecutionAttemptPlanShape = {
  planFingerprint: Sha256DigestSchema,
  artifactSetFingerprint: Sha256DigestSchema,
  taskExplanations: TaskDecisionExplanationListSchema,
  taskSnapshots: TaskDiagnosticSnapshotListSchema,
  estimatedCost: EstimatedProductionCostSchema,
  actualCost: ActualProductionCostSchema,
} as const;

const validatePlanBinding = (
  value: {
    readonly taskExplanations: readonly z.infer<
      typeof TaskDecisionExplanationSchema
    >[];
    readonly taskSnapshots: readonly z.infer<
      typeof TaskDiagnosticSnapshotSchema
    >[];
  },
  context: z.RefinementCtx,
) => {
  const snapshotExplanations = value.taskSnapshots.map(({ decision }) => decision);
  if (
    serializeCanonicalJson(snapshotExplanations) !==
    serializeCanonicalJson(value.taskExplanations)
  ) {
    context.addIssue({
      code: "custom",
      message: "Attempt task explanations and snapshots disagree.",
      path: ["taskExplanations"],
    });
  }
};

export const ExecutionAttemptSchema = z
  .object({
    schemaVersion: z.literal(3),
    contractVersion: z.literal(EXECUTION_ATTEMPT_VERSION),
    ...ExecutionAttemptIdentityShape,
    ...ExecutionAttemptPlanShape,
    state: z.enum(["waiting-for-agent", "converging"]),
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
    schemaVersion: z.literal(3),
    contractVersion: z.literal(EXECUTION_ATTEMPT_EVENT_VERSION),
    eventId: z.string().uuid(),
    eventKind: z.enum(["attempt-opened", "task-terminal", "delivery-terminal"]),
    recordedAt: z.string().datetime({ offset: true }),
    ...ExecutionAttemptIdentityShape,
    taskOutcome: ExecutionAttemptTaskOutcomeSchema.nullable(),
    deliveryResult: ExecutionAttemptDeliveryResultSchema.nullable(),
  })
  .strict()
  .superRefine((event, context) => {
    if ((event.eventKind === "task-terminal") !== (event.taskOutcome !== null)) {
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
        message: "Delivery terminal events require exactly one delivery result.",
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
    schemaVersion: z.literal(3),
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
    const revisions = progress.taskOutcomes.map(({ taskRevision }) => taskRevision);
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
    if (
      serializeCanonicalJson(progress.actualCost.deliveryMedia) !==
      serializeCanonicalJson(progress.deliveryResult.deliveryMedia)
    ) {
      context.addIssue({
        code: "custom",
        message: "Progress delivery cost is stale.",
        path: ["actualCost", "deliveryMedia"],
      });
    }
  })
  .readonly();

export type TaskDiagnosticSnapshot = z.infer<
  typeof TaskDiagnosticSnapshotSchema
>;
export type ExecutionAttempt = z.infer<typeof ExecutionAttemptSchema>;
export type ExecutionAttemptEvent = z.infer<typeof ExecutionAttemptEventSchema>;
export type ExecutionAttemptTaskOutcome = z.infer<
  typeof ExecutionAttemptTaskOutcomeSchema
>;
export type ExecutionAttemptDeliveryResult = z.infer<
  typeof ExecutionAttemptDeliveryResultSchema
>;
export type ExecutionAttemptProgress = z.infer<
  typeof ExecutionAttemptProgressSchema
>;

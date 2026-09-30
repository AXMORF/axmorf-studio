import {
  EXECUTION_ATTEMPT_PROGRESS_VERSION,
  ExecutionAttemptProgressSchema,
  ProducerPlanSchema,
  TaskDiagnosticSnapshotListSchema,
  type ActualProductionCost,
  type EstimatedProductionCost,
  type ExecutionAttempt,
  type ExecutionAttemptDeliveryResult,
  type ExecutionAttemptEvent,
  type ExecutionAttemptProgress,
  type ExecutionAttemptTaskOutcome,
  type ProducerPlan,
  type TaskDiagnosticSnapshot,
} from "@axmorf/studio/contracts";

const emptyTaskOutcomeSummary = {
  committedTaskCount: 0,
  currentTaskCount: 0,
  failedTaskCount: 0,
} as const;

const notVerifiedDelivery = {
  status: "not-verified",
  deliveryBuildId: null,
  diagnosticCode: null,
  deliveryMedia: [],
} as const;

const initialProgressFields = (
  attempt: ExecutionAttempt,
  eventCount: number,
) => ({
  schemaVersion: 3,
  contractVersion: EXECUTION_ATTEMPT_PROGRESS_VERSION,
  attemptId: attempt.attemptId,
  storyId: attempt.storyId,
  revisionId: attempt.revisionId,
  planFingerprint: attempt.planFingerprint,
  artifactSetFingerprint: attempt.artifactSetFingerprint,
  taskExplanations: attempt.taskExplanations,
  taskSnapshots: attempt.taskSnapshots,
  estimatedCost: attempt.estimatedCost,
  actualCost: attempt.actualCost,
  state: attempt.state,
  createdAt: attempt.createdAt,
  updatedAt: attempt.updatedAt,
  dirtyTaskRevisions: attempt.dirtyTaskRevisions,
  taskSummary: attempt.taskSummary,
  diagnosticCode: attempt.diagnosticCode,
  eventCount,
  taskOutcomes: [],
  taskOutcomeSummary: emptyTaskOutcomeSummary,
  deliveryResult: notVerifiedDelivery,
});

export const createInitialAttemptProgress = (
  attempt: ExecutionAttempt,
  eventCount: number,
): ExecutionAttemptProgress =>
  ExecutionAttemptProgressSchema.parse(
    initialProgressFields(attempt, eventCount),
  );

export const assertAttemptEventIdentity = (
  event: ExecutionAttemptEvent,
  attempt: Pick<ExecutionAttempt, "attemptId" | "storyId" | "revisionId">,
) => {
  if (
    event.attemptId !== attempt.attemptId ||
    event.storyId !== attempt.storyId ||
    event.revisionId !== attempt.revisionId
  ) {
    throw new Error("Execution attempt event identity is cross-bound.");
  }
};

export const projectAttemptProgress = ({
  attempt,
  events,
}: {
  readonly attempt: ExecutionAttempt;
  readonly events: readonly ExecutionAttemptEvent[];
}): ExecutionAttemptProgress => {
  const outcomes = new Map<string, ExecutionAttemptTaskOutcome>();
  const dirty = new Set(attempt.dirtyTaskRevisions);
  let state: ExecutionAttemptProgress["state"] = attempt.state;
  let updatedAt = attempt.updatedAt;
  let diagnosticCode = attempt.diagnosticCode;
  let deliveryResult: ExecutionAttemptDeliveryResult = notVerifiedDelivery;
  for (const event of events) {
    assertAttemptEventIdentity(event, attempt);
    if (event.recordedAt > updatedAt) updatedAt = event.recordedAt;
    if (event.taskOutcome !== null) {
      if (outcomes.has(event.taskOutcome.taskRevision)) {
        throw new Error(
          "Execution attempt contains duplicate task terminal events.",
        );
      }
      outcomes.set(event.taskOutcome.taskRevision, event.taskOutcome);
      if (event.taskOutcome.outcome === "failed") {
        dirty.add(event.taskOutcome.taskRevision);
      } else {
        dirty.delete(event.taskOutcome.taskRevision);
      }
    }
    if (event.deliveryResult !== null) {
      if (deliveryResult.status !== "not-verified") {
        throw new Error(
          "Execution attempt contains duplicate delivery terminal events.",
        );
      }
      deliveryResult = event.deliveryResult;
      state =
        event.deliveryResult.status === "verified" ? "succeeded" : "failed";
      diagnosticCode = event.deliveryResult.diagnosticCode;
    }
  }
  const taskOutcomes = [...outcomes.values()].sort((left, right) =>
    left.taskRevision.localeCompare(right.taskRevision),
  );
  return ExecutionAttemptProgressSchema.parse({
    ...initialProgressFields(attempt, events.length),
    actualCost: {
      ...attempt.actualCost,
      deliveryMedia: deliveryResult.deliveryMedia,
    },
    state,
    updatedAt,
    dirtyTaskRevisions: [...dirty].sort(),
    diagnosticCode,
    taskOutcomes,
    taskOutcomeSummary: {
      committedTaskCount: taskOutcomes.filter(
        ({ outcome }) => outcome === "artifact-committed",
      ).length,
      currentTaskCount: taskOutcomes.filter(
        ({ outcome }) => outcome === "artifact-current",
      ).length,
      failedTaskCount: taskOutcomes.filter(
        ({ outcome }) => outcome === "failed",
      ).length,
    },
    deliveryResult,
  });
};

export const buildAttemptPlanFields = ({
  plan,
  taskSnapshots,
  estimatedCost,
  actualCost,
}: {
  readonly plan: ProducerPlan;
  readonly taskSnapshots: readonly TaskDiagnosticSnapshot[];
  readonly estimatedCost: EstimatedProductionCost;
  readonly actualCost: ActualProductionCost;
}) => {
  const parsed = ProducerPlanSchema.parse(plan);
  const parsedSnapshots = TaskDiagnosticSnapshotListSchema.parse(taskSnapshots);
  return {
    planFingerprint: parsed.planFingerprint,
    artifactSetFingerprint: parsed.artifactSetFingerprint,
    taskExplanations: parsed.tasks,
    taskSnapshots: parsedSnapshots,
    estimatedCost,
    actualCost,
    dirtyTaskRevisions: parsed.tasks
      .filter(({ action }) => action !== "reuse" && action !== "blocked")
      .map(({ taskRevision }) => taskRevision)
      .filter(
        (revision): revision is NonNullable<typeof revision> =>
          revision !== null,
      )
      .sort(),
    taskSummary: parsed.summary,
  } as const;
};

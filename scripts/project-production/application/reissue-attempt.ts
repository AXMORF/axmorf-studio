import type {
  ActualProductionCost,
  EstimatedProductionCost,
} from "../../../src/contracts/production-inspection";
import {
  createExecutionAttemptForPlan,
  readExecutionAttempt,
  readExecutionAttemptsForStory,
} from "../adapters/attempt-store";
import { acquireProductionOperationLock } from "../adapters/production-operation-lock";
import {
  createTaskWorkspace,
  reissueTaskWorkspace,
} from "../adapters/task-workspace";
import type { ProductionCommandFormatter } from "../domain/production-command-formatter";
import { buildTaskDiagnosticSnapshots } from "../domain/task-explanation";
import type { buildCurrentProductionPlan } from "./build-current-plan";
import type { ProductionLocations } from "./production-locations";
import {
  buildDirtyAgentTaskDispatch,
  createDirtyAgentTaskWorkspaces,
} from "./prepare-production";

type CurrentPlan = Awaited<ReturnType<typeof buildCurrentProductionPlan>>;

type RecoveryDependencies = Readonly<{
  commandFormatter: ProductionCommandFormatter;
  buildCurrentPlan: (input: {
    readonly locations: ProductionLocations;
    readonly projectId: string;
  }) => Promise<CurrentPlan>;
  readAttempt?: typeof readExecutionAttempt;
  readAttempts?: typeof readExecutionAttemptsForStory;
  createAttempt?: typeof createExecutionAttemptForPlan;
  createWorkspace?: typeof createTaskWorkspace;
  buildTaskSnapshots?: typeof buildTaskDiagnosticSnapshots;
  acquireLock?: typeof acquireProductionOperationLock;
}>;

const inspectRecovery = async ({
  locations,
  projectId,
  failedAttemptId,
  dependencies,
}: {
  readonly locations: ProductionLocations;
  readonly projectId: string;
  readonly failedAttemptId: string;
  readonly dependencies: RecoveryDependencies;
}) => {
  const readAttempt = dependencies.readAttempt ?? readExecutionAttempt;
  const readAttempts = dependencies.readAttempts ?? readExecutionAttemptsForStory;
  const failed = await readAttempt({
    locations,
    storyId: projectId,
    attemptId: failedAttemptId,
  });
  if (
    failed.state !== "failed" ||
    failed.terminalResult.status !== "failed"
  ) {
    throw new Error("Only a terminal failed attempt can be reissued.");
  }
  const attempts = await readAttempts({ locations, storyId: projectId });
  const active = attempts.find(
    (attempt) =>
      attempt.attemptId !== failedAttemptId &&
      attempt.terminalResult.status === "pending",
  );
  if (active !== undefined) {
    throw new Error("Another production attempt is still active.");
  }
  const current = await dependencies.buildCurrentPlan({
    locations,
    projectId,
  });
  if (current.revision.revisionId !== failed.revisionId) {
    throw new Error("Failed attempt revision is stale against current inputs.");
  }
  if (
    current.plan.summary.dirtyFixedTaskCount !== 0 ||
    current.plan.summary.blockedTaskCount !== 0
  ) {
    throw new Error(
      "Attempt recovery requires every fixed dependency to remain current.",
    );
  }
  const unsupported = current.plan.tasks.find(
    ({ action }) => action !== "reuse" && action !== "dispatch-agent",
  );
  if (unsupported !== undefined) {
    throw new Error("Attempt recovery cannot repair a fixed-flow task.");
  }
  const dirtyAgentTasks = current.plan.tasks
    .filter(
      (task) =>
        task.action === "dispatch-agent" && task.taskRevision !== null,
    )
    .map((task) => ({
      taskKind: task.taskKind,
      subject: task.subject,
      taskRevision: task.taskRevision!,
      changedInputs: task.directChanges
        .filter(({ kind }) => kind === "input")
        .map(({ id }) => id),
      blockedBy: task.blockedBy,
    }));
  return { failed, current, dirtyAgentTasks } as const;
};

export const inspectAttemptRecovery = async (input: {
  readonly locations: ProductionLocations;
  readonly projectId: string;
  readonly failedAttemptId: string;
  readonly dependencies: RecoveryDependencies;
}) => {
  const inspected = await inspectRecovery(input);
  return {
    status: "attempt-recovery-ready" as const,
    storyId: input.projectId,
    failedAttemptId: input.failedAttemptId,
    revisionId: inspected.current.revision.revisionId,
    reusedTaskCount: inspected.current.plan.summary.reusedTaskCount,
    dirtyAgentTasks: inspected.dirtyAgentTasks,
    providerRequests: 0,
    currentDeliveryRequired: false,
    nextAction: "reissue-attempt" as const,
  };
};

export const reissueAttempt = async (input: {
  readonly locations: ProductionLocations;
  readonly projectId: string;
  readonly failedAttemptId: string;
  readonly deliveryPolicy: "manual" | "automatic";
  readonly dependencies: RecoveryDependencies;
}) => {
  const acquireLock =
    input.dependencies.acquireLock ?? acquireProductionOperationLock;
  const lock = await acquireLock({
    locations: input.locations,
    ownerId: "project-production-attempt-reissue",
  });
  try {
    const inspected = await inspectRecovery(input);
    const createAttempt =
      input.dependencies.createAttempt ?? createExecutionAttemptForPlan;
    const createWorkspace =
      input.dependencies.createWorkspace ?? createTaskWorkspace;
    const dirty = await createDirtyAgentTaskWorkspaces({
      locations: input.locations,
      current: inspected.current,
      createWorkspace: async (workspaceInput) => {
        const recovered = await reissueTaskWorkspace({
          ...workspaceInput,
          seedFiles: workspaceInput.seedFiles ?? {},
          failedAttemptId: input.failedAttemptId,
        }).catch(async (error) => {
          if (input.dependencies.createWorkspace !== undefined) {
            return {
              workspace: await createWorkspace(workspaceInput),
              recovery: "preserved" as const,
            };
          }
          throw error;
        });
        return recovered.workspace;
      },
    });
    const taskSnapshots = (
      input.dependencies.buildTaskSnapshots ?? buildTaskDiagnosticSnapshots
    )({
      nodes: inspected.current.nodes,
      subjects: inspected.current.subjects,
      decisions: inspected.current.plan.tasks,
    });
    const estimatedCost: EstimatedProductionCost = {
      ...inspected.failed.estimatedCost,
      providerRequests: 0,
      providerCacheHits: 0,
      agentTasks: dirty.length,
    };
    const actualCost: ActualProductionCost = {
      providerRequests: 0,
      providerCacheHits: 0,
      agentTasks: dirty.length,
      deliveryMedia: [],
    };
    const attempt = await createAttempt({
      locations: input.locations,
      plan: inspected.current.plan,
      taskSnapshots,
      estimatedCost,
      actualCost,
      state: dirty.length === 0 ? "converging" : "waiting-for-agent",
    });
    return {
      status: "project-production-reissued" as const,
      storyId: input.projectId,
      failedAttemptId: input.failedAttemptId,
      attemptId: attempt.attemptId,
      revisionId: inspected.current.revision.revisionId,
      reusedTaskCount: inspected.current.plan.summary.reusedTaskCount,
      dirtyAgentTasks: dirty.map((task) =>
        buildDirtyAgentTaskDispatch({
          task,
          attemptId: attempt.attemptId,
          commandFormatter: input.dependencies.commandFormatter,
        }),
      ),
      continuationCommand:
        input.dependencies.commandFormatter.continueProduction({
          projectId: input.projectId,
          revisionId: inspected.current.revision.revisionId,
          attemptId: attempt.attemptId,
          deliveryPolicy: input.deliveryPolicy,
        }),
      providerRequests: 0,
      currentDeliveryRequired: false,
      nextAction:
        dirty.length === 0
          ? ("start-fixed-continuation" as const)
          : ("dispatch-agent-tasks-then-start-fixed-continuation" as const),
    };
  } finally {
    await lock.release();
  }
};

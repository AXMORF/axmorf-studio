import { isAbsolute, relative } from "node:path";

import type {
  ArtifactAttestation,
  ExecutionAttemptProgress,
  ProducerPlan,
  ProducerTaskSpec,
  TaskDiagnosticSnapshot,
} from "@axmorf/studio/contracts";

import type { ProductionCommandFormatter } from "../domain/production-command-formatter";
import type { buildCurrentProductionPlan } from "./build-current-plan";
import { buildTaskDispatch } from "./task-dispatch";
import {
  createLiveProjectProductionScope,
  type ProductionScope,
} from "./production-scope";

type CurrentPlan = Awaited<ReturnType<typeof buildCurrentProductionPlan>>;

export type AttemptRecoveryErrorCode =
  | "attempt-recovery-active-attempt"
  | "attempt-recovery-artifact-drift"
  | "attempt-recovery-attempt-id-reused"
  | "attempt-recovery-identity-mismatch"
  | "attempt-recovery-not-found"
  | "attempt-recovery-not-terminal-failed"
  | "attempt-recovery-plan-not-recoverable"
  | "attempt-recovery-revision-stale"
  | "attempt-recovery-task-seed-missing"
  | "attempt-recovery-workspace-outside-authority";

export class AttemptRecoveryError extends Error {
  public readonly name = "AttemptRecoveryError";

  public constructor(
    public readonly code: AttemptRecoveryErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

type CreateWorkspace = (input: {
  readonly rootDir: string;
  readonly task: ProducerTaskSpec;
  readonly seedFiles?: Readonly<Record<string, Uint8Array | string>>;
}) => Promise<string>;

/**
 * Filesystem policy stays behind this port. Its implementation may preserve a
 * current draft or quarantine an invalid/authority-drifted draft before using
 * createWorkspace for a fresh seed. Unknown I/O failures must fail closed.
 */
export type RecoverTaskWorkspace = (input: {
  readonly rootDir: string;
  readonly failedAttemptId: string;
  readonly task: ProducerTaskSpec;
  readonly seedFiles: Readonly<Record<string, Uint8Array | string>>;
  readonly createWorkspace: CreateWorkspace;
}) => Promise<
  Readonly<{
    workspace: string;
    recovery: "preserved" | "fresh-seed";
  }>
>;

export type AttemptRecoveryDependencies = Readonly<{
  readAttempt: (input: {
    readonly rootDir: string;
    readonly storyId: string;
    readonly attemptId: string;
  }) => Promise<ExecutionAttemptProgress | null>;
  listAttempts: (input: {
    readonly rootDir: string;
    readonly storyId: string;
  }) => Promise<readonly ExecutionAttemptProgress[]>;
  buildCurrentPlan: (input: {
    readonly rootDir: string;
    readonly projectId: string;
  }) => Promise<CurrentPlan>;
  acquireLock: (input: {
    readonly rootDir: string;
    readonly ownerId: string;
  }) => Promise<Readonly<{ release: () => Promise<void> }>>;
  createWorkspace: CreateWorkspace;
  recoverWorkspace: RecoverTaskWorkspace;
  inspectArtifact: (input: {
    readonly rootDir: string;
    readonly task: ProducerTaskSpec;
  }) => Promise<ArtifactAttestation | null>;
  buildTaskSnapshots: (input: {
    readonly nodes: CurrentPlan["nodes"];
    readonly subjects: CurrentPlan["subjects"];
    readonly decisions: CurrentPlan["plan"]["tasks"];
  }) => readonly TaskDiagnosticSnapshot[];
  createAttempt: (input: {
    readonly rootDir: string;
    readonly plan: ProducerPlan;
    readonly taskSnapshots: readonly TaskDiagnosticSnapshot[];
    readonly estimatedCost: ExecutionAttemptProgress["estimatedCost"];
    readonly actualCost: ExecutionAttemptProgress["actualCost"];
    readonly state: "waiting-for-agent" | "converging";
  }) => Promise<Readonly<{ attemptId: string }>>;
  commandFormatter: ProductionCommandFormatter;
}>;

type RecoveryInput = Readonly<{
  rootDir: string;
  projectId: string;
  failedAttemptId: string;
  scope?: ProductionScope;
  dependencies: AttemptRecoveryDependencies;
}>;

const recoveryScope = (input: RecoveryInput) => {
  const scope =
    input.scope ??
    createLiveProjectProductionScope({
      rootDir: input.rootDir,
      storyId: input.projectId,
    });
  if (
    scope.repositoryRoot !== input.rootDir ||
    scope.storyId !== input.projectId
  ) {
    fail(
      "attempt-recovery-identity-mismatch",
      "Attempt recovery scope is cross-bound.",
    );
  }
  return scope;
};

function fail(code: AttemptRecoveryErrorCode, message: string): never {
  throw new AttemptRecoveryError(code, message);
}

const assertAttemptIdentity = ({
  attempt,
  projectId,
  failedAttemptId,
}: {
  readonly attempt: ExecutionAttemptProgress;
  readonly projectId: string;
  readonly failedAttemptId: string;
}) => {
  if (attempt.storyId !== projectId || attempt.attemptId !== failedAttemptId) {
    fail(
      "attempt-recovery-identity-mismatch",
      "Failed attempt identity is cross-bound.",
    );
  }
};

const assertPlanRecoverable = ({
  plan,
  label,
}: {
  readonly plan: Pick<ProducerPlan, "summary" | "tasks">;
  readonly label: "failed" | "current";
}) => {
  const unsupported = plan.tasks.find(
    ({ action }) => action !== "reuse" && action !== "dispatch-agent",
  );
  if (
    plan.summary.dirtyFixedTaskCount !== 0 ||
    plan.summary.blockedTaskCount !== 0 ||
    unsupported !== undefined
  ) {
    fail(
      "attempt-recovery-plan-not-recoverable",
      `The ${label} plan contains fixed-flow or blocked work.`,
    );
  }
};

const dirtyAgentTasks = (current: CurrentPlan) =>
  current.plan.tasks
    .filter(
      (
        task,
      ): task is typeof task & {
        taskRevision: NonNullable<typeof task.taskRevision>;
      } => task.action === "dispatch-agent" && task.taskRevision !== null,
    )
    .map((task) => {
      const seed = current.taskSeeds.get(task.taskRevision);
      if (seed === undefined) {
        fail(
          "attempt-recovery-task-seed-missing",
          "Recoverable Agent task seed is unavailable.",
        );
      }
      if (
        seed.task.storyId !== current.plan.storyId ||
        seed.task.revisionId !== current.plan.revisionId ||
        seed.task.taskRevision !== task.taskRevision ||
        seed.task.taskKind !== task.taskKind
      ) {
        fail(
          "attempt-recovery-identity-mismatch",
          "Recoverable Agent task seed is cross-bound.",
        );
      }
      if (seed.taskContractBytes === null) {
        fail(
          "attempt-recovery-task-seed-missing",
          "Recoverable Agent task execution contract is unavailable.",
        );
      }
      return {
        task: seed.task,
        contextBytes: seed.contextBytes,
        taskContractBytes: seed.taskContractBytes,
        taskKind: task.taskKind,
        subject: task.subject,
        taskRevision: task.taskRevision,
        changedInputs: task.directChanges
          .filter(({ kind }) => kind === "input")
          .map(({ id }) => id),
        blockedBy: task.blockedBy,
      } as const;
    });

const inspectRecovery = async ({
  rootDir,
  projectId,
  failedAttemptId,
  scope: suppliedScope,
  dependencies,
}: RecoveryInput) => {
  const scope = recoveryScope({
    rootDir,
    projectId,
    failedAttemptId,
    ...(suppliedScope === undefined ? {} : { scope: suppliedScope }),
    dependencies,
  });
  const failed = await dependencies.readAttempt({
    rootDir: scope.isolatedRoot,
    storyId: projectId,
    attemptId: failedAttemptId,
  });
  if (failed === null) {
    fail("attempt-recovery-not-found", "Execution attempt is missing.");
  }
  assertAttemptIdentity({ attempt: failed, projectId, failedAttemptId });
  if (failed.state !== "failed" || failed.deliveryResult.status !== "failed") {
    fail(
      "attempt-recovery-not-terminal-failed",
      "Only a terminal failed attempt can be reissued.",
    );
  }
  assertPlanRecoverable({
    plan: {
      summary: failed.taskSummary,
      tasks: failed.taskExplanations,
    },
    label: "failed",
  });

  const attempts = await dependencies.listAttempts({
    rootDir: scope.isolatedRoot,
    storyId: projectId,
  });
  for (const attempt of attempts) {
    if (attempt.storyId !== projectId) {
      fail(
        "attempt-recovery-identity-mismatch",
        "Execution attempt listing is cross-story.",
      );
    }
    if (
      attempt.attemptId !== failedAttemptId &&
      (attempt.state === "waiting-for-agent" || attempt.state === "converging")
    ) {
      fail(
        "attempt-recovery-active-attempt",
        "Another production attempt is still active.",
      );
    }
  }

  const current = await dependencies.buildCurrentPlan({ rootDir, projectId });
  if (
    current.revision.storyId !== projectId ||
    current.plan.storyId !== projectId ||
    current.plan.revisionId !== current.revision.revisionId
  ) {
    fail(
      "attempt-recovery-identity-mismatch",
      "Current production plan is cross-bound.",
    );
  }
  if (current.revision.revisionId !== failed.revisionId) {
    fail(
      "attempt-recovery-revision-stale",
      "Failed attempt revision is stale against current inputs.",
    );
  }
  assertPlanRecoverable({ plan: current.plan, label: "current" });

  const dirty = dirtyAgentTasks(current);
  for (const task of dirty) {
    const artifact = await dependencies.inspectArtifact({
      rootDir,
      task: task.task,
    });
    if (artifact !== null) {
      fail(
        "attempt-recovery-artifact-drift",
        "Current plan marks a valid Agent artifact as dirty.",
      );
    }
  }
  return { failed, current, dirty } as const;
};

export const inspectAttemptRecovery = async (input: RecoveryInput) => {
  const inspected = await inspectRecovery(input);
  return {
    status: "attempt-recovery-ready" as const,
    storyId: input.projectId,
    failedAttemptId: input.failedAttemptId,
    revisionId: inspected.current.revision.revisionId,
    reusedTaskCount: inspected.current.plan.summary.reusedTaskCount,
    dirtyAgentTasks: inspected.dirty.map(
      ({ taskKind, subject, taskRevision, changedInputs, blockedBy }) => ({
        taskKind,
        subject,
        taskRevision,
        changedInputs,
        blockedBy,
      }),
    ),
    providerRequests: 0 as const,
    currentDeliveryRequired: false as const,
    nextAction: "reissue-attempt" as const,
  };
};

const logicalWorkspacePath = ({
  rootDir,
  repositoryRootDir,
  task,
  workspace,
}: {
  readonly rootDir: string;
  readonly repositoryRootDir: string;
  readonly task: ProducerTaskSpec;
  readonly workspace: string;
}) => {
  if (!isAbsolute(workspace)) {
    fail(
      "attempt-recovery-workspace-outside-authority",
      "Recovered task workspace must be absolute.",
    );
  }
  const authorityLogical = relative(rootDir, workspace).replaceAll("\\", "/");
  const expected = `.producer-work/${task.storyId}/${task.taskRevision}`;
  if (authorityLogical !== expected) {
    fail(
      "attempt-recovery-workspace-outside-authority",
      "Recovered task workspace is outside its task authority.",
    );
  }
  const logical = relative(repositoryRootDir, workspace).replaceAll("\\", "/");
  if (
    logical === ".." ||
    logical.startsWith("../") ||
    logical.startsWith("/")
  ) {
    fail(
      "attempt-recovery-workspace-outside-authority",
      "Recovered task workspace escapes the repository.",
    );
  }
  return logical;
};

export const reissueAttempt = async (input: RecoveryInput) => {
  const scope = recoveryScope(input);
  const lock = await input.dependencies.acquireLock({
    rootDir: input.rootDir,
    ownerId: "project-production-attempt-reissue",
  });
  try {
    // Re-read every recovery authority after acquiring the mutation lock. The
    // earlier recover-inspect result is diagnostic only and is never trusted.
    const inspected = await inspectRecovery(input);
    const dirty = [];
    for (const task of inspected.dirty) {
      const seedFiles: Record<string, Uint8Array | string> = {
        "inputs/context.json": task.contextBytes,
        "inputs/task-contract.json": task.taskContractBytes,
      };
      const recovered = await input.dependencies.recoverWorkspace({
        rootDir: scope.isolatedRoot,
        failedAttemptId: input.failedAttemptId,
        task: task.task,
        seedFiles,
        createWorkspace: input.dependencies.createWorkspace,
      });
      dirty.push({
        ...task,
        workspace: logicalWorkspacePath({
          rootDir: scope.isolatedRoot,
          repositoryRootDir: scope.repositoryRoot,
          task: task.task,
          workspace: recovered.workspace,
        }),
        workspaceRecovery: recovered.recovery,
      });
    }

    const taskSnapshots = input.dependencies.buildTaskSnapshots({
      nodes: inspected.current.nodes,
      subjects: inspected.current.subjects,
      decisions: inspected.current.plan.tasks,
    });
    const attempt = await input.dependencies.createAttempt({
      rootDir: scope.isolatedRoot,
      plan: inspected.current.plan,
      taskSnapshots,
      estimatedCost: {
        ...inspected.failed.estimatedCost,
        providerRequests: 0,
        providerCacheHits: 0,
        agentTasks: dirty.length,
      },
      actualCost: {
        providerRequests: 0,
        providerCacheHits: 0,
        agentTasks: dirty.length,
        deliveryMedia: [],
      },
      state: dirty.length === 0 ? "converging" : "waiting-for-agent",
    });
    if (attempt.attemptId === input.failedAttemptId) {
      fail(
        "attempt-recovery-attempt-id-reused",
        "Reissued production must use a fresh attempt identity.",
      );
    }

    return {
      status: "project-production-reissued" as const,
      storyId: input.projectId,
      failedAttemptId: input.failedAttemptId,
      attemptId: attempt.attemptId,
      revisionId: inspected.current.revision.revisionId,
      reusedTaskCount: inspected.current.plan.summary.reusedTaskCount,
      dirtyAgentTasks: dirty.map(
        ({
          task,
          taskKind,
          subject,
          taskRevision,
          changedInputs,
          blockedBy,
          workspace,
          workspaceRecovery,
        }) => ({
          taskKind,
          subject,
          taskRevision,
          changedInputs,
          blockedBy,
          workspaceRecovery,
          ...buildTaskDispatch({
            task,
            attemptId: attempt.attemptId,
            workspace,
            ...(scope.candidateId === null
              ? {}
              : { candidateId: scope.candidateId }),
            commandFormatter: input.dependencies.commandFormatter,
          }),
        }),
      ),
      continuationCommand:
        input.dependencies.commandFormatter.continueProduction({
          projectId: input.projectId,
          revisionId: inspected.current.revision.revisionId,
          attemptId: attempt.attemptId,
          ...(scope.candidateId === null
            ? {}
            : { candidateId: scope.candidateId }),
        }),
      providerRequests: 0 as const,
      currentDeliveryRequired: false as const,
      nextAction:
        dirty.length === 0
          ? ("start-fixed-continuation" as const)
          : ("dispatch-agent-tasks-then-start-fixed-continuation" as const),
    };
  } finally {
    await lock.release();
  }
};

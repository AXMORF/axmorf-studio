import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  ExecutionAttemptProgressSchema,
  TaskDecisionExplanationSchema,
  TaskDiagnosticSnapshotSchema,
  TaskExecutionContractSchema,
  buildProducerPlan,
  buildProducerTaskSpec,
  serializeCanonicalJson,
  type ExecutionAttemptProgress,
  type TaskDiagnosticSnapshot,
} from "@axmorf/studio/contracts";

import { npmScriptProductionCommandFormatter } from "../../scripts/project-production/adapters/npm-script-production-command-formatter";
import {
  AttemptRecoveryError,
  inspectAttemptRecovery,
  reissueAttempt,
  type AttemptRecoveryDependencies,
} from "../../scripts/project-production/application/reissue-attempt";
import { createProjectRevisionProductionScope } from "../../scripts/project-production/application/production-scope";

const ROOT_DIR = "/workspace";
const FAILED_ATTEMPT_ID = "11111111-1111-4111-8111-111111111111";
const FRESH_ATTEMPT_ID = "22222222-2222-4222-8222-222222222222";
const ACTIVE_ATTEMPT_ID = "33333333-3333-4333-8333-333333333333";
const sha = (character: string) => `sha256:${character.repeat(64)}` as const;

const fixture = () => {
  const contextBytes = "{}\n";
  const taskContractBytes = `${serializeCanonicalJson(
    TaskExecutionContractSchema.parse({
      schemaVersion: 1,
      contractVersion: "agent-task-execution-contract-v1",
      taskKind: "cover-owner",
      purpose: "Author the reissue fixture Cover.",
      workflow: ["Bind and complete the fixture output."],
      immutableInputs: [
        "task.json",
        "inputs/context.json",
        "inputs/task-contract.json",
      ],
      preflight: {
        bindingRequiredBeforeWrites: true,
        immutableInputFailurePolicy: "abort-zero-write",
        repairableValidationOwner: "agent-output",
      },
      outputs: [
        {
          path: "src/Root.tsx",
          owner: "agent",
          format: "tsx",
          instructions: ["Export the fixture root."],
          derivedFields: [],
          example: "export const Root = () => null;\n",
        },
      ],
      componentSignatures: [],
      constraints: ["Remain task-local."],
    }),
  )}\n`;
  const task = buildProducerTaskSpec({
    taskKind: "cover-owner",
    storyId: "story-reissue",
    semanticId: null,
    revisionId: `revision-${"8".repeat(64)}`,
    dependencyArtifacts: [],
    inputFingerprints: [
      {
        id: "read:inputs/context.json",
        fingerprint: `sha256:${createHash("sha256")
          .update(contextBytes)
          .digest("hex")}`,
      },
      {
        id: "read:inputs/task-contract.json",
        fingerprint: `sha256:${createHash("sha256")
          .update(taskContractBytes)
          .digest("hex")}`,
      },
    ],
    declaredReadSet: ["inputs/context.json", "inputs/task-contract.json"],
    declaredOutputSet: ["src/Root.tsx"],
    validatorPolicyVersion: "cover-owner-validator-v1",
  });
  const decision = {
    taskRevision: task.taskRevision,
    baselineTaskRevision: null,
    taskKind: task.taskKind,
    subject: { kind: "project", id: task.storyId },
    action: "dispatch-agent",
    artifactState: "missing",
    directChanges: [],
    dependencyChanges: [],
    blockedBy: [],
    explanationAvailability: "baseline-unavailable",
  } as const;
  const plan = buildProducerPlan({
    storyId: task.storyId,
    revisionId: task.revisionId,
    artifactSetFingerprint: sha("9"),
    tasks: [decision],
    summary: {
      reusedTaskCount: 0,
      dirtyAgentTaskCount: 1,
      dirtyFixedTaskCount: 0,
      blockedTaskCount: 0,
    },
  });
  const snapshot: TaskDiagnosticSnapshot = {
    taskKind: task.taskKind,
    subject: decision.subject,
    taskRevision: task.taskRevision,
    inputFingerprints: [],
    validatorPolicyVersion: task.validatorPolicyVersion,
    declaredReadSet: task.declaredReadSet,
    declaredOutputSet: task.declaredOutputSet,
    dependencies: [],
    decision,
  };
  const failed = ExecutionAttemptProgressSchema.parse({
    schemaVersion: 3,
    contractVersion: "execution-attempt-progress-v3",
    attemptId: FAILED_ATTEMPT_ID,
    storyId: task.storyId,
    revisionId: task.revisionId,
    planFingerprint: plan.planFingerprint,
    artifactSetFingerprint: plan.artifactSetFingerprint,
    taskExplanations: plan.tasks,
    taskSnapshots: [snapshot],
    estimatedCost: {
      providerRequests: 1,
      providerCacheHits: 0,
      agentTasks: 1,
      deliveryMedia: null,
    },
    actualCost: {
      providerRequests: 1,
      providerCacheHits: 0,
      agentTasks: 1,
      deliveryMedia: [],
    },
    state: "failed",
    createdAt: "2026-08-30T00:00:00.000Z",
    updatedAt: "2026-08-30T00:01:00.000Z",
    dirtyTaskRevisions: [task.taskRevision],
    taskSummary: plan.summary,
    diagnosticCode: "producer-agent-task-failed",
    eventCount: 3,
    taskOutcomes: [
      {
        taskRevision: task.taskRevision,
        taskKind: task.taskKind,
        outcome: "failed",
        artifactFingerprint: null,
        diagnosticCode: "producer-agent-task-failed",
      },
    ],
    taskOutcomeSummary: {
      committedTaskCount: 0,
      currentTaskCount: 0,
      failedTaskCount: 1,
    },
    deliveryResult: {
      status: "failed",
      deliveryBuildId: null,
      diagnosticCode: "producer-agent-task-failed",
      deliveryMedia: [],
    },
  });
  const current = {
    revision: { storyId: task.storyId, revisionId: task.revisionId },
    plan,
    nodes: [],
    subjects: new Map(),
    taskSeeds: new Map([
      [task.taskRevision, { task, contextBytes, taskContractBytes }],
    ]),
  };
  return {
    contextBytes,
    taskContractBytes,
    task,
    decision,
    plan,
    snapshot,
    failed,
    current,
  };
};

const activeProgress = (
  failed: ExecutionAttemptProgress,
): ExecutionAttemptProgress =>
  ExecutionAttemptProgressSchema.parse({
    ...failed,
    attemptId: ACTIVE_ATTEMPT_ID,
    state: "waiting-for-agent",
    diagnosticCode: null,
    eventCount: 1,
    taskOutcomes: [],
    taskOutcomeSummary: {
      committedTaskCount: 0,
      currentTaskCount: 0,
      failedTaskCount: 0,
    },
    deliveryResult: {
      status: "not-verified",
      deliveryBuildId: null,
      diagnosticCode: null,
      deliveryMedia: [],
    },
  });

const dependenciesFor = (
  input: ReturnType<typeof fixture>,
  overrides: Partial<AttemptRecoveryDependencies> = {},
) => {
  const calls = {
    acquireLock: 0,
    createAttempt: 0,
    createWorkspace: 0,
    recoverWorkspace: 0,
    inspectArtifact: 0,
    release: 0,
  };
  let createAttemptInput:
    | Parameters<AttemptRecoveryDependencies["createAttempt"]>[0]
    | undefined;
  const dependencies: AttemptRecoveryDependencies = {
    readAttempt: async () => input.failed,
    listAttempts: async () => [input.failed],
    buildCurrentPlan: (async () =>
      input.current) as unknown as AttemptRecoveryDependencies["buildCurrentPlan"],
    acquireLock: async () => {
      calls.acquireLock += 1;
      return {
        release: async () => {
          calls.release += 1;
        },
      };
    },
    createWorkspace: async ({ task }) => {
      calls.createWorkspace += 1;
      return `${ROOT_DIR}/.producer-work/${task.storyId}/${task.taskRevision}`;
    },
    recoverWorkspace: async (workspaceInput) => {
      calls.recoverWorkspace += 1;
      return {
        workspace: await workspaceInput.createWorkspace({
          rootDir: workspaceInput.rootDir,
          task: workspaceInput.task,
          seedFiles: workspaceInput.seedFiles,
        }),
        recovery: "preserved",
      };
    },
    inspectArtifact: async () => {
      calls.inspectArtifact += 1;
      return null;
    },
    buildTaskSnapshots: () => input.failed.taskSnapshots,
    createAttempt: async (attemptInput) => {
      calls.createAttempt += 1;
      createAttemptInput = attemptInput;
      return { attemptId: FRESH_ATTEMPT_ID };
    },
    commandFormatter: npmScriptProductionCommandFormatter,
    ...overrides,
  };
  return {
    dependencies,
    calls,
    getCreateAttemptInput: () => createAttemptInput,
  };
};

const recoveryInput = (
  input: ReturnType<typeof fixture>,
  dependencies: AttemptRecoveryDependencies,
) => ({
  rootDir: ROOT_DIR,
  projectId: input.task.storyId,
  failedAttemptId: FAILED_ATTEMPT_ID,
  dependencies,
});

const rejectsWithCode =
  (code: AttemptRecoveryError["code"]) => (error: unknown) =>
    error instanceof AttemptRecoveryError && error.code === code;

test("recover-inspect is read-only, zero-provider, and does not require a Delivery", async () => {
  const input = fixture();
  const { dependencies, calls } = dependenciesFor(input);

  const result = await inspectAttemptRecovery(
    recoveryInput(input, dependencies),
  );

  assert.equal(result.status, "attempt-recovery-ready");
  assert.equal(result.revisionId, input.task.revisionId);
  assert.equal(result.providerRequests, 0);
  assert.equal(result.currentDeliveryRequired, false);
  assert.deepEqual(
    result.dirtyAgentTasks.map(({ taskRevision }) => taskRevision),
    [input.task.taskRevision],
  );
  assert.equal(calls.inspectArtifact, 1);
  assert.equal(calls.acquireLock, 0);
  assert.equal(calls.createWorkspace, 0);
  assert.equal(calls.recoverWorkspace, 0);
  assert.equal(calls.createAttempt, 0);
});

test("recover-inspect rejects non-terminal and competing active attempts with typed errors", async () => {
  const input = fixture();
  const active = activeProgress(input.failed);
  const nonTerminalAttempt = ExecutionAttemptProgressSchema.parse({
    ...active,
    attemptId: FAILED_ATTEMPT_ID,
  });
  const nonTerminal = dependenciesFor(input, {
    readAttempt: async () => nonTerminalAttempt,
  });
  await assert.rejects(
    inspectAttemptRecovery(recoveryInput(input, nonTerminal.dependencies)),
    rejectsWithCode("attempt-recovery-not-terminal-failed"),
  );

  const competing = dependenciesFor(input, {
    listAttempts: async () => [input.failed, active],
  });
  await assert.rejects(
    inspectAttemptRecovery(recoveryInput(input, competing.dependencies)),
    rejectsWithCode("attempt-recovery-active-attempt"),
  );
});

test("recover-inspect rejects stale revisions and fixed-flow failed plans", async () => {
  const input = fixture();
  const stale = dependenciesFor(input, {
    buildCurrentPlan: (async () => ({
      ...input.current,
      revision: {
        ...input.current.revision,
        revisionId: `revision-${"7".repeat(64)}`,
      },
      plan: {
        ...input.plan,
        revisionId: `revision-${"7".repeat(64)}`,
      },
    })) as unknown as AttemptRecoveryDependencies["buildCurrentPlan"],
  });
  await assert.rejects(
    inspectAttemptRecovery(recoveryInput(input, stale.dependencies)),
    rejectsWithCode("attempt-recovery-revision-stale"),
  );

  const fixedFailed = {
    ...input.failed,
    taskSummary: {
      ...input.failed.taskSummary,
      dirtyFixedTaskCount: 1,
    },
  } as ExecutionAttemptProgress;
  const unsupported = dependenciesFor(input, {
    readAttempt: async () => fixedFailed,
  });
  await assert.rejects(
    inspectAttemptRecovery(recoveryInput(input, unsupported.dependencies)),
    rejectsWithCode("attempt-recovery-plan-not-recoverable"),
  );
});

const withDownstreamBlocks = () => {
  const input = fixture();
  const dependency = {
    taskKind: input.task.taskKind,
    subjectId: input.task.storyId,
    taskRevision: input.task.taskRevision,
  };
  const convergence = TaskDecisionExplanationSchema.parse({
    ...input.decision,
    taskRevision: `task-${"1".repeat(64)}`,
    taskKind: "composition-convergence",
    action: "blocked",
    blockedBy: [dependency],
  });
  const delivery = TaskDecisionExplanationSchema.parse({
    ...convergence,
    taskRevision: `task-${"2".repeat(64)}`,
    taskKind: "delivery-build",
    blockedBy: [
      {
        taskKind: convergence.taskKind,
        subjectId: input.task.storyId,
        taskRevision: convergence.taskRevision,
      },
    ],
  });
  const plan = buildProducerPlan({
    ...input.plan,
    tasks: [input.decision, convergence, delivery].sort((a, b) =>
      String(a.taskRevision).localeCompare(String(b.taskRevision)),
    ),
    summary: { ...input.plan.summary, blockedTaskCount: 2 },
  });
  const failed = ExecutionAttemptProgressSchema.parse({
    ...input.failed,
    planFingerprint: plan.planFingerprint,
    taskExplanations: plan.tasks,
    taskSnapshots: plan.tasks.map((decision) =>
      TaskDiagnosticSnapshotSchema.parse({
        ...input.snapshot,
        taskKind: decision.taskKind,
        subject: decision.subject,
        taskRevision: decision.taskRevision,
        decision,
      }),
    ),
    taskSummary: plan.summary,
  });
  return { ...input, plan, failed, current: { ...input.current, plan } };
};

test("inspect and reissue allow two downstream blocks with separate revisions after an Agent failure", async () => {
  const input = withDownstreamBlocks();
  const before = JSON.stringify(input.failed);
  const { dependencies, calls } = dependenciesFor(input);
  const inspected = await inspectAttemptRecovery(
    recoveryInput(input, dependencies),
  );
  assert.equal(inspected.status, "attempt-recovery-ready");
  assert.equal(calls.createAttempt, 0);
  const reissued = await reissueAttempt(recoveryInput(input, dependencies));
  assert.equal(reissued.status, "project-production-reissued");
  assert.equal(reissued.dirtyAgentTasks.length, 1);
  assert.equal(reissued.providerRequests, 0);
  assert.equal(calls.createAttempt, 1);
  assert.equal(JSON.stringify(input.failed), before);
});

test("recovery refuses fixed, host, unknown and missing failed-task evidence even without downstream blocks", async () => {
  for (const diagnosticCode of [
    "producer-agent-fixed-failed",
    "producer-agent-host-failed",
    "producer-task-commit-failed",
    null,
  ]) {
    const input = fixture();
    const failed = ExecutionAttemptProgressSchema.parse({
      ...input.failed,
      taskOutcomes:
        diagnosticCode === null
          ? []
          : input.failed.taskOutcomes.map((outcome) => ({
              ...outcome,
              diagnosticCode,
            })),
      taskOutcomeSummary: {
        ...input.failed.taskOutcomeSummary,
        failedTaskCount: diagnosticCode === null ? 0 : 1,
      },
    });
    const { dependencies, calls } = dependenciesFor(input, {
      readAttempt: async () => failed,
    });
    await assert.rejects(
      inspectAttemptRecovery(recoveryInput(input, dependencies)),
      rejectsWithCode("attempt-recovery-plan-not-recoverable"),
    );
    assert.equal(calls.createAttempt, 0);
  }
});

test("recovery rejects unknown, cross-revision, cyclic and independent downstream blockers", async () => {
  for (const variant of [
    "unknown",
    "cross-revision",
    "cycle",
    "independent",
  ] as const) {
    const input = withDownstreamBlocks();
    const tasks = input.plan.tasks.map((task) => {
      if (task.taskKind !== "composition-convergence") return task;
      const original = task.blockedBy[0]!;
      const blockedBy =
        variant === "independent"
          ? [
              {
                taskKind: "scene-template",
                subjectId: "independent",
                taskRevision: `task-${"3".repeat(64)}`,
              },
            ]
          : [
              {
                ...original,
                ...(variant === "unknown" ? { subjectId: "other-story" } : {}),
                ...(variant === "cross-revision"
                  ? { taskRevision: `task-${"a".repeat(64)}` }
                  : {}),
                ...(variant === "cycle"
                  ? {
                      taskKind: "delivery-build",
                      taskRevision: `task-${"2".repeat(64)}`,
                    }
                  : {}),
              },
            ];
      return TaskDecisionExplanationSchema.parse({ ...task, blockedBy });
    });
    if (variant === "independent")
      tasks.push(
        TaskDecisionExplanationSchema.parse({
          ...input.decision,
          taskKind: "scene-template",
          taskRevision: `task-${"3".repeat(64)}`,
          subject: { kind: "meaning", id: "independent" },
          action: "reuse",
          artifactState: "valid",
        }),
      );
    const plan = buildProducerPlan({
      ...input.plan,
      tasks: tasks.sort((a, b) =>
        String(a.taskRevision).localeCompare(String(b.taskRevision)),
      ),
      summary: {
        ...input.plan.summary,
        reusedTaskCount: variant === "independent" ? 1 : 0,
      },
    });
    const failed = ExecutionAttemptProgressSchema.parse({
      ...input.failed,
      planFingerprint: plan.planFingerprint,
      taskSummary: plan.summary,
      taskExplanations: plan.tasks,
      taskSnapshots: plan.tasks.map((decision) =>
        TaskDiagnosticSnapshotSchema.parse({
          ...input.snapshot,
          taskKind: decision.taskKind,
          subject: decision.subject,
          taskRevision: decision.taskRevision,
          decision,
        }),
      ),
    });
    const { dependencies, calls } = dependenciesFor(input, {
      readAttempt: async () => failed,
    });
    await assert.rejects(
      inspectAttemptRecovery(recoveryInput(input, dependencies)),
      rejectsWithCode("attempt-recovery-plan-not-recoverable"),
    );
    assert.equal(calls.createAttempt, 0);
  }
});

test("reissue rechecks under lock, preserves the old attempt, and creates zero-provider commands", async () => {
  const input = fixture();
  const failedBefore = JSON.stringify(input.failed);
  const { dependencies, calls, getCreateAttemptInput } = dependenciesFor(input);

  const result = await reissueAttempt(recoveryInput(input, dependencies));

  assert.equal(calls.acquireLock, 1);
  assert.equal(calls.release, 1);
  assert.equal(calls.inspectArtifact, 1);
  assert.equal(calls.recoverWorkspace, 1);
  assert.equal(calls.createWorkspace, 1);
  assert.equal(calls.createAttempt, 1);
  assert.equal(JSON.stringify(input.failed), failedBefore);
  assert.equal(result.status, "project-production-reissued");
  assert.equal(result.failedAttemptId, FAILED_ATTEMPT_ID);
  assert.equal(result.attemptId, FRESH_ATTEMPT_ID);
  assert.equal(result.providerRequests, 0);
  assert.equal(result.currentDeliveryRequired, false);
  assert.equal(result.dirtyAgentTasks[0]?.workspaceRecovery, "preserved");
  assert.match(
    result.dirtyAgentTasks[0]?.bindCommands.controllerIo ?? "",
    /project:task:bind/u,
  );
  assert.match(result.continuationCommand, /project:produce:continue/u);
  assert.deepEqual(getCreateAttemptInput()?.actualCost, {
    providerRequests: 0,
    providerCacheHits: 0,
    agentTasks: 1,
    deliveryMedia: [],
  });
  assert.equal(getCreateAttemptInput()?.estimatedCost.providerRequests, 0);
  assert.equal(getCreateAttemptInput()?.state, "waiting-for-agent");
});

test("reissue reports safe fresh seeding and releases its lock on artifact drift", async () => {
  const input = fixture();
  const fresh = dependenciesFor(input, {
    recoverWorkspace: async ({ task }) => ({
      workspace: `${ROOT_DIR}/.producer-work/${task.storyId}/${task.taskRevision}`,
      recovery: "fresh-seed",
    }),
  });
  const result = await reissueAttempt(recoveryInput(input, fresh.dependencies));
  assert.equal(result.dirtyAgentTasks[0]?.workspaceRecovery, "fresh-seed");

  const drift = dependenciesFor(input, {
    inspectArtifact: async () => ({}) as never,
  });
  await assert.rejects(
    reissueAttempt(recoveryInput(input, drift.dependencies)),
    rejectsWithCode("attempt-recovery-artifact-drift"),
  );
  assert.equal(drift.calls.recoverWorkspace, 0);
  assert.equal(drift.calls.createAttempt, 0);
  assert.equal(drift.calls.release, 1);
});

test("candidate reissue isolates attempts and work while retaining shared plan, artifact, and lock authority", async () => {
  const input = fixture();
  const scope = createProjectRevisionProductionScope({
    rootDir: ROOT_DIR,
    storyId: input.task.storyId,
    candidateId: `revision-candidate-${"a".repeat(64)}`,
  });
  const roots = {
    attempts: [] as string[],
    plans: [] as string[],
    artifacts: [] as string[],
    locks: [] as string[],
    workspaces: [] as string[],
  };
  const { dependencies } = dependenciesFor(input, {
    readAttempt: async ({ rootDir }) => {
      roots.attempts.push(rootDir);
      return input.failed;
    },
    listAttempts: async ({ rootDir }) => {
      roots.attempts.push(rootDir);
      return [input.failed];
    },
    buildCurrentPlan: (async ({ rootDir }: { rootDir: string }) => {
      roots.plans.push(rootDir);
      return input.current;
    }) as unknown as AttemptRecoveryDependencies["buildCurrentPlan"],
    acquireLock: async ({ rootDir }) => {
      roots.locks.push(rootDir);
      return { release: async () => undefined };
    },
    inspectArtifact: async ({ rootDir }) => {
      roots.artifacts.push(rootDir);
      return null;
    },
    recoverWorkspace: async ({ rootDir, task }) => {
      roots.workspaces.push(rootDir);
      return {
        workspace: `${scope.isolatedRoot}/.producer-work/${task.storyId}/${task.taskRevision}`,
        recovery: "preserved",
      };
    },
    createAttempt: async ({ rootDir }) => {
      roots.attempts.push(rootDir);
      return { attemptId: FRESH_ATTEMPT_ID };
    },
  });

  const result = await reissueAttempt({
    ...recoveryInput(input, dependencies),
    scope,
  });

  assert.deepEqual(new Set(roots.attempts), new Set([scope.isolatedRoot]));
  assert.deepEqual(new Set(roots.plans), new Set([scope.repositoryRoot]));
  assert.deepEqual(new Set(roots.artifacts), new Set([scope.repositoryRoot]));
  assert.deepEqual(new Set(roots.locks), new Set([scope.repositoryRoot]));
  assert.deepEqual(new Set(roots.workspaces), new Set([scope.isolatedRoot]));
  assert.match(
    result.dirtyAgentTasks[0]?.workspace ?? "",
    new RegExp(`^\\.producer-revisions/.+/${scope.candidateId}/scope/`, "u"),
  );
  assert.match(
    result.dirtyAgentTasks[0]?.bindCommands.sharedWorkspace ?? "",
    new RegExp(`--candidate ${scope.candidateId}`, "u"),
  );
  assert.match(
    result.continuationCommand,
    new RegExp(`--candidate ${scope.candidateId}`, "u"),
  );
});

test("candidate reissue rejects a workspace recovered from another candidate", async () => {
  const input = fixture();
  const candidateA = createProjectRevisionProductionScope({
    rootDir: ROOT_DIR,
    storyId: input.task.storyId,
    candidateId: `revision-candidate-${"a".repeat(64)}`,
  });
  const candidateB = createProjectRevisionProductionScope({
    rootDir: ROOT_DIR,
    storyId: input.task.storyId,
    candidateId: `revision-candidate-${"b".repeat(64)}`,
  });
  const { dependencies, calls } = dependenciesFor(input, {
    recoverWorkspace: async ({ task }) => ({
      workspace: `${candidateB.isolatedRoot}/.producer-work/${task.storyId}/${task.taskRevision}`,
      recovery: "preserved",
    }),
  });

  await assert.rejects(
    reissueAttempt({
      ...recoveryInput(input, dependencies),
      scope: candidateA,
    }),
    rejectsWithCode("attempt-recovery-workspace-outside-authority"),
  );
  assert.equal(calls.createAttempt, 0);
  assert.equal(calls.release, 1);
});

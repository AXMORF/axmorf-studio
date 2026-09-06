import { resolveProcessTimeout } from "../../scripts/shared/process-deadline";
import assert from "node:assert/strict";
import test from "node:test";

import { continueProjectProduction } from "../../scripts/project-production/application/continue-production";
import { ExecutionAttemptEventWaitTimeoutError } from "../../scripts/project-production/adapters/attempt-event-wait";
import {
  buildDurationBudget,
  type ExecutionAttemptProgress,
} from "@axmorf/studio/contracts";

const durationBudget = buildDurationBudget({
  targetDurationSeconds: 30,
  fps: 30,
  boundaryFrames: 300,
  actualDurationInFrames: 1045,
});
import { createProjectRevisionProductionScope } from "../../scripts/project-production/application/production-scope";

const revisionId = `revision-${"1".repeat(64)}`;
const deliveryBuildId = `delivery-${"2".repeat(64)}`;
const baseRevisionId = `revision-${"3".repeat(64)}`;
const baseDeliveryBuildId = `delivery-${"4".repeat(64)}`;
const attemptId = "00000000-0000-4000-8000-000000000001";
const taskRevision = (character: string) => `task-${character.repeat(64)}`;
const fixedCreatedAt = "2026-08-21T00:00:00.000Z";

const progress = ({
  outcomes = [],
  state = "waiting-for-agent",
  includeFixed = false,
  createdAt = new Date().toISOString(),
}: {
  readonly outcomes?: readonly {
    readonly taskRevision: string;
    readonly outcome: "artifact-committed" | "artifact-current" | "failed";
  }[];
  readonly state?: "waiting-for-agent" | "converging" | "succeeded" | "failed";
  readonly includeFixed?: boolean;
  readonly createdAt?: string;
}): ExecutionAttemptProgress =>
  ({
    storyId: "story-example",
    revisionId,
    attemptId,
    createdAt,
    state,
    taskSnapshots: [
      {
        taskRevision: taskRevision("2"),
        decision: { action: "dispatch-agent" },
      },
      ...(includeFixed
        ? [
            {
              taskRevision: taskRevision("3"),
              decision: { action: "run-fixed" },
            },
          ]
        : []),
    ],
    taskOutcomes: outcomes.map((outcome) => ({
      ...outcome,
      taskKind: "scene-owner",
      artifactFingerprint:
        outcome.outcome === "failed" ? null : `sha256:${"4".repeat(64)}`,
      diagnosticCode:
        outcome.outcome === "failed" ? "producer-agent-task-failed" : null,
    })),
  }) as unknown as ExecutionAttemptProgress;

const resolvedWait = () => ({
  ready: Promise.resolve(),
  changed: Promise.resolve(),
  close: () => undefined,
});

const claimContinuation = async () => ({
  schemaVersion: 1 as const,
  claimId: "00000000-0000-4000-8000-000000000002",
  attemptId,
  storyId: "story-example",
  revisionId,
});

test("fixed continuation crosses the event subscription barrier before rereading progress", async () => {
  let releaseReady: (() => void) | undefined;
  const ready = new Promise<void>((resolve) => {
    releaseReady = resolve;
  });
  let markWaitOpened: (() => void) | undefined;
  const waitOpened = new Promise<void>((resolve) => {
    markWaitOpened = resolve;
  });
  let readCalls = 0;
  let current = progress({});
  const running = continueProjectProduction(
    {
      rootDir: "/fixture",
      projectId: "story-example",
      revisionId,
      attemptId,
    },
    {
      claimContinuation,
      openEventWait: () => {
        markWaitOpened?.();
        return {
          ready,
          changed: Promise.resolve(),
          close: () => undefined,
        };
      },
      readProgress: async () => {
        readCalls += 1;
        return current;
      },
      converge: async () => {
        current = progress({ state: "succeeded" });
        return { status: "project-production-current" } as never;
      },
    },
  );

  await waitOpened;
  assert.equal(readCalls, 1);
  current = progress({
    outcomes: [
      { taskRevision: taskRevision("2"), outcome: "artifact-current" },
    ],
  });
  releaseReady?.();
  await running;
  assert.equal(readCalls, 3);
});

test("fixed continuation converges exactly once after every dispatched Agent task succeeds", async () => {
  let current = progress({
    outcomes: [
      { taskRevision: taskRevision("2"), outcome: "artifact-committed" },
      { taskRevision: taskRevision("3"), outcome: "failed" },
    ],
    includeFixed: true,
  });
  let convergeCalls = 0;
  const result = await continueProjectProduction(
    {
      rootDir: "/fixture",
      projectId: "story-example",
      revisionId,
      attemptId,
    },
    {
      claimContinuation,
      openEventWait: resolvedWait,
      readProgress: async () => current,
      converge: async () => {
        convergeCalls += 1;
        current = progress({ state: "succeeded" });
        return { status: "project-production-complete" } as never;
      },
    },
  );
  assert.equal(convergeCalls, 1);
  assert.deepEqual(result, { status: "project-production-complete" });
});

test("fixed continuation terminalizes one Agent failure and never converges", async () => {
  let current = progress({
    outcomes: [{ taskRevision: taskRevision("2"), outcome: "failed" }],
  });
  let convergeCalls = 0;
  let failureCalls = 0;
  await assert.rejects(
    continueProjectProduction(
      {
        rootDir: "/fixture",
        projectId: "story-example",
        revisionId,
        attemptId,
      },
      {
        claimContinuation,
        openEventWait: resolvedWait,
        readProgress: async () => current,
        appendTerminalFailure: async (input) => {
          failureCalls += 1;
          assert.equal(input.attemptId, attemptId);
          assert.equal(
            input.result.diagnosticCode,
            "producer-agent-task-failed",
          );
          current = progress({ state: "failed" });
          return current;
        },
        converge: async () => {
          convergeCalls += 1;
          throw new Error("unreachable");
        },
      },
    ),
    /Agent task failed/u,
  );
  assert.equal(failureCalls, 1);
  assert.equal(convergeCalls, 0);
});

test("fixed continuation propagates convergence failure without retry", async () => {
  let convergeCalls = 0;
  await assert.rejects(
    continueProjectProduction(
      {
        rootDir: "/fixture",
        projectId: "story-example",
        revisionId,
        attemptId,
      },
      {
        claimContinuation,
        openEventWait: resolvedWait,
        readProgress: async () =>
          progress({
            outcomes: [
              { taskRevision: taskRevision("2"), outcome: "artifact-current" },
            ],
          }),
        converge: async () => {
          convergeCalls += 1;
          throw new Error("fixed convergence failed");
        },
      },
    ),
    /fixed convergence failed/u,
  );
  assert.equal(convergeCalls, 1);
});

test("fixed continuation converges immediately when prepare dispatched no Agent tasks", async () => {
  let current = {
    ...progress({ state: "converging" }),
    taskSnapshots: [],
  } as ExecutionAttemptProgress;
  let convergeCalls = 0;
  await continueProjectProduction(
    {
      rootDir: "/fixture",
      projectId: "story-example",
      revisionId,
      attemptId,
    },
    {
      claimContinuation,
      openEventWait: resolvedWait,
      readProgress: async () => current,
      converge: async () => {
        convergeCalls += 1;
        current = {
          ...current,
          state: "succeeded",
        } as ExecutionAttemptProgress;
        return { status: "project-production-current" } as never;
      },
    },
  );
  assert.equal(convergeCalls, 1);
});

test("overlapping fixed continuations allow only one convergence claimant", async () => {
  let claimed = false;
  let releaseConvergence: (() => void) | undefined;
  let markConvergenceStarted: (() => void) | undefined;
  const convergenceStarted = new Promise<void>((resolve) => {
    markConvergenceStarted = resolve;
  });
  const convergenceGate = new Promise<void>((resolve) => {
    releaseConvergence = resolve;
  });
  let current = progress({
    outcomes: [
      { taskRevision: taskRevision("2"), outcome: "artifact-current" },
    ],
  });
  let convergeCalls = 0;
  const dependencies = {
    claimContinuation: async () => {
      if (claimed) {
        throw new Error("Execution attempt continuation is already claimed.");
      }
      claimed = true;
      return claimContinuation();
    },
    openEventWait: resolvedWait,
    readProgress: async () => current,
    converge: async () => {
      convergeCalls += 1;
      markConvergenceStarted?.();
      await convergenceGate;
      current = progress({ state: "succeeded" });
      return { status: "project-production-complete" } as never;
    },
  };
  const input = {
    rootDir: "/fixture",
    projectId: "story-example",
    revisionId,
    attemptId,
  } as const;

  const first = continueProjectProduction(input, dependencies);
  await convergenceStarted;
  await assert.rejects(
    continueProjectProduction(input, dependencies),
    /continuation is already claimed/u,
  );
  releaseConvergence?.();
  await first;
  assert.equal(convergeCalls, 1);
});

test("fixed continuation terminalizes the one-hour attempt deadline", async () => {
  let current = progress({});
  let failureCalls = 0;
  await assert.rejects(
    continueProjectProduction(
      {
        rootDir: "/fixture",
        projectId: "story-example",
        revisionId,
        attemptId,
        timeoutMs: 60 * 60 * 1_000,
      },
      {
        claimContinuation,
        now: () => Date.parse(fixedCreatedAt) + 60 * 60 * 1_000,
        openEventWait: ({ timeoutMs }) => {
          assert.equal(timeoutMs, 1);
          return {
            ready: Promise.resolve(),
            changed: Promise.reject(
              new ExecutionAttemptEventWaitTimeoutError(),
            ),
            close: () => undefined,
          };
        },
        readProgress: async () => ({ ...current, createdAt: fixedCreatedAt }),
        appendTerminalFailure: async (input) => {
          failureCalls += 1;
          assert.equal(
            input.result.diagnosticCode,
            "producer-continuation-timeout",
          );
          current = progress({ state: "failed" });
          return current;
        },
        converge: async () => {
          throw new Error("unreachable");
        },
      },
    ),
    /exceeded its fixed deadline/u,
  );
  assert.equal(failureCalls, 1);
});

test("fixed continuation subtracts elapsed attempt time from the wait budget", async () => {
  let observedTimeout = 0;
  const current = progress({ createdAt: fixedCreatedAt });
  await assert.rejects(
    continueProjectProduction(
      {
        rootDir: "/fixture",
        projectId: "story-example",
        revisionId,
        attemptId,
      },
      {
        claimContinuation,
        now: () => Date.parse(fixedCreatedAt) + 30 * 60 * 1_000,
        openEventWait: ({ timeoutMs }) => {
          observedTimeout = timeoutMs;
          return {
            ready: Promise.resolve(),
            changed: Promise.reject(
              new ExecutionAttemptEventWaitTimeoutError(),
            ),
            close: () => undefined,
          };
        },
        readProgress: async () => current,
        appendTerminalFailure: async () => current,
      },
    ),
    /exceeded its fixed deadline/u,
  );
  assert.equal(observedTimeout, 30 * 60 * 1_000);
});

test("fixed continuation refuses to start convergence after the task deadline", async () => {
  let failureCalls = 0;
  let convergeCalls = 0;
  const current = progress({
    createdAt: fixedCreatedAt,
    outcomes: [
      { taskRevision: taskRevision("2"), outcome: "artifact-current" },
    ],
  });
  await assert.rejects(
    continueProjectProduction(
      {
        rootDir: "/fixture",
        projectId: "story-example",
        revisionId,
        attemptId,
      },
      {
        claimContinuation,
        now: () => Date.parse(fixedCreatedAt) + 60 * 60 * 1_000,
        openEventWait: resolvedWait,
        readProgress: async () => current,
        appendTerminalFailure: async () => {
          failureCalls += 1;
          return current;
        },
        converge: async () => {
          convergeCalls += 1;
          throw new Error("unreachable");
        },
      },
    ),
    /exceeded its fixed deadline/u,
  );
  assert.equal(failureCalls, 1);
  assert.equal(convergeCalls, 0);
});

test("candidate continuation keeps attempt events isolated and converges through the repository runtime", async () => {
  const scope = createProjectRevisionProductionScope({
    rootDir: "/fixture",
    storyId: "story-example",
    candidateId: `revision-candidate-${"a".repeat(64)}`,
  });
  let current = progress({
    outcomes: [
      { taskRevision: taskRevision("2"), outcome: "artifact-current" },
    ],
  });
  const progressRoots: string[] = [];
  const waitRoots: string[] = [];
  const claimRoots: string[] = [];
  const promotionInputs: unknown[] = [];
  const result = await continueProjectProduction(
    {
      rootDir: "/fixture",
      projectId: "story-example",
      revisionId,
      attemptId,
      scope,
    },
    {
      readProgress: async ({ rootDir }) => {
        progressRoots.push(rootDir);
        return current;
      },
      openEventWait: ({ rootDir }) => {
        waitRoots.push(rootDir);
        return resolvedWait();
      },
      claimContinuation: async ({ rootDir }) => {
        claimRoots.push(rootDir);
        return claimContinuation();
      },
      inspectCandidateRecord: async () =>
        ({
          candidateId: scope.candidateId,
          input: {
            storyId: "story-example",
            baseRevisionId,
            baseDeliveryBuildId,
          },
        }) as never,
      converge: async (input) => {
        assert.equal(input.rootDir, "/fixture");
        assert.equal(input.scope, scope);
        current = progress({ state: "succeeded" });
        return {
          status: "project-production-complete",
          revisionId,
          delivery: { deliveryBuildId },
          durationBudget,
        } as never;
      },
      promoteCandidate: async (input) => {
        assert.equal(current.state, "succeeded");
        promotionInputs.push(input);
        return { status: "project-revision-promoted" } as never;
      },
    },
  );

  assert.deepEqual(result, {
    schemaVersion: 1,
    contractVersion: "project-revision-continuation-v1",
    durationBudget,
    status: "project-revision-complete",
    storyId: "story-example",
    candidateId: scope.candidateId,
    base: { revisionId: baseRevisionId, deliveryBuildId: baseDeliveryBuildId },
    expected: { revisionId, deliveryBuildId },
    production: {
      status: "project-production-complete",
      attemptId,
      state: "succeeded",
      deliveryStatus: "verified",
      revisionId,
      deliveryBuildId,
    },
    promotion: { status: "project-revision-promoted" },
  });
  assert.deepEqual(promotionInputs, [
    {
      rootDir: "/fixture",
      storyId: "story-example",
      candidateId: scope.candidateId,
      expectedRevisionId: revisionId,
      expectedDeliveryBuildId: deliveryBuildId,
    },
  ]);
  assert.deepEqual(new Set(progressRoots), new Set([scope.isolatedRoot]));
  assert.deepEqual(waitRoots, [scope.isolatedRoot]);
  assert.deepEqual(claimRoots, [scope.isolatedRoot]);
});

test("candidate promotion failure preserves succeeded production and returns a safe exact retry", async () => {
  const scope = createProjectRevisionProductionScope({
    rootDir: "/fixture",
    storyId: "story-example",
    candidateId: `revision-candidate-${"b".repeat(64)}`,
  });
  let current = progress({
    outcomes: [
      { taskRevision: taskRevision("2"), outcome: "artifact-current" },
    ],
  });
  let terminalFailureCalls = 0;
  const result = await continueProjectProduction(
    {
      rootDir: "/fixture",
      projectId: "story-example",
      revisionId,
      attemptId,
      scope,
    },
    {
      readProgress: async () => current,
      openEventWait: resolvedWait,
      claimContinuation,
      inspectCandidateRecord: async () =>
        ({
          candidateId: scope.candidateId,
          input: {
            storyId: "story-example",
            baseRevisionId,
            baseDeliveryBuildId,
          },
        }) as never,
      converge: async () => {
        current = progress({ state: "succeeded" });
        return {
          status: "project-production-current",
          revisionId,
          delivery: { deliveryBuildId },
          durationBudget,
        } as never;
      },
      appendTerminalFailure: async () => {
        terminalFailureCalls += 1;
        return current;
      },
      promoteCandidate: async () => {
        throw new Error(
          "Bearer secret-token at https://private.invalid/internal stack",
        );
      },
    },
  );

  assert.equal(current.state, "succeeded");
  assert.equal(terminalFailureCalls, 0);
  assert.deepEqual(result, {
    schemaVersion: 1,
    contractVersion: "project-revision-continuation-v1",
    durationBudget,
    status: "project-revision-promotion-pending",
    storyId: "story-example",
    candidateId: scope.candidateId,
    base: { revisionId: baseRevisionId, deliveryBuildId: baseDeliveryBuildId },
    expected: { revisionId, deliveryBuildId },
    production: {
      status: "project-production-current",
      attemptId,
      state: "succeeded",
      deliveryStatus: "verified",
      revisionId,
      deliveryBuildId,
    },
    promotion: {
      status: "project-revision-promotion-failed",
      failure: {
        code: "project-revision-promotion-failed",
        message:
          "Candidate production succeeded, but promotion did not complete.",
      },
    },
    retryCommand: `npm run project:revision:promote -- --project story-example --candidate ${scope.candidateId} --revision ${revisionId} --delivery ${deliveryBuildId}`,
  });
});

test("fixed continuation passes the remaining absolute attempt deadline into media convergence", async () => {
  const createdAt = new Date(Date.now() - 59 * 60_000).toISOString();
  let current = progress({
    createdAt,
    outcomes: [
      { taskRevision: taskRevision("2"), outcome: "artifact-current" },
    ],
  });
  let observed = 0;
  await continueProjectProduction(
    { rootDir: "/fixture", projectId: "story-example", revisionId, attemptId },
    {
      claimContinuation,
      openEventWait: resolvedWait,
      readProgress: async () => current,
      converge: async () => {
        observed = resolveProcessTimeout();
        current = progress({ state: "succeeded" });
        return { status: "project-production-current" } as never;
      },
    },
  );
  assert.ok(observed > 0 && observed <= 60_000);
  assert.equal(
    resolveProcessTimeout(),
    15 * 60_000,
    "deadline scope must not leak to another production",
  );
});

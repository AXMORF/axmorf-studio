import assert from "node:assert/strict";
import test from "node:test";

import { continueProjectProduction } from "../../scripts/project-production/application/continue-production";
import { ExecutionAttemptEventWaitTimeoutError } from "../../scripts/project-production/adapters/attempt-event-wait";
import type { ExecutionAttemptProgress } from "../../src/contracts";

const revisionId = `revision-${"1".repeat(64)}`;
const attemptId = "00000000-0000-4000-8000-000000000001";
const taskRevision = (character: string) => `task-${character.repeat(64)}`;

const progress = ({
  outcomes = [],
  state = "waiting-for-agent",
  includeFixed = false,
}: {
  readonly outcomes?: readonly {
    readonly taskRevision: string;
    readonly outcome: "artifact-committed" | "artifact-current" | "failed";
  }[];
  readonly state?: "waiting-for-agent" | "converging" | "succeeded" | "failed";
  readonly includeFixed?: boolean;
}): ExecutionAttemptProgress =>
  ({
    storyId: "story-example",
    revisionId,
    attemptId,
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

test("fixed continuation terminalizes a bounded wait timeout", async () => {
  let current = progress({});
  let failureCalls = 0;
  await assert.rejects(
    continueProjectProduction(
      {
        rootDir: "/fixture",
        projectId: "story-example",
        revisionId,
        attemptId,
        timeoutMs: 1,
      },
      {
        claimContinuation,
        openEventWait: () => ({
          changed: Promise.reject(new ExecutionAttemptEventWaitTimeoutError()),
          close: () => undefined,
        }),
        readProgress: async () => current,
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
    /continuation timed out/u,
  );
  assert.equal(failureCalls, 1);
});

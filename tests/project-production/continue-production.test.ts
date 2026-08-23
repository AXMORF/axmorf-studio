import assert from "node:assert/strict";
import test from "node:test";

import { continueProjectProduction } from "../../scripts/project-production/application/continue-production";
import {
  createRepositoryProductionLocations,
  createRuntimeExecutionResources,
} from "../../scripts/project-production/application/production-locations";
import { ExecutionAttemptEventWaitTimeoutError } from "../../scripts/project-production/adapters/attempt-event-wait";
import {
  buildProducerConfig,
  type ExecutionAttemptProgress,
} from "../../src/contracts";
import { validProjectCreateProducerConfig } from "../fixtures/project-create";

const revisionId = `revision-${"1".repeat(64)}`;
const attemptId = "00000000-0000-4000-8000-000000000001";
const taskRevision = (character: string) => `task-${character.repeat(64)}`;
const fixedCreatedAt = "2026-08-21T00:00:00.000Z";
const repositoryLocations = createRepositoryProductionLocations({
  repositoryRoot: "/fixture",
});
const config = buildProducerConfig(validProjectCreateProducerConfig);

const continueInput = (
  overrides: Readonly<{
    timeoutMs?: number;
    deliveryPolicy?: "manual" | "automatic";
    runtime?: ReturnType<typeof createRuntimeExecutionResources>;
  }> = {},
) => ({
  projectId: "story-example",
  revisionId,
  attemptId,
  locations: repositoryLocations,
  deliveryPolicy: "manual" as const,
  config,
  ...overrides,
});

const progress = ({
  outcomes = [],
  state = "waiting-for-agent",
  includeFixed = false,
  createdAt = new Date().toISOString(),
}: {
  readonly outcomes?: readonly {
    readonly taskRevision: string;
    readonly outcome: "artifact-committed" | "artifact-current" | "failed";
    readonly diagnosticCode?:
      | "producer-agent-task-failed"
      | "producer-agent-host-failed"
      | "producer-task-commit-failed";
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
        outcome.outcome === "failed"
          ? (outcome.diagnosticCode ?? "producer-agent-task-failed")
          : null,
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

test("fixed continuation converges exactly once after every dispatched Agent task succeeds", async () => {
  let current = progress({
    outcomes: [
      { taskRevision: taskRevision("2"), outcome: "artifact-committed" },
      { taskRevision: taskRevision("3"), outcome: "failed" },
    ],
    includeFixed: true,
  });
  let convergeCalls = 0;
  const result = await continueProjectProduction(continueInput(), {
    claimContinuation,
    openEventWait: resolvedWait,
    readProgress: async () => current,
    converge: async () => {
      convergeCalls += 1;
      current = progress({ state: "succeeded" });
      return { status: "project-production-source-current" } as never;
    },
  });
  assert.equal(convergeCalls, 1);
  assert.deepEqual(result, { status: "project-production-source-current" });
});

test("fixed continuation forwards automatic delivery only with an explicit runtime fingerprint", async () => {
  const runtimeFingerprint = `sha256:${"5".repeat(64)}`;
  const runtime = createRuntimeExecutionResources({
    rendererRuntimeFingerprint: runtimeFingerprint,
    browserExecutable: "/fixture/bin/browser",
    binariesDirectory: "/fixture/bin",
    ffmpegExecutable: "/fixture/bin/ffmpeg",
    ffprobeExecutable: "/fixture/bin/ffprobe",
  });
  let current = progress({
    outcomes: [
      { taskRevision: taskRevision("2"), outcome: "artifact-current" },
    ],
  });
  await continueProjectProduction(
    continueInput({
      deliveryPolicy: "automatic",
      runtime,
    }),
    {
      claimContinuation,
      openEventWait: resolvedWait,
      readProgress: async () => current,
      converge: async (input) => {
        assert.equal(input.locations, repositoryLocations);
        assert.equal(input.config, config);
        assert.equal(input.deliveryPolicy, "automatic");
        assert.equal(
          input.runtime?.rendererRuntimeFingerprint,
          runtimeFingerprint,
        );
        current = progress({ state: "succeeded" });
        return { status: "project-production-complete" } as never;
      },
    },
  );
});

test("fixed continuation terminalizes one Agent failure and never converges", async () => {
  let current = progress({
    outcomes: [{ taskRevision: taskRevision("2"), outcome: "failed" }],
  });
  let convergeCalls = 0;
  let failureCalls = 0;
  await assert.rejects(
    continueProjectProduction(continueInput(), {
      claimContinuation,
      openEventWait: resolvedWait,
      readProgress: async () => current,
      appendTerminalFailure: async (input) => {
        failureCalls += 1;
        assert.equal(input.attemptId, attemptId);
        assert.equal(input.result.diagnosticCode, "producer-agent-task-failed");
        current = progress({ state: "failed" });
        return current;
      },
      converge: async () => {
        convergeCalls += 1;
        throw new Error("unreachable");
      },
    }),
    /Agent task failed/u,
  );
  assert.equal(failureCalls, 1);
  assert.equal(convergeCalls, 0);
});

for (const diagnosticCode of [
  "producer-agent-host-failed",
  "producer-task-commit-failed",
] as const) {
  test(`fixed continuation preserves ${diagnosticCode}`, async () => {
    let current = progress({
      outcomes: [
        {
          taskRevision: taskRevision("2"),
          outcome: "failed",
          diagnosticCode,
        },
      ],
    });
    await assert.rejects(
      continueProjectProduction(continueInput(), {
        claimContinuation,
        openEventWait: resolvedWait,
        readProgress: async () => current,
        appendTerminalFailure: async (input) => {
          assert.equal(input.result.diagnosticCode, diagnosticCode);
          current = progress({ state: "failed" });
          return current;
        },
        converge: async () => {
          throw new Error("unreachable");
        },
      }),
      /Agent task failed/u,
    );
  });
}

test("fixed continuation propagates convergence failure without retry", async () => {
  let convergeCalls = 0;
  await assert.rejects(
    continueProjectProduction(continueInput(), {
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
    }),
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
  await continueProjectProduction(continueInput(), {
    claimContinuation,
    openEventWait: resolvedWait,
    readProgress: async () => current,
    converge: async () => {
      convergeCalls += 1;
      current = {
        ...current,
        state: "succeeded",
      } as ExecutionAttemptProgress;
      return { status: "project-production-source-current" } as never;
    },
  });
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
      return { status: "project-production-source-current" } as never;
    },
  };
  const input = continueInput();

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
    continueProjectProduction(continueInput({ timeoutMs: 60 * 60 * 1_000 }), {
      claimContinuation,
      now: () => Date.parse(fixedCreatedAt) + 60 * 60 * 1_000,
      openEventWait: ({ timeoutMs }) => {
        assert.equal(timeoutMs, 1);
        return {
          ready: Promise.resolve(),
          changed: Promise.reject(new ExecutionAttemptEventWaitTimeoutError()),
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
    }),
    /exceeded its fixed deadline/u,
  );
  assert.equal(failureCalls, 1);
});

test("fixed continuation subtracts elapsed attempt time from the wait budget", async () => {
  let observedTimeout = 0;
  const current = progress({ createdAt: fixedCreatedAt });
  await assert.rejects(
    continueProjectProduction(continueInput(), {
      claimContinuation,
      now: () => Date.parse(fixedCreatedAt) + 30 * 60 * 1_000,
      openEventWait: ({ timeoutMs }) => {
        observedTimeout = timeoutMs;
        return {
          ready: Promise.resolve(),
          changed: Promise.reject(new ExecutionAttemptEventWaitTimeoutError()),
          close: () => undefined,
        };
      },
      readProgress: async () => current,
      appendTerminalFailure: async () => current,
      converge: async () => {
        throw new Error("unreachable");
      },
    }),
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
    continueProjectProduction(continueInput(), {
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
    }),
    /exceeded its fixed deadline/u,
  );
  assert.equal(failureCalls, 1);
  assert.equal(convergeCalls, 0);
});

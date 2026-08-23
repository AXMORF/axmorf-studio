import type { ExecutionAttemptProgress } from "../../../src/contracts";
import type { DeliveryPolicy, ProducerConfig } from "../../../src/contracts";
import {
  appendExecutionAttemptTerminalResult,
  claimExecutionAttemptContinuation,
  readExecutionAttemptProgress,
} from "../adapters/attempt-store";
import {
  ExecutionAttemptEventWaitTimeoutError,
  openExecutionAttemptEventWait,
} from "../adapters/attempt-event-wait";
import type { ProductionConvergencePort } from "./converge-artifacts";
import type { ProductionLocations } from "./production-locations";
import type { RuntimeExecutionResources } from "./production-locations";

export const DEFAULT_EXECUTION_ATTEMPT_DEADLINE_MS = 60 * 60 * 1_000;

type ContinueProductionDependencies = Readonly<{
  converge: ProductionConvergencePort;
  readProgress?: typeof readExecutionAttemptProgress;
  openEventWait?: (input: {
    readonly locations: ProductionLocations;
    readonly storyId: string;
    readonly attemptId: string;
    readonly timeoutMs: number;
  }) => ReturnType<typeof openExecutionAttemptEventWait>;
  claimContinuation?: (input: {
    readonly locations: ProductionLocations;
    readonly storyId: string;
    readonly revisionId: string;
    readonly attemptId: string;
  }) => Promise<unknown>;
  appendTerminalFailure?: typeof appendExecutionAttemptTerminalResult;
  now?: () => number;
}>;

const agentTaskRevisions = (progress: ExecutionAttemptProgress) =>
  new Set(
    progress.taskSnapshots
      .filter(({ decision }) => decision.action === "dispatch-agent")
      .map(({ taskRevision }) => taskRevision),
  );

const assertAttemptIdentity = ({
  progress,
  storyId,
  revisionId,
  attemptId,
}: {
  readonly progress: ExecutionAttemptProgress;
  readonly storyId: string;
  readonly revisionId: string;
  readonly attemptId: string;
}) => {
  if (
    progress.storyId !== storyId ||
    progress.revisionId !== revisionId ||
    progress.attemptId !== attemptId
  ) {
    throw new Error("Execution continuation identity is stale.");
  }
};

export const continueProjectProduction = async (
  {
    projectId,
    revisionId,
    attemptId,
    locations,
    deliveryPolicy,
    config,
    runtime,
    timeoutMs = DEFAULT_EXECUTION_ATTEMPT_DEADLINE_MS,
  }: {
    readonly projectId: string;
    readonly revisionId: string;
    readonly attemptId: string;
    readonly locations: ProductionLocations;
    readonly deliveryPolicy: DeliveryPolicy;
    readonly config: ProducerConfig;
    readonly runtime?: RuntimeExecutionResources;
    readonly timeoutMs?: number;
  },
  dependencies: ContinueProductionDependencies,
) => {
  const readProgress =
    dependencies.readProgress ?? readExecutionAttemptProgress;
  const openEventWait =
    dependencies.openEventWait ?? openExecutionAttemptEventWait;
  const claimContinuation =
    dependencies.claimContinuation ?? claimExecutionAttemptContinuation;
  const appendTerminalFailure =
    dependencies.appendTerminalFailure ?? appendExecutionAttemptTerminalResult;
  const converge = dependencies.converge;
  const now = dependencies.now ?? Date.now;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error("Execution attempt deadline is invalid.");
  }

  const initial = await readProgress({
    locations,
    storyId: projectId,
    attemptId,
  });
  if (initial === null) throw new Error("Execution attempt is missing.");
  assertAttemptIdentity({
    progress: initial,
    storyId: projectId,
    revisionId,
    attemptId,
  });
  const attemptCreatedAt = Date.parse(initial.createdAt);
  if (!Number.isFinite(attemptCreatedAt)) {
    throw new Error("Execution attempt createdAt is invalid.");
  }
  const deadline = attemptCreatedAt + timeoutMs;

  await claimContinuation({
    locations,
    storyId: projectId,
    revisionId,
    attemptId,
  });

  const failForDeadline = async (cause?: unknown): Promise<never> => {
    await appendTerminalFailure({
      locations,
      storyId: projectId,
      revisionId,
      attemptId,
      result: {
        status: "failed",
        sourceCurrentId: null,
        deliveryBuildId: null,
        diagnosticCode: "producer-continuation-timeout",
        deliveryMedia: [],
      },
    });
    throw new Error("Execution attempt exceeded its fixed deadline.", {
      ...(cause === undefined ? {} : { cause }),
    });
  };

  const handleProgress = async (progress: ExecutionAttemptProgress) => {
    assertAttemptIdentity({
      progress,
      storyId: projectId,
      revisionId,
      attemptId,
    });
    if (progress.state === "succeeded" || progress.state === "failed") {
      throw new Error(`Execution attempt already ${progress.state}.`);
    }

    const expected = agentTaskRevisions(progress);
    const outcomes = new Map(
      progress.taskOutcomes.map((outcome) => [outcome.taskRevision, outcome]),
    );
    const failedTaskRevision = [...expected].find(
      (taskRevision) => outcomes.get(taskRevision)?.outcome === "failed",
    );
    if (failedTaskRevision !== undefined) {
      const failedOutcome = outcomes.get(failedTaskRevision);
      if (
        failedOutcome?.outcome !== "failed" ||
        failedOutcome.diagnosticCode === null
      ) {
        throw new Error("Agent task failure diagnostic is missing.");
      }
      await appendTerminalFailure({
        locations,
        storyId: projectId,
        revisionId,
        attemptId,
        result: {
          status: "failed",
          sourceCurrentId: null,
          deliveryBuildId: null,
          diagnosticCode: failedOutcome.diagnosticCode,
          deliveryMedia: [],
        },
      });
      throw new Error(`Agent task failed: ${failedTaskRevision}`);
    }

    const allSucceeded = [...expected].every((taskRevision) => {
      const outcome = outcomes.get(taskRevision)?.outcome;
      return outcome === "artifact-committed" || outcome === "artifact-current";
    });
    if (!allSucceeded) return { done: false as const };
    if (now() >= deadline) await failForDeadline();

    const result = await converge({
      projectId,
      revisionId,
      attemptId,
      locations,
      deliveryPolicy,
      config,
      ...(runtime === undefined ? {} : { runtime }),
    });
    const terminal = await readProgress({
      locations,
      storyId: projectId,
      attemptId,
    });
    if (terminal?.state !== "succeeded") {
      throw new Error("Fixed production convergence did not succeed.");
    }
    return { done: true as const, result };
  };

  for (;;) {
    // Subscribe before reading so an outcome committed during the read cannot
    // be missed. The fixed process blocks here; no Agent polling is involved.
    const eventWait = openEventWait({
      locations,
      storyId: projectId,
      attemptId,
      timeoutMs: Math.max(1, deadline - now()),
    });
    try {
      await eventWait.ready;
      const progress = await readProgress({
        locations,
        storyId: projectId,
        attemptId,
      });
      if (progress === null) throw new Error("Execution attempt is missing.");
      const handled = await handleProgress(progress);
      if (handled.done) return handled.result;

      try {
        await eventWait.changed;
      } catch (error) {
        if (!(error instanceof ExecutionAttemptEventWaitTimeoutError)) {
          throw error;
        }
        const latest = await readProgress({
          locations,
          storyId: projectId,
          attemptId,
        });
        if (latest === null) throw new Error("Execution attempt is missing.");
        const final = await handleProgress(latest);
        if (final.done) return final.result;
        await failForDeadline(error);
      }
    } finally {
      eventWait.close();
    }
  }
};

import type { ExecutionAttemptProgress } from "../../../src/contracts";
import {
  appendExecutionAttemptDeliveryResult,
  claimExecutionAttemptContinuation,
  readExecutionAttemptProgress,
} from "../adapters/attempt-store";
import {
  ExecutionAttemptEventWaitTimeoutError,
  openExecutionAttemptEventWait,
  type ExecutionAttemptEventWait,
} from "../adapters/attempt-event-wait";
import { convergeProjectProduction } from "./converge-artifacts";

export const DEFAULT_EXECUTION_CONTINUATION_TIMEOUT_MS = 6 * 60 * 60 * 1_000;

type ContinueProductionDependencies = Readonly<{
  readProgress?: typeof readExecutionAttemptProgress;
  openEventWait?: (input: {
    readonly rootDir: string;
    readonly storyId: string;
    readonly attemptId: string;
    readonly timeoutMs: number;
  }) => ExecutionAttemptEventWait;
  claimContinuation?: (input: {
    readonly rootDir: string;
    readonly storyId: string;
    readonly revisionId: string;
    readonly attemptId: string;
  }) => Promise<unknown>;
  appendTerminalFailure?: typeof appendExecutionAttemptDeliveryResult;
  converge?: typeof convergeProjectProduction;
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
    rootDir,
    projectId,
    revisionId,
    attemptId,
    timeoutMs = DEFAULT_EXECUTION_CONTINUATION_TIMEOUT_MS,
  }: {
    readonly rootDir: string;
    readonly projectId: string;
    readonly revisionId: string;
    readonly attemptId: string;
    readonly timeoutMs?: number;
  },
  dependencies: ContinueProductionDependencies = {},
) => {
  const readProgress =
    dependencies.readProgress ?? readExecutionAttemptProgress;
  const openEventWait =
    dependencies.openEventWait ?? openExecutionAttemptEventWait;
  const claimContinuation =
    dependencies.claimContinuation ?? claimExecutionAttemptContinuation;
  const appendTerminalFailure =
    dependencies.appendTerminalFailure ?? appendExecutionAttemptDeliveryResult;
  const converge = dependencies.converge ?? convergeProjectProduction;
  const now = dependencies.now ?? Date.now;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error("Execution continuation timeout is invalid.");
  }

  await claimContinuation({
    rootDir,
    storyId: projectId,
    revisionId,
    attemptId,
  });
  const deadline = now() + timeoutMs;

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
    const failed = [...expected].find(
      (taskRevision) => outcomes.get(taskRevision)?.outcome === "failed",
    );
    if (failed !== undefined) {
      await appendTerminalFailure({
        rootDir,
        storyId: projectId,
        revisionId,
        attemptId,
        result: {
          status: "failed",
          deliveryBuildId: null,
          diagnosticCode: "producer-agent-task-failed",
          deliveryMedia: [],
        },
      });
      throw new Error(`Agent task failed: ${failed}`);
    }

    const allSucceeded = [...expected].every((taskRevision) => {
      const outcome = outcomes.get(taskRevision)?.outcome;
      return outcome === "artifact-committed" || outcome === "artifact-current";
    });
    if (!allSucceeded) return { done: false as const };

    const result = await converge({
      rootDir,
      projectId,
      revisionId,
      attemptId,
    });
    const terminal = await readProgress({
      rootDir,
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
      rootDir,
      storyId: projectId,
      attemptId,
      timeoutMs: Math.max(1, deadline - now()),
    });
    try {
      const progress = await readProgress({
        rootDir,
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
          rootDir,
          storyId: projectId,
          attemptId,
        });
        if (latest === null) throw new Error("Execution attempt is missing.");
        const final = await handleProgress(latest);
        if (final.done) return final.result;
        await appendTerminalFailure({
          rootDir,
          storyId: projectId,
          revisionId,
          attemptId,
          result: {
            status: "failed",
            deliveryBuildId: null,
            diagnosticCode: "producer-continuation-timeout",
            deliveryMedia: [],
          },
        });
        throw new Error("Fixed production continuation timed out.", {
          cause: error,
        });
      }
    } finally {
      eventWait.close();
    }
  }
};

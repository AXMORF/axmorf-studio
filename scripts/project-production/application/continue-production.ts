import { withProcessDiagnosticScope } from "../../../packages/studio/src/process/process-ownership";
import { withProcessDeadline } from "../../shared/process-deadline";
import {
  PROJECT_REVISION_CONTINUATION_VERSION,
  ProjectRevisionContinuationResultSchema,
  buildProjectRevisionPromotionRetryCommand,
  type ExecutionAttemptProgress,
} from "@axmorf/studio/contracts";
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
import type { RuntimePolicyManifest } from "../../../packages/studio/src/runtime/policy-manifest";
import {
  createLiveProjectProductionScope,
  type ProductionScope,
} from "./production-scope";
import { inspectProjectRevisionCandidateDefinition } from "../../projects/application/project-revision-candidate-store";
import { promoteProjectRevisionCandidate } from "../../projects/application/project-revision-promotion";

export const DEFAULT_EXECUTION_ATTEMPT_DEADLINE_MS = 60 * 60 * 1_000;

export type ContinueProductionDependencies = Readonly<{
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
  inspectCandidateRecord?: typeof inspectProjectRevisionCandidateDefinition;
  promoteCandidate?: typeof promoteProjectRevisionCandidate;
  now?: () => number;
}>;

const PROMOTION_FAILURE_MESSAGE =
  "Candidate production succeeded, but promotion did not complete.";

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
    runtimePolicyManifest,
    scope: suppliedScope,
    timeoutMs = DEFAULT_EXECUTION_ATTEMPT_DEADLINE_MS,
  }: {
    readonly rootDir: string;
    readonly projectId: string;
    readonly revisionId: string;
    readonly attemptId: string;
    readonly runtimePolicyManifest?: RuntimePolicyManifest;
    readonly scope?: ProductionScope;
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
  const inspectCandidateRecord =
    dependencies.inspectCandidateRecord ??
    inspectProjectRevisionCandidateDefinition;
  const promoteCandidate =
    dependencies.promoteCandidate ?? promoteProjectRevisionCandidate;
  const now = dependencies.now ?? Date.now;
  const scope =
    suppliedScope ??
    createLiveProjectProductionScope({ rootDir, storyId: projectId });
  if (scope.repositoryRoot !== rootDir || scope.storyId !== projectId) {
    throw new Error("Execution continuation scope is cross-bound.");
  }
  const executionRoot = scope.isolatedRoot;
  const candidateRecord =
    scope.kind === "project-revision-candidate"
      ? await inspectCandidateRecord({ scope })
      : null;
  if (
    candidateRecord !== null &&
    (candidateRecord.candidateId !== scope.candidateId ||
      candidateRecord.input.storyId !== projectId)
  ) {
    throw new Error("Execution continuation candidate is cross-bound.");
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error("Execution attempt deadline is invalid.");
  }

  const initial = await readProgress({
    rootDir: executionRoot,
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
    rootDir: executionRoot,
    storyId: projectId,
    revisionId,
    attemptId,
  });

  const failForDeadline = async (cause?: unknown): Promise<never> => {
    await appendTerminalFailure({
      rootDir: executionRoot,
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
    const failed = [...expected].find(
      (taskRevision) => outcomes.get(taskRevision)?.outcome === "failed",
    );
    if (failed !== undefined) {
      await appendTerminalFailure({
        rootDir: executionRoot,
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
    if (now() >= deadline) await failForDeadline();

    const result = await withProcessDiagnosticScope(
      { rootDir: scope.isolatedRoot, storyId: projectId, attemptId },
      () =>
        withProcessDeadline(deadline, () =>
          converge({
            rootDir,
            projectId,
            revisionId,
            attemptId,
            runtimePolicyManifest,
            scope,
          }),
        ),
    );
    const terminal = await readProgress({
      rootDir: executionRoot,
      storyId: projectId,
      attemptId,
    });
    if (terminal?.state !== "succeeded") {
      throw new Error("Fixed production convergence did not succeed.");
    }
    if (scope.kind === "live-project") {
      return { done: true as const, result };
    }
    if (candidateRecord === null) {
      throw new Error("Execution continuation candidate record is missing.");
    }
    if (
      (result.status !== "project-production-complete" &&
        result.status !== "project-production-current") ||
      result.revisionId !== revisionId
    ) {
      throw new Error("Candidate production result is not promotable.");
    }
    const expectedDeliveryBuildId = result.delivery.deliveryBuildId;
    const continuation = {
      schemaVersion: 1,
      contractVersion: PROJECT_REVISION_CONTINUATION_VERSION,
      durationBudget: result.durationBudget,
      storyId: projectId,
      candidateId: scope.candidateId,
      base: {
        revisionId: candidateRecord.input.baseRevisionId,
        deliveryBuildId: candidateRecord.input.baseDeliveryBuildId,
      },
      expected: {
        revisionId: result.revisionId,
        deliveryBuildId: expectedDeliveryBuildId,
      },
      production: {
        status: result.status,
        attemptId,
        state: "succeeded",
        deliveryStatus: "verified",
        revisionId: result.revisionId,
        deliveryBuildId: expectedDeliveryBuildId,
      },
    } as const;
    try {
      const promotion = await promoteCandidate({
        rootDir,
        storyId: projectId,
        candidateId: scope.candidateId,
        expectedRevisionId: result.revisionId,
        expectedDeliveryBuildId,
        ...(runtimePolicyManifest === undefined
          ? {}
          : { runtimePolicyManifest }),
      });
      return {
        done: true as const,
        result: ProjectRevisionContinuationResultSchema.parse({
          ...continuation,
          status: "project-revision-complete",
          promotion: { status: promotion.status },
        }),
      };
    } catch {
      return {
        done: true as const,
        result: ProjectRevisionContinuationResultSchema.parse({
          ...continuation,
          status: "project-revision-promotion-pending",
          promotion: {
            status: "project-revision-promotion-failed",
            failure: {
              code: "project-revision-promotion-failed",
              message: PROMOTION_FAILURE_MESSAGE,
            },
          },
          retryCommand: buildProjectRevisionPromotionRetryCommand({
            storyId: projectId,
            candidateId: scope.candidateId,
            expectedRevisionId: result.revisionId,
            expectedDeliveryBuildId,
          }),
        }),
      };
    }
  };

  for (;;) {
    // Subscribe before reading so an outcome committed during the read cannot
    // be missed. The fixed process blocks here; no Agent polling is involved.
    const eventWait = openEventWait({
      rootDir: executionRoot,
      storyId: projectId,
      attemptId,
      timeoutMs: Math.max(1, deadline - now()),
    });
    try {
      await eventWait.ready;
      const progress = await readProgress({
        rootDir: executionRoot,
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
          rootDir: executionRoot,
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

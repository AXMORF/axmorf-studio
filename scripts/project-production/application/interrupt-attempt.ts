import { join } from "node:path";
import {
  inspectOwnedProcesses,
  inspectProcessOwnership,
} from "../../../packages/studio/src/process/process-ownership";
import {
  acquireInterruptedRepositoryOperationLock,
  acquireRepositoryOperationLock,
  inspectRepositoryOperationLock,
} from "../../shared/repository-operation-lock";
import {
  appendExecutionAttemptDeliveryResult,
  readExecutionAttemptContinuationClaim,
  readExecutionAttemptProgress,
} from "../adapters/attempt-store";
import {
  createLiveProjectProductionScope,
  type ProductionScope,
} from "./production-scope";

type InterruptionInput = Readonly<{
  rootDir: string;
  projectId: string;
  attemptId: string;
  scope?: ProductionScope;
}>;
export type InterruptionDependencies = Readonly<{
  readProgress?: typeof readExecutionAttemptProgress;
  readClaim?: typeof readExecutionAttemptContinuationClaim;
  inspectOwner?: typeof inspectProcessOwnership;
  inspectChildren?: typeof inspectOwnedProcesses;
  inspectLock?: typeof inspectRepositoryOperationLock;
  acquireLock?: typeof acquireRepositoryOperationLock;
  acquireInterruptedLock?: typeof acquireInterruptedRepositoryOperationLock;
  appendFailure?: typeof appendExecutionAttemptDeliveryResult;
}>;

export class AttemptInterruptionError extends Error {
  readonly code = "attempt-interruption-blocked";
}
const inspect = async (
  input: InterruptionInput,
  dependencies: InterruptionDependencies,
) => {
  const scope =
    input.scope ??
    createLiveProjectProductionScope({
      rootDir: input.rootDir,
      storyId: input.projectId,
    });
  if (
    scope.repositoryRoot !== input.rootDir ||
    scope.storyId !== input.projectId
  )
    throw new AttemptInterruptionError(
      "Attempt interruption scope is cross-bound.",
    );
  const binding = {
    rootDir: scope.isolatedRoot,
    storyId: input.projectId,
    attemptId: input.attemptId,
  };
  const progress = await (
    dependencies.readProgress ?? readExecutionAttemptProgress
  )(binding);
  if (
    progress === null ||
    progress.storyId !== input.projectId ||
    progress.attemptId !== input.attemptId
  )
    throw new AttemptInterruptionError(
      "Execution attempt is missing or cross-bound.",
    );
  if (progress.state === "failed" || progress.state === "succeeded")
    throw new AttemptInterruptionError(
      "A terminal attempt is immutable; use recover-inspect for a failed attempt.",
    );
  const expected = progress.taskSnapshots.filter(
    ({ decision }) => decision.action === "dispatch-agent",
  );
  if (
    expected.some(
      ({ taskRevision }) =>
        !progress.taskOutcomes.some(
          (outcome) => outcome.taskRevision === taskRevision,
        ),
    )
  ) {
    throw new AttemptInterruptionError(
      "Agent tasks are not all terminal; their executor liveness cannot be proven.",
    );
  }
  let claim;
  try {
    claim = await (
      dependencies.readClaim ?? readExecutionAttemptContinuationClaim
    )(binding);
  } catch (cause) {
    throw new AttemptInterruptionError(
      "Continuation has no verifiable process owner; missing, legacy, or invalid claims require operator investigation.",
      { cause },
    );
  }
  if (
    claim.storyId !== progress.storyId ||
    claim.attemptId !== progress.attemptId ||
    claim.revisionId !== progress.revisionId
  )
    throw new AttemptInterruptionError(
      "Continuation claim identity is cross-bound.",
    );
  if (
    (dependencies.inspectOwner ?? inspectProcessOwnership)(claim.process) !==
    "exited"
  )
    throw new AttemptInterruptionError(
      "Continuation process is active or its liveness is unknown.",
    );
  if (
    (await (dependencies.inspectChildren ?? inspectOwnedProcesses)({
      rootDir: scope.isolatedRoot,
      owner: claim.process,
      diagnosticRoot: join(
        scope.isolatedRoot,
        ".producer-attempts",
        input.projectId,
        input.attemptId,
      ),
    })) !== "exited"
  )
    throw new AttemptInterruptionError(
      "A production subprocess is active or its liveness is unknown.",
    );
  let lock;
  try {
    lock = await (dependencies.inspectLock ?? inspectRepositoryOperationLock)({
      rootDir: input.rootDir,
    });
  } catch (cause) {
    throw new AttemptInterruptionError(
      cause instanceof Error
        ? cause.message
        : "Repository operation lock ownership is unknown.",
      { cause },
    );
  }
  if (
    lock !== null &&
    (lock.state !== "exited" ||
      lock.ownerId !== "project-production-convergence" ||
      lock.process.instanceId !== claim.process.instanceId ||
      lock.process.pid !== claim.process.pid ||
      lock.process.hostname !== claim.process.hostname)
  ) {
    throw new AttemptInterruptionError(
      "Repository operation lock does not belong to the interrupted continuation.",
    );
  }
  return { scope, binding, progress, claim, lock };
};

export const inspectAttemptInterruption = async (
  input: InterruptionInput,
  dependencies: InterruptionDependencies = {},
) => {
  const inspected = await inspect(input, dependencies);
  return {
    status: "attempt-interruption-ready" as const,
    storyId: input.projectId,
    attemptId: input.attemptId,
    revisionId: inspected.progress.revisionId,
    claimId: inspected.claim.claimId,
    staleLock: inspected.lock !== null,
    providerRequests: 0 as const,
    nextAction: "interrupt-attempt" as const,
  };
};

export const interruptAttempt = async (
  input: InterruptionInput,
  dependencies: InterruptionDependencies = {},
) => {
  const inspected = await inspect(input, dependencies);
  const lock =
    inspected.lock === null
      ? await (dependencies.acquireLock ?? acquireRepositoryOperationLock)({
          rootDir: input.rootDir,
          ownerId: "project-attempt-interrupt",
        })
      : await (
          dependencies.acquireInterruptedLock ??
          acquireInterruptedRepositoryOperationLock
        )({
          rootDir: input.rootDir,
          expectedToken: inspected.lock.token,
          expectedProcessInstanceId: inspected.claim.process.instanceId,
          archivePath: join(
            inspected.scope.isolatedRoot,
            ".producer-attempts",
            input.projectId,
            input.attemptId,
            "interrupted-operation-lock.json",
          ),
        });
  try {
    // Re-read immutable claim, task terminals and subprocess proofs while the
    // repository mutation lock is held. The previous inspect is diagnostic.
    await inspect(input, { ...dependencies, inspectLock: async () => null });
    const result = await (
      dependencies.appendFailure ?? appendExecutionAttemptDeliveryResult
    )({
      ...inspected.binding,
      revisionId: inspected.progress.revisionId,
      result: {
        status: "failed",
        deliveryBuildId: null,
        diagnosticCode: "producer-continuation-interrupted",
        deliveryMedia: [],
      },
    });
    return {
      status: "attempt-interrupted" as const,
      storyId: input.projectId,
      attemptId: input.attemptId,
      revisionId: result.revisionId,
      providerRequests: 0 as const,
      nextAction: "recover-inspect" as const,
    };
  } finally {
    await lock.release();
  }
};

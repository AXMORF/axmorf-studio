import { buildTaskWorkerBindingId } from "@axmorf/studio/contracts";
import { readExecutionAttemptProgress } from "../adapters/attempt-store";

export const selectTaskAssignment = <
  Snapshot extends {
    readonly taskRevision: string;
    readonly decision: {
      readonly action: string;
      readonly taskRevision: string | null;
    };
  },
>(
  snapshots: readonly Snapshot[],
  assignment: number,
) => {
  if (!Number.isSafeInteger(assignment) || assignment <= 0)
    throw new Error("Task assignment must be a positive integer.");
  const tasks = snapshots.filter(
    ({ decision }) =>
      decision.action === "dispatch-agent" && decision.taskRevision !== null,
  );
  const selected = tasks[assignment - 1];
  if (selected === undefined)
    throw new Error("Task assignment is out of range.");
  return selected;
};

export const resolveTaskAssignment = async ({
  rootDir,
  storyId,
  attemptId,
  assignment,
}: {
  readonly rootDir: string;
  readonly storyId: string;
  readonly attemptId: string;
  readonly assignment: number;
}) => {
  const progress = await readExecutionAttemptProgress({
    rootDir,
    storyId,
    attemptId,
  });
  if (progress === null) throw new Error("Execution attempt was not found.");
  const selected = selectTaskAssignment(progress.taskSnapshots, assignment);
  const taskRevision = selected.decision.taskRevision!;
  return {
    taskRevision,
    attemptId,
    bindingId: buildTaskWorkerBindingId({ taskRevision, attemptId }),
  } as const;
};

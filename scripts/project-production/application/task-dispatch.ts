import {
  buildTaskWorkerBindingId,
  type ProducerTaskSpec,
} from "@axmorf/studio/contracts";
import { npmScriptProductionCommandFormatter } from "../adapters/npm-script-production-command-formatter";
import type { ProductionCommandFormatter } from "../domain/production-command-formatter";

export const buildTaskDispatch = ({
  task,
  attemptId,
  workspace,
  candidateId,
  commandFormatter = npmScriptProductionCommandFormatter,
}: {
  readonly task: ProducerTaskSpec;
  readonly attemptId: string;
  readonly workspace: string;
  readonly candidateId?: string;
  readonly commandFormatter?: ProductionCommandFormatter;
}) => {
  const bindingId = buildTaskWorkerBindingId({
    taskRevision: task.taskRevision,
    attemptId,
  });
  const commandInput = {
    taskRevision: task.taskRevision,
    attemptId,
    bindingId,
    ...(candidateId === undefined
      ? {}
      : { projectId: task.storyId, candidateId }),
  } as const;
  return {
    bindingId,
    workspace,
    bindCommands: {
      sharedWorkspace: commandFormatter.bindTask({
        ...commandInput,
        transport: "shared-workspace",
      }),
      controllerIo: commandFormatter.bindTask({
        ...commandInput,
        transport: "controller-io",
      }),
    },
    describeCommand: commandFormatter.describeTask(commandInput),
    finalizeCommand: commandFormatter.finalizeTask(commandInput),
    checkCommand: commandFormatter.checkTask(commandInput),
    commitCommand: commandFormatter.commitTask(commandInput),
    taskFailureCommand: commandFormatter.failTask({
      ...commandInput,
      kind: "task",
    }),
    fixedFailureCommand: commandFormatter.failTask({
      ...commandInput,
      kind: "fixed",
    }),
    spawnFailureCommand: commandFormatter.failTask({
      ...commandInput,
      kind: "host",
    }),
  } as const;
};

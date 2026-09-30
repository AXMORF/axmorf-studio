import {
  buildTaskWorkerBindingId,
  type ProducerTaskSpec,
} from "@axmorf/studio/contracts";
import { npmScriptProductionCommandFormatter } from "../adapters/npm-script-production-command-formatter";
import type { ProductionCommandFormatter } from "../domain/production-command-formatter";
import { buildTaskWorkerPrompt } from "./task-worker-prompt";

export const buildTaskDispatch = ({
  task,
  repositoryRootDir,
  attemptId,
  workspace,
  candidateId,
  assignment,
  commandFormatter = npmScriptProductionCommandFormatter,
}: {
  readonly task: ProducerTaskSpec;
  readonly repositoryRootDir: string;
  readonly attemptId: string;
  readonly workspace: string;
  readonly candidateId?: string;
  readonly assignment?: number;
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
    ...(assignment === undefined
      ? {}
      : { projectId: task.storyId, assignment }),
  } as const;
  const bindCommands = {
    sharedWorkspace: commandFormatter.bindTask({
      ...commandInput,
      transport: "shared-workspace",
    }),
    controllerIo: commandFormatter.bindTask({
      ...commandInput,
      transport: "controller-io",
    }),
  };
  return {
    bindingId,
    workspace,
    bindCommands,
    workerPrompts: {
      sharedWorkspace: buildTaskWorkerPrompt({
        repositoryRootDir,
        taskKind: task.taskKind,
        bindCommand: bindCommands.sharedWorkspace,
        transport: "shared-workspace",
      }),
      controllerIo: buildTaskWorkerPrompt({
        repositoryRootDir,
        taskKind: task.taskKind,
        bindCommand: bindCommands.controllerIo,
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

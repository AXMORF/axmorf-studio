import { lstat, readFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";

import {
  ProducerLogicalPathSchema,
  TaskWorkerBindingIdSchema,
  TaskWorkerBindingSchema,
  TaskWorkerFileWriteInputSchema,
  TaskWorkerTransportSchema,
  buildTaskWorkerBindingId,
  type TaskWorkerTransport,
} from "../../../src/contracts";
import { writeBinaryFileAtomic } from "../../shared/atomic-file";
import { assertExecutionAttemptTaskAuthority } from "../adapters/attempt-store";
import { readTaskWorkspace } from "../adapters/task-workspace";
import type { ProductionCommandFormatter } from "../domain/production-command-formatter";
import type { ProductionLocations } from "./production-locations";
import { readAgentTaskExecutionContract } from "./finalize-agent-task";

export class TaskWorkerBindingError extends Error {
  readonly code = "task-worker-binding-invalid" as const;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

const workspaceRoot = (locations: ProductionLocations) =>
  locations.layoutKind === "workspace"
    ? dirname(dirname(locations.taskWorkspaceRoot))
    : dirname(locations.taskWorkspaceRoot);

export const assertTaskWorkerBindingIdentity = ({
  taskRevision,
  attemptId,
  bindingId,
}: {
  readonly taskRevision: string;
  readonly attemptId: string;
  readonly bindingId: string;
}) => {
  const expected = buildTaskWorkerBindingId({ taskRevision, attemptId });
  const parsed = TaskWorkerBindingIdSchema.parse(bindingId);
  if (parsed !== expected) {
    throw new TaskWorkerBindingError("Task worker binding identity is stale.");
  }
  return { taskRevision, attemptId, bindingId: parsed } as const;
};

export const assertTaskWorkerBinding = async ({
  locations,
  taskRevision,
  attemptId,
  bindingId,
}: {
  readonly locations: ProductionLocations;
  readonly taskRevision: string;
  readonly attemptId: string;
  readonly bindingId: string;
}) => {
  const parsed = assertTaskWorkerBindingIdentity({
    taskRevision,
    attemptId,
    bindingId,
  });
  try {
    const current = await readTaskWorkspace({ locations, taskRevision });
    await assertExecutionAttemptTaskAuthority({
      locations,
      attemptId,
      task: current.task,
    });
    await readAgentTaskExecutionContract({ locations, taskRevision });
    return { ...current, ...parsed } as const;
  } catch (error) {
    if (error instanceof TaskWorkerBindingError) throw error;
    throw new TaskWorkerBindingError(
      error instanceof Error
        ? error.message
        : "Task worker binding preflight failed.",
      { cause: error },
    );
  }
};

export const bindTaskWorker = async ({
  locations,
  taskRevision,
  attemptId,
  bindingId,
  transport: rawTransport,
  commandFormatter,
}: {
  readonly locations: ProductionLocations;
  readonly taskRevision: string;
  readonly attemptId: string;
  readonly bindingId: string;
  readonly transport: TaskWorkerTransport;
  readonly commandFormatter: ProductionCommandFormatter;
}) => {
  const transport = TaskWorkerTransportSchema.parse(rawTransport);
  const bound = await assertTaskWorkerBinding({
    locations,
    taskRevision,
    attemptId,
    bindingId,
  });
  if (
    bound.task.taskKind !== "scene-owner" &&
    bound.task.taskKind !== "global-visual-owner" &&
    bound.task.taskKind !== "cover-owner"
  ) {
    throw new TaskWorkerBindingError(
      "Task does not admit an external Agent worker.",
    );
  }
  const root = workspaceRoot(locations);
  const logicalWorkspace = relative(root, bound.workspace).split(sep).join("/");
  if (
    logicalWorkspace.startsWith("../") ||
    logicalWorkspace === ".." ||
    logicalWorkspace.startsWith("/")
  ) {
    throw new TaskWorkerBindingError("Task worker workspace escaped its root.");
  }
  const commandInput = { taskRevision, attemptId, bindingId } as const;
  return TaskWorkerBindingSchema.parse({
    schemaVersion: 1,
    contractVersion: "task-worker-binding-v1",
    status: "task-worker-bound",
    bindingId,
    transport,
    storyId: bound.task.storyId,
    revisionId: bound.task.revisionId,
    taskRevision,
    attemptId,
    taskKind: bound.task.taskKind,
    workspace: {
      relativePath: logicalWorkspace,
      directFilesystemAccess: transport === "shared-workspace",
    },
    immutableInputs: bound.task.declaredReadSet,
    declaredOutputs: bound.task.declaredOutputSet,
    writeAllowed: true,
    commands: {
      describe: commandFormatter.describeTask(commandInput),
      finalize: commandFormatter.finalizeTask(commandInput),
      check: commandFormatter.checkTask(commandInput),
      commit: commandFormatter.commitTask(commandInput),
      taskFailure: commandFormatter.failTask({
        ...commandInput,
        kind: "task",
      }),
      fixedFailure: commandFormatter.failTask({
        ...commandInput,
        kind: "fixed",
      }),
      fileRead: commandFormatter.readTaskFile(commandInput),
      fileWrite: commandFormatter.writeTaskFile(commandInput),
    },
  });
};

const resolveBoundFile = async ({
  locations,
  taskRevision,
  attemptId,
  bindingId,
  logicalPath: rawLogicalPath,
  access,
}: {
  readonly locations: ProductionLocations;
  readonly taskRevision: string;
  readonly attemptId: string;
  readonly bindingId: string;
  readonly logicalPath: string;
  readonly access: "read" | "write";
}) => {
  const logicalPath = ProducerLogicalPathSchema.parse(rawLogicalPath);
  const bound = await assertTaskWorkerBinding({
    locations,
    taskRevision,
    attemptId,
    bindingId,
  });
  const allowed =
    access === "write"
      ? bound.task.declaredOutputSet
      : [...bound.task.declaredReadSet, ...bound.task.declaredOutputSet];
  if (!allowed.includes(logicalPath)) {
    throw new TaskWorkerBindingError(
      access === "write"
        ? "Task worker may write only declared outputs."
        : "Task worker may read only declared task files.",
    );
  }
  const path = join(bound.workspace, logicalPath);
  const repositoryRelative = relative(bound.workspace, path).split(sep).join("/");
  if (repositoryRelative !== logicalPath) {
    throw new TaskWorkerBindingError("Task worker file path escaped workspace.");
  }
  return { ...bound, logicalPath, path } as const;
};

export const readTaskWorkerFile = async (input: {
  readonly locations: ProductionLocations;
  readonly taskRevision: string;
  readonly attemptId: string;
  readonly bindingId: string;
  readonly logicalPath: string;
}) => {
  const bound = await resolveBoundFile({ ...input, access: "read" });
  const metadata = await lstat(bound.path);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new TaskWorkerBindingError("Task worker read target is not regular.");
  }
  return {
    status: "task-worker-file" as const,
    taskRevision: bound.taskRevision,
    bindingId: bound.bindingId,
    logicalPath: bound.logicalPath,
    contentBase64: (await readFile(bound.path)).toString("base64"),
  };
};

export const writeTaskWorkerFile = async (
  input: {
    readonly locations: ProductionLocations;
    readonly taskRevision: string;
    readonly attemptId: string;
    readonly bindingId: string;
    readonly logicalPath: string;
    readonly contentBase64: string;
  },
) => {
  const parsed = TaskWorkerFileWriteInputSchema.parse({
    contentBase64: input.contentBase64,
  });
  const bound = await resolveBoundFile({ ...input, access: "write" });
  let current = bound.workspace;
  for (const segment of dirname(bound.logicalPath).split("/")) {
    if (segment === ".") continue;
    current = join(current, segment);
    try {
      const metadata = await lstat(current);
      if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
        throw new TaskWorkerBindingError(
          "Task worker output parent is unsafe.",
        );
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") break;
      throw error;
    }
  }
  const bytes = Buffer.from(parsed.contentBase64, "base64");
  await writeBinaryFileAtomic({
    destination: bound.path,
    bytes,
    mode: "replace",
  });
  const metadata = await lstat(bound.path);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new TaskWorkerBindingError("Task worker output is not regular.");
  }
  return {
    status: "task-worker-file-written" as const,
    taskRevision: bound.taskRevision,
    bindingId: bound.bindingId,
    logicalPath: bound.logicalPath,
    sizeBytes: bytes.byteLength,
  };
};

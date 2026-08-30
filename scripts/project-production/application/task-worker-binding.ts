import { lstat, mkdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

import {
  MAX_TASK_WORKER_FILE_BYTES,
  ProducerLogicalPathSchema,
  TASK_WORKER_BINDING_VERSION,
  TaskExecutionContractSchema,
  TaskWorkerBindingIdSchema,
  TaskWorkerBindingSchema,
  TaskWorkerFileWriteInputSchema,
  TaskWorkerTransportSchema,
  buildTaskWorkerBindingId,
  type ProducerTaskSpec,
  type TaskWorkerTransport,
} from "@axmorf/studio/contracts";
import { writeBinaryFileAtomic } from "../../shared/atomic-file";
import { assertExecutionAttemptTaskAuthority } from "../adapters/attempt-store";
import {
  assertTaskWorkspaceInputsCurrent,
  readTaskWorkspaceIdentity,
} from "../adapters/task-workspace";
import { npmScriptProductionCommandFormatter } from "../adapters/npm-script-production-command-formatter";
import type { ProductionCommandFormatter } from "../domain/production-command-formatter";
import { createProjectRevisionProductionScope } from "./production-scope";

export class TaskWorkerBindingError extends Error {
  readonly code = "task-worker-binding-invalid" as const;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

const asTaskWorkerBindingError = (error: unknown, message: string) =>
  error instanceof TaskWorkerBindingError
    ? error
    : new TaskWorkerBindingError(message, { cause: error });

const parseBindingValue = <Value>(
  parse: () => Value,
  message: string,
): Value => {
  try {
    return parse();
  } catch (error) {
    throw asTaskWorkerBindingError(error, message);
  }
};

const sorted = (values: readonly string[]) => [...values].sort();

const assertSamePaths = (
  actual: readonly string[],
  expected: readonly string[],
  message: string,
) => {
  const left = sorted(actual);
  const right = sorted(expected);
  if (
    left.length !== right.length ||
    left.some((value, index) => value !== right[index])
  ) {
    throw new TaskWorkerBindingError(message);
  }
};

export const assertTaskWorkerBindingIdentity = ({
  taskRevision,
  attemptId,
  bindingId,
}: {
  readonly taskRevision: string;
  readonly attemptId: string;
  readonly bindingId: string;
}) => {
  const parsed = parseBindingValue(
    () => TaskWorkerBindingIdSchema.parse(bindingId),
    "Task worker binding identity is invalid.",
  );
  const expected = parseBindingValue(
    () => buildTaskWorkerBindingId({ taskRevision, attemptId }),
    "Task worker binding input is invalid.",
  );
  if (parsed !== expected) {
    throw new TaskWorkerBindingError("Task worker binding identity is stale.");
  }
  return { taskRevision, attemptId, bindingId: parsed } as const;
};

const assertAgentTask = (task: ProducerTaskSpec) => {
  if (
    task.taskKind !== "scene-owner" &&
    task.taskKind !== "global-visual-owner" &&
    task.taskKind !== "cover-owner"
  ) {
    throw new TaskWorkerBindingError(
      "Task does not admit an external Agent worker.",
    );
  }
};

const readRegularFile = async (path: string, message: string) => {
  try {
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new TaskWorkerBindingError(message);
    }
    return await readFile(path);
  } catch (error) {
    if (error instanceof TaskWorkerBindingError) throw error;
    throw new TaskWorkerBindingError(message, { cause: error });
  }
};

export const assertTaskWorkerFailureAuthority = async ({
  rootDir,
  taskRevision,
  attemptId,
  bindingId,
}: {
  readonly rootDir: string;
  readonly taskRevision: string;
  readonly attemptId: string;
  readonly bindingId: string;
}) => {
  const identity = assertTaskWorkerBindingIdentity({
    taskRevision,
    attemptId,
    bindingId,
  });
  try {
    const current = await readTaskWorkspaceIdentity({ rootDir, taskRevision });
    assertAgentTask(current.task);
    await assertExecutionAttemptTaskAuthority({
      rootDir,
      attemptId,
      task: current.task,
    });
    return { ...current, ...identity } as const;
  } catch (error) {
    throw asTaskWorkerBindingError(
      error,
      error instanceof Error
        ? error.message
        : "Task worker failure authority is invalid.",
    );
  }
};

export const assertTaskWorkerBinding = async ({
  rootDir,
  taskRevision,
  attemptId,
  bindingId,
}: {
  readonly rootDir: string;
  readonly taskRevision: string;
  readonly attemptId: string;
  readonly bindingId: string;
}) => {
  const bound = await assertTaskWorkerFailureAuthority({
    rootDir,
    taskRevision,
    attemptId,
    bindingId,
  });
  try {
    await assertTaskWorkspaceInputsCurrent(bound.workspace, bound.task);
    const contractPath = join(bound.workspace, "inputs/task-contract.json");
    const contract = TaskExecutionContractSchema.parse(
      JSON.parse(
        (
          await readRegularFile(
            contractPath,
            "Task execution contract must be a regular file.",
          )
        ).toString("utf8"),
      ),
    );
    if (contract.taskKind !== bound.task.taskKind) {
      throw new TaskWorkerBindingError(
        "Task execution contract kind is stale.",
      );
    }
    assertSamePaths(
      contract.immutableInputs,
      ["task.json", ...bound.task.declaredReadSet],
      "Task execution contract immutable inputs are stale.",
    );
    assertSamePaths(
      contract.outputs.map(({ path }) => path),
      bound.task.declaredOutputSet,
      "Task execution contract outputs are stale.",
    );
    return { ...bound, contract } as const;
  } catch (error) {
    throw asTaskWorkerBindingError(
      error,
      error instanceof Error
        ? error.message
        : "Task worker binding preflight failed.",
    );
  }
};

export const bindTaskWorker = async ({
  rootDir,
  repositoryRootDir = rootDir,
  taskRevision,
  attemptId,
  bindingId,
  transport: rawTransport,
  candidateId,
  commandFormatter = npmScriptProductionCommandFormatter,
}: {
  readonly rootDir: string;
  readonly repositoryRootDir?: string;
  readonly taskRevision: string;
  readonly attemptId: string;
  readonly bindingId: string;
  readonly transport: TaskWorkerTransport;
  readonly candidateId?: string;
  readonly commandFormatter?: ProductionCommandFormatter;
}) => {
  const transport = parseBindingValue(
    () => TaskWorkerTransportSchema.parse(rawTransport),
    "Task worker transport is invalid.",
  );
  const bound = await assertTaskWorkerBinding({
    rootDir,
    taskRevision,
    attemptId,
    bindingId,
  });
  if (candidateId !== undefined) {
    const expectedScope = createProjectRevisionProductionScope({
      rootDir: repositoryRootDir,
      storyId: bound.task.storyId,
      candidateId,
    });
    if (resolve(rootDir) !== expectedScope.isolatedRoot) {
      throw new TaskWorkerBindingError(
        "Task worker candidate routing is cross-bound.",
      );
    }
  }
  const logicalWorkspace = relative(repositoryRootDir, bound.workspace)
    .split(sep)
    .join("/");
  if (
    logicalWorkspace === ".." ||
    logicalWorkspace.startsWith("../") ||
    logicalWorkspace.startsWith("/")
  ) {
    throw new TaskWorkerBindingError("Task worker workspace escaped its root.");
  }
  const commandInput = {
    taskRevision,
    attemptId,
    bindingId,
    ...(candidateId === undefined
      ? {}
      : { projectId: bound.task.storyId, candidateId }),
  } as const;
  try {
    return TaskWorkerBindingSchema.parse({
      schemaVersion: 1,
      contractVersion: TASK_WORKER_BINDING_VERSION,
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
      immutableInputs: sorted(["task.json", ...bound.task.declaredReadSet]),
      declaredOutputs: sorted(bound.task.declaredOutputSet),
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
  } catch (error) {
    throw asTaskWorkerBindingError(
      error,
      "Task worker binding response is invalid.",
    );
  }
};

const resolveBoundFile = async ({
  rootDir,
  taskRevision,
  attemptId,
  bindingId,
  logicalPath: rawLogicalPath,
  access,
}: {
  readonly rootDir: string;
  readonly taskRevision: string;
  readonly attemptId: string;
  readonly bindingId: string;
  readonly logicalPath: string;
  readonly access: "read" | "write";
}) => {
  const logicalPath = parseBindingValue(
    () => ProducerLogicalPathSchema.parse(rawLogicalPath),
    "Task worker logical path is invalid.",
  );
  const bound = await assertTaskWorkerBinding({
    rootDir,
    taskRevision,
    attemptId,
    bindingId,
  });
  const readable = [
    "task.json",
    ...bound.task.declaredReadSet,
    ...bound.task.declaredOutputSet,
  ];
  const allowed = access === "write" ? bound.task.declaredOutputSet : readable;
  if (!allowed.includes(logicalPath)) {
    throw new TaskWorkerBindingError(
      access === "write"
        ? "Task worker may write only declared outputs."
        : "Task worker may read only declared task files.",
    );
  }
  const path = join(bound.workspace, logicalPath);
  if (relative(bound.workspace, path).split(sep).join("/") !== logicalPath) {
    throw new TaskWorkerBindingError("Task worker file escaped its workspace.");
  }
  return { ...bound, logicalPath, path } as const;
};

export const describeBoundTask = async (input: {
  readonly rootDir: string;
  readonly taskRevision: string;
  readonly attemptId: string;
  readonly bindingId: string;
}) => {
  const bound = await assertTaskWorkerBinding(input);
  return {
    status: "task-described" as const,
    task: bound.task,
    executionContract: bound.contract,
  };
};

export const readTaskWorkerFile = async (input: {
  readonly rootDir: string;
  readonly taskRevision: string;
  readonly attemptId: string;
  readonly bindingId: string;
  readonly logicalPath: string;
}) => {
  const bound = await resolveBoundFile({ ...input, access: "read" });
  const bytes = await readRegularFile(
    bound.path,
    "Task worker read target must be a regular file.",
  );
  return {
    status: "task-worker-file" as const,
    taskRevision: bound.taskRevision,
    bindingId: bound.bindingId,
    logicalPath: bound.logicalPath,
    contentBase64: bytes.toString("base64"),
  };
};

const ensureSafeOutputParent = async (
  workspace: string,
  logicalPath: string,
) => {
  let current = workspace;
  for (const segment of dirname(logicalPath).split("/")) {
    if (segment === ".") continue;
    current = join(current, segment);
    try {
      await mkdir(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const metadata = await lstat(current);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new TaskWorkerBindingError("Task worker output parent is unsafe.");
    }
  }
};

const assertSafeOutputTarget = async (path: string) => {
  try {
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new TaskWorkerBindingError("Task worker output target is unsafe.");
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    if (error instanceof TaskWorkerBindingError) throw error;
    throw new TaskWorkerBindingError(
      "Task worker output target cannot be inspected safely.",
      { cause: error },
    );
  }
};

export const writeTaskWorkerFile = async (input: {
  readonly rootDir: string;
  readonly taskRevision: string;
  readonly attemptId: string;
  readonly bindingId: string;
  readonly logicalPath: string;
  readonly contentBase64: string;
}) => {
  const parsed = parseBindingValue(
    () =>
      TaskWorkerFileWriteInputSchema.parse({
        contentBase64: input.contentBase64,
      }),
    "Task worker file body is invalid.",
  );
  const bound = await resolveBoundFile({ ...input, access: "write" });
  const bytes = Buffer.from(parsed.contentBase64, "base64");
  if (bytes.byteLength > MAX_TASK_WORKER_FILE_BYTES) {
    throw new TaskWorkerBindingError(
      "Task worker file exceeds the decoded size limit.",
    );
  }
  await ensureSafeOutputParent(bound.workspace, bound.logicalPath);
  await assertSafeOutputTarget(bound.path);
  await writeBinaryFileAtomic({
    destination: bound.path,
    bytes,
    mode: "replace",
  });
  const metadata = await lstat(bound.path);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new TaskWorkerBindingError(
      "Task worker output must be a regular file.",
    );
  }
  return {
    status: "task-worker-file-written" as const,
    taskRevision: bound.taskRevision,
    bindingId: bound.bindingId,
    logicalPath: bound.logicalPath,
    sizeBytes: bytes.byteLength,
  };
};

import { z } from "zod";

import { createFingerprint } from "./fingerprint";
import { StoryIdSchema } from "./primitives";
import {
  ProducerLogicalPathSchema,
  ProducerTaskKindSchema,
  TaskRevisionSchema,
} from "./producer-task";
import { ProductionRevisionIdSchema } from "./production-revision";

export const TASK_WORKER_BINDING_VERSION = "task-worker-binding-v1" as const;
export const MAX_TASK_WORKER_FILE_BYTES = 8 * 1024 * 1024;

export const TaskWorkerTransportSchema = z.enum([
  "shared-workspace",
  "controller-io",
]);

export const TaskWorkerBindingIdSchema = z
  .string()
  .regex(/^binding-[0-9a-f]{64}$/u)
  .brand<"TaskWorkerBindingId">();

export const TaskWorkerBindingInputSchema = z
  .object({
    taskRevision: TaskRevisionSchema,
    attemptId: z.string().uuid(),
  })
  .strict()
  .readonly();

export const buildTaskWorkerBindingId = (rawInput: unknown) => {
  const input = TaskWorkerBindingInputSchema.parse(rawInput);
  const fingerprint = createFingerprint({
    namespace: "task-worker-binding",
    version: 1,
    value: input,
  });
  return TaskWorkerBindingIdSchema.parse(
    `binding-${fingerprint.slice("sha256:".length)}`,
  );
};

const BoundCommandSchema = z.string().min(1).max(1_000);
const AgentTaskKindSchema = ProducerTaskKindSchema.extract([
  "scene-owner",
  "global-visual-owner",
  "cover-owner",
]);

export const TaskWorkerBindingSchema = z
  .object({
    schemaVersion: z.literal(1),
    contractVersion: z.literal(TASK_WORKER_BINDING_VERSION),
    status: z.literal("task-worker-bound"),
    bindingId: TaskWorkerBindingIdSchema,
    transport: TaskWorkerTransportSchema,
    storyId: StoryIdSchema,
    revisionId: ProductionRevisionIdSchema,
    taskRevision: TaskRevisionSchema,
    attemptId: z.string().uuid(),
    taskKind: AgentTaskKindSchema,
    workspace: z
      .object({
        relativePath: ProducerLogicalPathSchema,
        directFilesystemAccess: z.boolean(),
      })
      .strict()
      .readonly(),
    immutableInputs: z.array(ProducerLogicalPathSchema).min(3).readonly(),
    declaredOutputs: z.array(ProducerLogicalPathSchema).min(1).readonly(),
    writeAllowed: z.literal(true),
    commands: z
      .object({
        describe: BoundCommandSchema,
        finalize: BoundCommandSchema,
        check: BoundCommandSchema,
        commit: BoundCommandSchema,
        taskFailure: BoundCommandSchema,
        fixedFailure: BoundCommandSchema,
        fileRead: BoundCommandSchema,
        fileWrite: BoundCommandSchema,
      })
      .strict()
      .readonly(),
  })
  .strict()
  .superRefine((binding, context) => {
    if (
      binding.bindingId !==
      buildTaskWorkerBindingId({
        taskRevision: binding.taskRevision,
        attemptId: binding.attemptId,
      })
    ) {
      context.addIssue({
        code: "custom",
        message: "Task worker binding identity is not attempt-bound.",
        path: ["bindingId"],
      });
    }
    const immutableInputs = [...binding.immutableInputs].sort();
    const declaredOutputs = [...binding.declaredOutputs].sort();
    if (
      binding.immutableInputs.some(
        (path, index) => path !== immutableInputs[index],
      ) ||
      new Set(binding.immutableInputs).size !== binding.immutableInputs.length
    ) {
      context.addIssue({
        code: "custom",
        message: "Task worker immutable inputs must be sorted and unique.",
        path: ["immutableInputs"],
      });
    }
    if (
      binding.declaredOutputs.some(
        (path, index) => path !== declaredOutputs[index],
      ) ||
      new Set(binding.declaredOutputs).size !== binding.declaredOutputs.length
    ) {
      context.addIssue({
        code: "custom",
        message: "Task worker outputs must be sorted and unique.",
        path: ["declaredOutputs"],
      });
    }
    if (!binding.immutableInputs.includes("task.json")) {
      context.addIssue({
        code: "custom",
        message:
          "Task worker binding must expose task.json as immutable input.",
        path: ["immutableInputs"],
      });
    }
    if (
      binding.workspace.directFilesystemAccess !==
      (binding.transport === "shared-workspace")
    ) {
      context.addIssue({
        code: "custom",
        message: "Task worker filesystem access disagrees with its transport.",
        path: ["workspace", "directFilesystemAccess"],
      });
    }
  })
  .readonly();

export const TaskWorkerFileWriteInputSchema = z
  .object({
    contentBase64: z
      .string()
      .max(Math.ceil(MAX_TASK_WORKER_FILE_BYTES / 3) * 4 + 4)
      .regex(
        /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u,
      ),
  })
  .strict()
  .readonly();

export type TaskWorkerTransport = z.infer<typeof TaskWorkerTransportSchema>;
export type TaskWorkerBindingId = z.infer<typeof TaskWorkerBindingIdSchema>;
export type TaskWorkerBinding = z.infer<typeof TaskWorkerBindingSchema>;

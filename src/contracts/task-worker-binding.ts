import { z } from "zod";

import { createFingerprint } from "./fingerprint";
import { StoryIdSchema } from "./primitives";
import { ProducerLogicalPathSchema, ProducerTaskKindSchema, TaskRevisionSchema } from "./producer-task";
import { ProductionRevisionIdSchema } from "./production-revision";

export const TASK_WORKER_BINDING_VERSION = "task-worker-binding-v1" as const;

export const TaskWorkerTransportSchema = z.enum([
  "shared-workspace",
  "controller-io",
]);

export const TaskWorkerBindingIdSchema = z
  .string()
  .regex(/^binding-[0-9a-f]{64}$/u)
  .brand<"TaskWorkerBindingId">();

export const TaskWorkerBindingInputSchema = z
  .strictObject({
    taskRevision: TaskRevisionSchema,
    attemptId: z.string().uuid(),
  })
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

export const TaskWorkerBindingSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    contractVersion: z.literal(TASK_WORKER_BINDING_VERSION),
    status: z.literal("task-worker-bound"),
    bindingId: TaskWorkerBindingIdSchema,
    transport: TaskWorkerTransportSchema,
    storyId: StoryIdSchema,
    revisionId: ProductionRevisionIdSchema,
    taskRevision: TaskRevisionSchema,
    attemptId: z.string().uuid(),
    taskKind: ProducerTaskKindSchema.extract([
      "scene-owner",
      "global-visual-owner",
      "cover-owner",
    ]),
    workspace: z
      .strictObject({
        relativePath: ProducerLogicalPathSchema,
        directFilesystemAccess: z.boolean(),
      })
      .readonly(),
    immutableInputs: z.array(ProducerLogicalPathSchema).min(2).readonly(),
    declaredOutputs: z.array(ProducerLogicalPathSchema).min(1).readonly(),
    writeAllowed: z.literal(true),
    commands: z
      .strictObject({
        describe: BoundCommandSchema,
        finalize: BoundCommandSchema,
        check: BoundCommandSchema,
        commit: BoundCommandSchema,
        taskFailure: BoundCommandSchema,
        fixedFailure: BoundCommandSchema,
        fileRead: BoundCommandSchema,
        fileWrite: BoundCommandSchema,
      })
      .readonly(),
  })
  .readonly();

export const TaskWorkerFileWriteInputSchema = z
  .strictObject({
    contentBase64: z
      .string()
      .max(8 * 1024 * 1024)
      .regex(
        /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u,
      ),
  })
  .readonly();

export type TaskWorkerTransport = z.infer<typeof TaskWorkerTransportSchema>;
export type TaskWorkerBindingId = z.infer<typeof TaskWorkerBindingIdSchema>;
export type TaskWorkerBinding = z.infer<typeof TaskWorkerBindingSchema>;

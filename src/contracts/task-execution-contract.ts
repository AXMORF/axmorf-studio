import { z } from "zod";

import { ProducerLogicalPathSchema, ProducerTaskKindSchema } from "./producer-task";

export const TASK_EXECUTION_CONTRACT_VERSION =
  "agent-task-execution-contract-v2" as const;

const AgentTaskKindSchema = ProducerTaskKindSchema.extract([
  "scene-owner",
  "global-visual-owner",
  "cover-owner",
]);

const TaskOutputContractSchema = z
  .strictObject({
    path: ProducerLogicalPathSchema,
    owner: z.enum([
      "agent",
      "rsp-finalize",
      "agent-draft-rsp-finalize",
    ]),
    format: z.enum(["json", "tsx", "ts"]),
    instructions: z.array(z.string().min(1).max(1000)).min(1).max(16).readonly(),
    derivedFields: z.array(z.string().min(1).max(160)).max(16).readonly(),
    jsonSchema: z.record(z.string(), z.unknown()).optional(),
    example: z.unknown().optional(),
  })
  .readonly();

export const TaskExecutionContractSchema = z
  .strictObject({
    schemaVersion: z.literal(2),
    contractVersion: z.literal(TASK_EXECUTION_CONTRACT_VERSION),
    taskKind: AgentTaskKindSchema,
    purpose: z.string().min(1).max(1000),
    workflow: z.array(z.string().min(1).max(1000)).min(1).max(16).readonly(),
    preflight: z
      .strictObject({
        bindingRequiredBeforeWrites: z.literal(true),
        immutableInputFailurePolicy: z.literal("abort-zero-write"),
        repairableValidationOwner: z.literal("agent-output"),
      })
      .readonly(),
    immutableInputs: z
      .tuple([
        z.literal("inputs/context.json"),
        z.literal("inputs/task-contract.json"),
      ])
      .readonly(),
    outputs: z.array(TaskOutputContractSchema).min(1).max(32).readonly(),
    componentSignatures: z.array(z.string().min(1).max(8000)).max(8).readonly(),
    constraints: z.array(z.string().min(1).max(1000)).min(1).max(32).readonly(),
    commands: z
      .strictObject({
        bind: z.literal(
          "./.rsp/bin/rsp task bind --task <taskRevision> --attempt <attemptId> --binding <bindingId> --transport <shared-workspace|controller-io>",
        ),
        finalize: z.literal(
          "./.rsp/bin/rsp task finalize --task <taskRevision> --attempt <attemptId> --binding <bindingId>",
        ),
        check: z.literal(
          "./.rsp/bin/rsp task check --task <taskRevision> --attempt <attemptId> --binding <bindingId>",
        ),
      })
      .readonly(),
  })
  .readonly();

export type TaskExecutionContract = z.infer<
  typeof TaskExecutionContractSchema
>;

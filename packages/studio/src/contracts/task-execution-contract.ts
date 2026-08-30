import { z } from "zod";

import { ProducerLogicalPathSchema } from "./producer-task";

export const TASK_EXECUTION_CONTRACT_VERSION =
  "agent-task-execution-contract-v1" as const;

export const AgentTaskKindSchema = z.enum([
  "scene-owner",
  "global-visual-owner",
  "cover-owner",
]);

export const TaskOutputOwnerSchema = z.enum([
  "agent",
  "fixed-finalize",
  "agent-draft-fixed-finalize",
]);

const TaskOutputFormatSchema = z.enum(["json", "tsx", "ts"]);
const NonEmptyInstructionSchema = z.string().trim().min(1).max(1200);

export const TaskOutputContractSchema = z
  .object({
    path: ProducerLogicalPathSchema,
    owner: TaskOutputOwnerSchema,
    format: TaskOutputFormatSchema,
    instructions: z.array(NonEmptyInstructionSchema).min(1).max(16).readonly(),
    derivedFields: z
      .array(z.string().trim().min(1).max(192))
      .max(24)
      .readonly(),
    jsonSchema: z.record(z.string(), z.unknown()).optional(),
    example: z.json(),
  })
  .strict()
  .superRefine((output, context) => {
    const extension = output.path.split(".").at(-1);
    if (extension !== output.format) {
      context.addIssue({
        code: "custom",
        message: "Task output format must match its logical path extension.",
        path: ["format"],
      });
    }
    if ((output.format === "json") !== (output.jsonSchema !== undefined)) {
      context.addIssue({
        code: "custom",
        message: "Only JSON task outputs must declare a JSON Schema.",
        path: ["jsonSchema"],
      });
    }
    if (output.format !== "json" && output.derivedFields.length > 0) {
      context.addIssue({
        code: "custom",
        message: "Source outputs cannot declare fixed derived fields.",
        path: ["derivedFields"],
      });
    }
    if (
      output.owner === "fixed-finalize" &&
      output.derivedFields.length === 0
    ) {
      context.addIssue({
        code: "custom",
        message: "Fixed finalizer outputs must declare their derived fields.",
        path: ["derivedFields"],
      });
    }
  })
  .readonly();

export const TaskExecutionContractSchema = z
  .object({
    schemaVersion: z.literal(1),
    contractVersion: z.literal(TASK_EXECUTION_CONTRACT_VERSION),
    taskKind: AgentTaskKindSchema,
    purpose: NonEmptyInstructionSchema,
    workflow: z.array(NonEmptyInstructionSchema).min(1).max(16).readonly(),
    immutableInputs: z
      .tuple([
        z.literal("task.json"),
        z.literal("inputs/context.json"),
        z.literal("inputs/task-contract.json"),
      ])
      .readonly(),
    preflight: z
      .object({
        bindingRequiredBeforeWrites: z.literal(true),
        immutableInputFailurePolicy: z.literal("abort-zero-write"),
        repairableValidationOwner: z.literal("agent-output"),
      })
      .strict()
      .readonly(),
    outputs: z.array(TaskOutputContractSchema).min(1).max(32).readonly(),
    componentSignatures: z
      .array(z.string().trim().min(1).max(8000))
      .max(8)
      .readonly(),
    constraints: z.array(NonEmptyInstructionSchema).min(1).max(32).readonly(),
  })
  .strict()
  .superRefine((contract, context) => {
    const paths = contract.outputs.map(({ path }) => path);
    const sortedPaths = [...paths].sort();
    if (
      new Set(paths).size !== paths.length ||
      paths.some((path, index) => path !== sortedPaths[index])
    ) {
      context.addIssue({
        code: "custom",
        message: "Task execution contract outputs must be sorted and unique.",
        path: ["outputs"],
      });
    }
    const instructionGroups = [
      contract.workflow,
      contract.constraints,
      ...contract.outputs.map(({ instructions }) => instructions),
    ];
    if (
      instructionGroups.some(
        (instructions) => new Set(instructions).size !== instructions.length,
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "Task execution contract instructions must be unique.",
      });
    }
  })
  .readonly();

export type AgentTaskKind = z.infer<typeof AgentTaskKindSchema>;
export type TaskOutputOwner = z.infer<typeof TaskOutputOwnerSchema>;
export type TaskOutputContract = z.infer<typeof TaskOutputContractSchema>;
export type TaskExecutionContract = z.infer<typeof TaskExecutionContractSchema>;

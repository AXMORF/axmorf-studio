import { z } from "zod";

import { ProducerConfigSchema } from "../../src/contracts/producer-config";
import {
  ActualProductionCostSchema,
  EstimatedProductionCostSchema,
  ProductionInspectionSchema,
  TaskDecisionExplanationListSchema,
  validateTaskExplanationStoryBinding,
} from "../../src/contracts/production-inspection";
import { StoryIdSchema } from "../../src/contracts/primitives";
import {
  ExecutionPreferencesSchema,
  type ExecutionPreferences,
} from "./execution-preferences";

export const SETTINGS_API_ROUTES = {
  settings: "/api/settings",
  executionPreferences: "/api/execution-preferences",
  diagnostics: "/api/diagnostics",
  productionProgress: "/api/production-progress",
  projectDeletion: "/api/projects/delete",
} as const;

export const ApiErrorSchema = z.object({ error: z.string().min(1) }).strict();

export const EnvironmentDiagnosticsSchema = z
  .object({
    schemaVersion: z.literal(1),
    status: z.enum(["pass", "attention"]),
    checks: z.array(
      z
        .object({
          id: z.string().min(1),
          status: z.enum(["pass", "fail"]),
          summary: z.string().min(1),
          remediation: z.string().min(1).nullable(),
        })
        .strict(),
    ),
  })
  .strict();

export type EnvironmentDiagnostics = z.infer<
  typeof EnvironmentDiagnosticsSchema
>;

export const ProjectProductionStatusSchema = z.enum([
  "not-produced",
  "needs-agent",
  "converging",
  "source-current",
  "current",
  "stale",
  "failed",
  "error",
]);

export type ProjectProductionStatus = z.infer<
  typeof ProjectProductionStatusSchema
>;

export const ProjectTaskSummarySchema = z
  .object({
    reusedTaskCount: z.number().int().nonnegative(),
    dirtyAgentTaskCount: z.number().int().nonnegative(),
    dirtyFixedTaskCount: z.number().int().nonnegative(),
    blockedTaskCount: z.number().int().nonnegative(),
  })
  .strict();

export const ProjectEstimatedCostSchema = EstimatedProductionCostSchema;
export const ProjectActualCostSchema = ActualProductionCostSchema;

export const ProjectAttemptSummarySchema = z
  .object({
    attemptId: z.string().uuid(),
    revisionId: z.string().regex(/^revision-[0-9a-f]{64}$/u),
    state: z.enum([
      "waiting-for-agent",
      "converging",
      "succeeded",
      "failed",
    ]),
    updatedAt: z.string().datetime({ offset: true }),
    diagnosticCode: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
      .nullable(),
    tasks: ProjectTaskSummarySchema,
    estimatedCost: ProjectEstimatedCostSchema,
    actualCost: ProjectActualCostSchema,
    taskExplanations: TaskDecisionExplanationListSchema,
    taskOutcomes: z
      .object({
        committedTaskCount: z.number().int().nonnegative(),
        currentTaskCount: z.number().int().nonnegative(),
        failedTaskCount: z.number().int().nonnegative(),
      })
      .strict(),
    terminalResult: z.enum([
      "pending",
      "source-current",
      "delivery-current",
      "failed",
    ]),
  })
  .strict();

export const ProjectDeliverySummarySchema = z
  .object({
    deliveryBuildId: z.string().regex(/^delivery-[0-9a-f]{64}$/u),
    revisionId: z.string().regex(/^revision-[0-9a-f]{64}$/u),
    sourceCurrentId: z.string().regex(/^source-current-[0-9a-f]{64}$/u),
    rendererRuntimeFingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
    frameCount: z.number().int().positive(),
    current: z.boolean(),
    files: z
      .object({
        video: z.literal(true),
        cover4x3: z.literal(true),
        cover3x4: z.literal(true),
        publish: z.literal(true),
      })
      .strict(),
  })
  .strict();

export const ProjectProductionProgressSchema = z
  .object({
    projectId: StoryIdSchema,
    status: ProjectProductionStatusSchema,
    revisionId: z
      .string()
      .regex(/^revision-[0-9a-f]{64}$/u)
      .nullable(),
    tasks: ProjectTaskSummarySchema,
    inspection: ProductionInspectionSchema.nullable(),
    attempt: ProjectAttemptSummarySchema.nullable(),
    delivery: ProjectDeliverySummarySchema.nullable(),
    error: z.string().min(1).nullable(),
  })
  .strict()
  .superRefine((project, context) => {
    if (
      project.inspection !== null &&
      project.inspection.storyId !== project.projectId
    ) {
      context.addIssue({
        code: "custom",
        message: "Production inspection is cross-story.",
        path: ["inspection", "storyId"],
      });
    }
    if (project.attempt === null) return;
    validateTaskExplanationStoryBinding({
      storyId: project.projectId,
      tasks: project.attempt.taskExplanations,
      context,
      path: ["attempt", "taskExplanations"],
    });
  });

export type ProjectProductionProgress = z.infer<
  typeof ProjectProductionProgressSchema
>;

export const ProductionProgressResponseSchema = z
  .object({
    schemaVersion: z.literal(5),
    projects: z.array(ProjectProductionProgressSchema),
  })
  .strict();

export type ProductionProgressResponse = z.infer<
  typeof ProductionProgressResponseSchema
>;

export const DeleteProjectRequestSchema = z
  .object({
    projectId: StoryIdSchema,
    confirmation: z.string(),
  })
  .strict()
  .superRefine((request, context) => {
    if (request.confirmation !== request.projectId) {
      context.addIssue({
        code: "custom",
        message: "请输入完整 Project ID 确认删除。",
        path: ["confirmation"],
      });
    }
  });

export const DeleteProjectResponseSchema = z
  .object({ deletedProjectId: StoryIdSchema })
  .strict();

export { ExecutionPreferencesSchema, ProducerConfigSchema };
export type { ExecutionPreferences };

type DeepMutable<T> = T extends
  | string
  | number
  | boolean
  | bigint
  | symbol
  | null
  | undefined
  ? T
  : T extends readonly (infer Item)[]
    ? DeepMutable<Item>[]
    : T extends object
      ? { -readonly [Key in keyof T]: DeepMutable<T[Key]> }
      : T;

type ProducerConfigDto = z.input<typeof ProducerConfigSchema>;

export type EditableConfig = Omit<
  DeepMutable<ProducerConfigDto>,
  "configFingerprint"
> & {
  configFingerprint?: ProducerConfigDto["configFingerprint"];
};

export type TtsProviderConfig = EditableConfig["tts"]["providers"][number];
export type VoxcpmProviderConfig = Extract<
  TtsProviderConfig,
  { kind: "voxcpm" }
>;
export type SpeechSdkProviderConfig = Extract<
  TtsProviderConfig,
  { kind: "speech-sdk" }
>;
export type EdgeTtsProviderConfig = Extract<
  TtsProviderConfig,
  { kind: "edge-tts" }
>;

export const parseEditableConfig = (raw: unknown): EditableConfig =>
  ProducerConfigSchema.parse(raw) as unknown as EditableConfig;

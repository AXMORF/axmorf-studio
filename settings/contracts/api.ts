import { z } from "zod";

import { ProducerConfigSchema } from "../../src/contracts/producer-config";
import { StoryIdSchema } from "../../src/contracts/primitives";

export const SETTINGS_API_ROUTES = {
  settings: "/api/settings",
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

export const ProductionProgressStepStatusSchema = z.enum([
  "pending",
  "running",
  "succeeded",
  "failed",
  "attention",
  "launched",
]);

export type ProductionProgressStepStatus = z.infer<
  typeof ProductionProgressStepStatusSchema
>;

export const ProductionProgressStepSchema = z
  .object({
    id: z.enum([
      "production-start",
      "narrative",
      "scene-freeze",
      "scenes",
      "render-ready",
      "delivery",
    ]),
    label: z.string().min(1),
    command: z.string().min(1),
    status: ProductionProgressStepStatusSchema,
    detail: z.string().min(1),
    occurredAt: z.string().nullable(),
  })
  .strict();

export type ProductionProgressStep = z.infer<
  typeof ProductionProgressStepSchema
>;

export const ProductionRunProgressSchema = z
  .object({
    runId: z.string().min(1),
    storyId: StoryIdSchema,
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
    state: z.string().min(1),
    completedSteps: z.number().int().nonnegative(),
    totalSteps: z.number().int().positive(),
    steps: z.array(ProductionProgressStepSchema),
  })
  .strict();

export type ProductionRunProgress = z.infer<typeof ProductionRunProgressSchema>;

export const ProjectBuildStatusSchema = z.enum([
  "not-built",
  "building",
  "current",
  "stale",
  "failed",
  "error",
]);

export type ProjectBuildStatus = z.infer<typeof ProjectBuildStatusSchema>;

export const ProjectBuildProgressStepSchema = z
  .object({
    id: z.enum([
      "prepare",
      "video",
      "cover-4x3",
      "cover-3x4",
      "verify",
      "promote",
    ]),
    label: z.string().min(1),
    status: z.enum(["pending", "running", "succeeded", "failed"]),
    detail: z.string().min(1),
    occurredAt: z.string().nullable(),
    reused: z.boolean().nullable(),
  })
  .strict();

export type ProjectBuildProgressStep = z.infer<
  typeof ProjectBuildProgressStepSchema
>;

export const ProjectDeliverySummarySchema = z
  .object({
    buildId: z.string().min(1),
    sourceSnapshotFingerprint: z.string().min(1),
    frameCount: z.number().int().positive(),
    sourceCurrent: z.boolean(),
    updatedAt: z.string().min(1),
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

export const ProjectBuildProgressSchema = z
  .object({
    buildId: z.string().min(1).nullable(),
    completedSteps: z.number().int().nonnegative(),
    detail: z.string().min(1),
    delivery: ProjectDeliverySummarySchema.nullable(),
    steps: z.array(ProjectBuildProgressStepSchema).length(6),
    totalSteps: z.literal(6),
    updatedAt: z.string().nullable(),
  })
  .strict();

export const ProjectProductionProgressSchema = z
  .object({
    projectId: StoryIdSchema,
    status: ProjectBuildStatusSchema,
    error: z.string().min(1).nullable(),
    build: ProjectBuildProgressSchema,
    auditedRun: ProductionRunProgressSchema.nullable(),
    auditedRunError: z.string().min(1).nullable(),
  })
  .strict();

export type ProjectProductionProgress = z.infer<
  typeof ProjectProductionProgressSchema
>;

export const ProductionProgressResponseSchema = z
  .object({
    schemaVersion: z.literal(3),
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

export { ProducerConfigSchema };

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
> & { configFingerprint?: ProducerConfigDto["configFingerprint"] };

export type TtsProviderConfig = EditableConfig["tts"]["providers"][number];
export type VoxcpmProviderConfig = Extract<
  TtsProviderConfig,
  { kind: "voxcpm" }
>;
export type SpeechSdkProviderConfig = Extract<
  TtsProviderConfig,
  { kind: "speech-sdk" }
>;

export const parseEditableConfig = (raw: unknown): EditableConfig =>
  ProducerConfigSchema.parse(raw) as unknown as EditableConfig;

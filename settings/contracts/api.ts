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

export const ProjectProductionProgressSchema = z
  .object({
    projectId: StoryIdSchema,
    status: z.enum(["idle", "available", "error"]),
    error: z.string().min(1).nullable(),
    run: ProductionRunProgressSchema.nullable(),
  })
  .strict();

export type ProjectProductionProgress = z.infer<
  typeof ProjectProductionProgressSchema
>;

export const ProductionProgressResponseSchema = z
  .object({
    schemaVersion: z.literal(2),
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

export type VoxcpmProviderConfig = EditableConfig["tts"]["providers"][number];

export const parseEditableConfig = (raw: unknown): EditableConfig =>
  ProducerConfigSchema.parse(raw) as unknown as EditableConfig;

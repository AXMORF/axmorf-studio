import { z } from "zod";

import { createFingerprint } from "./fingerprint";
import { MeaningIdSchema, Sha256DigestSchema, StoryIdSchema } from "./primitives";
import { ProductionRevisionIdSchema } from "./production-revision";

export const PRODUCER_TASK_VERSION = "producer-task-v1" as const;
export const PRODUCER_TASK_KINDS = [
  "narration-chunk",
  "narration-seal",
  "semantic-timing",
  "scene-template",
  "scene-owner",
  "global-visual-owner",
  "cover-owner",
  "composition-convergence",
  "delivery-build",
] as const;

export const ProducerTaskKindSchema = z.enum(PRODUCER_TASK_KINDS);
export const TaskRevisionSchema = z
  .string()
  .regex(/^task-[0-9a-f]{64}$/u)
  .brand<"TaskRevision">();

export const ProducerLogicalPathSchema = z
  .string()
  .min(1)
  .max(512)
  .refine(
    (value) =>
      !value.startsWith("/") &&
      !value.includes("\\") &&
      value.split("/").every((part) => part.length > 0 && part !== "." && part !== ".."),
    "Path must be a normalized repository-relative logical path.",
  );

const InputFingerprintSchema = z
  .object({ id: z.string().min(1).max(192), fingerprint: Sha256DigestSchema })
  .strict()
  .readonly();

const DependencyArtifactSchema = z
  .object({
    taskRevision: TaskRevisionSchema,
    artifactFingerprint: Sha256DigestSchema,
  })
  .strict()
  .readonly();

const TaskIdentityShape = {
    schemaVersion: z.literal(1),
    contractVersion: z.literal(PRODUCER_TASK_VERSION),
    taskKind: ProducerTaskKindSchema,
    storyId: StoryIdSchema,
    semanticId: MeaningIdSchema.nullable(),
    revisionId: ProductionRevisionIdSchema,
    dependencyArtifacts: z.array(DependencyArtifactSchema),
    inputFingerprints: z.array(InputFingerprintSchema).min(1),
    declaredReadSet: z.array(ProducerLogicalPathSchema),
    declaredOutputSet: z.array(ProducerLogicalPathSchema).min(1),
    validatorPolicyVersion: z.string().min(1).max(160),
} as const;

const validateTaskIdentity = (
  task: z.infer<ReturnType<typeof z.object<typeof TaskIdentityShape>>>,
  context: z.RefinementCtx,
) => {
    const collections = [
      ["dependencyArtifacts", task.dependencyArtifacts.map(({ taskRevision }) => taskRevision)],
      ["inputFingerprints", task.inputFingerprints.map(({ id }) => id)],
      ["declaredReadSet", task.declaredReadSet],
      ["declaredOutputSet", task.declaredOutputSet],
    ] as const;
    for (const [path, values] of collections) {
      const sorted = [...values].sort();
      if (values.some((value, index) => value !== sorted[index]) || new Set(values).size !== values.length) {
        context.addIssue({ code: "custom", message: `${path} must be sorted and unique.`, path: [path] });
      }
    }
    const inputIds = new Set(task.inputFingerprints.map(({ id }) => id));
    for (const logicalPath of task.declaredReadSet) {
      if (!inputIds.has(`read:${logicalPath}`)) {
        context.addIssue({
          code: "custom",
          message: "Every declared read path must bind its exact bytes.",
          path: ["inputFingerprints"],
        });
      }
    }
    const sceneTask = task.taskKind === "scene-owner" || task.taskKind === "scene-template";
    if (sceneTask !== (task.semanticId !== null)) {
      context.addIssue({ code: "custom", message: "Only Scene tasks have a semanticId.", path: ["semanticId"] });
    }
};

const TaskIdentitySchema = z
  .object(TaskIdentityShape)
  .superRefine((task, context) => {
    validateTaskIdentity(task, context);
  })
  .readonly();

const computeTaskRevision = (identity: z.infer<typeof TaskIdentitySchema>) => {
  // revisionId locates the full Project revision for diagnostics, but task reuse is
  // intentionally governed only by the task-local inputs, dependencies, and policy.
  const contentIdentity = { ...identity } as Record<string, unknown>;
  delete contentIdentity.revisionId;
  const fingerprint = createFingerprint({
    namespace: "producer-task",
    version: 1,
    value: contentIdentity,
  });
  return TaskRevisionSchema.parse(`task-${fingerprint.slice("sha256:".length)}`);
};

export const ProducerTaskSpecSchema = z
  .object({ ...TaskIdentityShape, taskRevision: TaskRevisionSchema })
  .strict()
  .superRefine((task, context) => {
    validateTaskIdentity(task, context);
    const { taskRevision, ...identity } = task;
    if (taskRevision !== computeTaskRevision(TaskIdentitySchema.parse(identity))) {
      context.addIssue({
        code: "custom",
        message: "Producer task identity is stale.",
        path: ["taskRevision"],
      });
    }
  })
  .readonly();

export const buildProducerTaskSpec = (rawInput: unknown) => {
  const input = rawInput as Record<string, unknown>;
  const identity = TaskIdentitySchema.parse({
    ...input,
    schemaVersion: 1,
    contractVersion: PRODUCER_TASK_VERSION,
  });
  return ProducerTaskSpecSchema.parse({
    ...identity,
    taskRevision: computeTaskRevision(identity),
  });
};

export type ProducerTaskSpec = z.infer<typeof ProducerTaskSpecSchema>;
export type ProducerTaskKind = z.infer<typeof ProducerTaskKindSchema>;
export type TaskRevision = z.infer<typeof TaskRevisionSchema>;

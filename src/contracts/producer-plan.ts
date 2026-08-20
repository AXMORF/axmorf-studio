import { z } from "zod";

import { createFingerprint } from "./fingerprint";
import {
  MeaningIdSchema,
  NonNegativeIntegerSchema,
  Sha256DigestSchema,
  StoryIdSchema,
} from "./primitives";
import { ProductionRevisionIdSchema } from "./production-revision";
import { ProducerTaskKindSchema, TaskRevisionSchema } from "./producer-task";

export const PRODUCER_PLAN_VERSION = "producer-plan-v1" as const;
export const ProducerTaskStatusSchema = z.enum([
  "reused",
  "dirty",
  "missing",
  "incompatible",
  "blocked",
]);
export const ProducerReasonCodeSchema = z.enum([
  "artifact-valid",
  "artifact-missing",
  "checksum-drift",
  "input-changed",
  "dependency-changed",
  "validator-version-changed",
  "dependency-blocked",
]);

const ProducerPlanTaskSchema = z
  .object({
    taskRevision: TaskRevisionSchema,
    taskKind: ProducerTaskKindSchema,
    semanticId: MeaningIdSchema.nullable(),
    status: ProducerTaskStatusSchema,
    reasonCode: ProducerReasonCodeSchema,
    dependencyTaskRevisions: z.array(TaskRevisionSchema),
  })
  .strict()
  .readonly();

const PlanInputShape = {
    schemaVersion: z.literal(1),
    contractVersion: z.literal(PRODUCER_PLAN_VERSION),
    storyId: StoryIdSchema,
    revisionId: ProductionRevisionIdSchema,
    artifactSetFingerprint: Sha256DigestSchema,
    tasks: z.array(ProducerPlanTaskSchema),
    summary: z
      .object({
        reusedTaskCount: NonNegativeIntegerSchema,
        dirtyAgentTaskCount: NonNegativeIntegerSchema,
        dirtyFixedTaskCount: NonNegativeIntegerSchema,
        blockedTaskCount: NonNegativeIntegerSchema,
      })
      .strict()
      .readonly(),
} as const;

const validatePlanInput = (
  plan: z.infer<ReturnType<typeof z.object<typeof PlanInputShape>>>,
  context: z.RefinementCtx,
) => {
    const ids = plan.tasks.map(({ taskRevision }) => taskRevision);
    const sorted = [...ids].sort();
  if (ids.some((id, index) => id !== sorted[index]) || new Set(ids).size !== ids.length) {
      context.addIssue({ code: "custom", message: "Plan tasks must be sorted and unique.", path: ["tasks"] });
  }
  for (const [index, task] of plan.tasks.entries()) {
    const sceneTask =
      task.taskKind === "scene-owner" || task.taskKind === "scene-template";
    if (sceneTask !== (task.semanticId !== null)) {
      context.addIssue({
        code: "custom",
        message: "Only Scene plan tasks have a semanticId.",
        path: ["tasks", index, "semanticId"],
      });
    }
  }
    const agentKinds = new Set(["scene-owner", "global-visual-owner", "cover-owner"]);
    const expected = {
      reusedTaskCount: plan.tasks.filter(({ status }) => status === "reused").length,
      dirtyAgentTaskCount: plan.tasks.filter(({ status, taskKind }) => status !== "reused" && agentKinds.has(taskKind)).length,
      dirtyFixedTaskCount: plan.tasks.filter(({ status, taskKind }) => status !== "reused" && status !== "blocked" && !agentKinds.has(taskKind)).length,
      blockedTaskCount: plan.tasks.filter(({ status }) => status === "blocked").length,
    };
    for (const key of Object.keys(expected) as Array<keyof typeof expected>) {
      if (plan.summary[key] !== expected[key]) {
        context.addIssue({ code: "custom", message: "Plan summary is stale.", path: ["summary", key] });
      }
    }
};

const PlanInputSchema = z
  .object(PlanInputShape)
  .strict()
  .superRefine((plan, context) => {
    validatePlanInput(plan, context);
  })
  .readonly();

export const ProducerPlanSchema = z
  .object({ ...PlanInputShape, planFingerprint: Sha256DigestSchema })
  .strict()
  .superRefine((plan, context) => {
    validatePlanInput(plan, context);
    const { planFingerprint, ...input } = plan;
    const expected = createFingerprint({ namespace: "producer-plan", version: 1, value: input });
    if (planFingerprint !== expected) {
      context.addIssue({ code: "custom", message: "Producer plan fingerprint is stale.", path: ["planFingerprint"] });
    }
  })
  .readonly();

export const buildProducerPlan = (rawInput: unknown) => {
  const input = PlanInputSchema.parse({
    ...(rawInput as Record<string, unknown>),
    schemaVersion: 1,
    contractVersion: PRODUCER_PLAN_VERSION,
  });
  return ProducerPlanSchema.parse({
    ...input,
    planFingerprint: createFingerprint({ namespace: "producer-plan", version: 1, value: input }),
  });
};

export type ProducerPlan = z.infer<typeof ProducerPlanSchema>;

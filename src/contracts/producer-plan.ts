import { z } from "zod";

import { createFingerprint } from "./fingerprint";
import {
  NonNegativeIntegerSchema,
  Sha256DigestSchema,
  StoryIdSchema,
} from "./primitives";
import {
  TaskDecisionExplanationListSchema,
  validateTaskExplanationStoryBinding,
} from "./production-inspection";
import { ProductionRevisionIdSchema } from "./production-revision";

export const PRODUCER_PLAN_VERSION = "producer-plan-v2" as const;

const PlanInputShape = {
  schemaVersion: z.literal(2),
  contractVersion: z.literal(PRODUCER_PLAN_VERSION),
  storyId: StoryIdSchema,
  revisionId: ProductionRevisionIdSchema,
  artifactSetFingerprint: Sha256DigestSchema,
  tasks: TaskDecisionExplanationListSchema,
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

type PlanInput = z.infer<ReturnType<typeof z.object<typeof PlanInputShape>>>;

const validatePlanInput = (plan: PlanInput, context: z.RefinementCtx) => {
  validateTaskExplanationStoryBinding({
    storyId: plan.storyId,
    tasks: plan.tasks,
    context,
  });
  plan.tasks.forEach((task, index) => {
    if (task.taskRevision === null) {
      context.addIssue({
        code: "custom",
        message: "A ProducerPlan task must bind a TaskRevision.",
        path: ["tasks", index, "taskRevision"],
      });
    }
  });
  const agentKinds = new Set([
    "scene-owner",
    "global-visual-owner",
    "cover-owner",
  ]);
  const expected = {
    reusedTaskCount: plan.tasks.filter(({ action }) => action === "reuse")
      .length,
    dirtyAgentTaskCount: plan.tasks.filter(
      ({ action, taskKind }) =>
        action === "dispatch-agent" && agentKinds.has(taskKind),
    ).length,
    dirtyFixedTaskCount: plan.tasks.filter(({ action }) =>
      ["prepare-fixed", "converge"].includes(action),
    ).length,
    blockedTaskCount: plan.tasks.filter(({ action }) => action === "blocked")
      .length,
  };
  for (const key of Object.keys(expected) as Array<keyof typeof expected>) {
    if (plan.summary[key] !== expected[key]) {
      context.addIssue({
        code: "custom",
        message: "Plan summary is stale.",
        path: ["summary", key],
      });
    }
  }
  plan.tasks.forEach((task, index) => {
    if (
      task.action === "dispatch-agent" &&
      !agentKinds.has(task.taskKind)
    ) {
      context.addIssue({
        code: "custom",
        message: "Only Agent-owned tasks can be dispatched.",
        path: ["tasks", index, "action"],
      });
    }
    if (
      task.action === "converge" &&
      !["composition-convergence", "delivery-build"].includes(task.taskKind)
    ) {
      context.addIssue({
        code: "custom",
        message: "Only convergence tasks can use the converge action.",
        path: ["tasks", index, "action"],
      });
    }
  });
};

const PlanInputSchema = z
  .object(PlanInputShape)
  .strict()
  .superRefine(validatePlanInput)
  .readonly();

export const ProducerPlanSchema = z
  .object({ ...PlanInputShape, planFingerprint: Sha256DigestSchema })
  .strict()
  .superRefine((plan, context) => {
    validatePlanInput(plan, context);
    const { planFingerprint, ...input } = plan;
    const expected = createFingerprint({
      namespace: "producer-plan",
      version: 2,
      value: input,
    });
    if (planFingerprint !== expected) {
      context.addIssue({
        code: "custom",
        message: "Producer plan fingerprint is stale.",
        path: ["planFingerprint"],
      });
    }
  })
  .readonly();

export const buildProducerPlan = (rawInput: unknown) => {
  const { planFingerprint: _ignoredPlanFingerprint, ...raw } = rawInput as Record<
    string,
    unknown
  >;
  void _ignoredPlanFingerprint;
  const input = PlanInputSchema.parse({
    ...raw,
    schemaVersion: 2,
    contractVersion: PRODUCER_PLAN_VERSION,
  });
  return ProducerPlanSchema.parse({
    ...input,
    planFingerprint: createFingerprint({
      namespace: "producer-plan",
      version: 2,
      value: input,
    }),
  });
};

export type ProducerPlan = z.infer<typeof ProducerPlanSchema>;

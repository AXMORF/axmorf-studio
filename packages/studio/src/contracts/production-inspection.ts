import { z } from "zod";

import {
  MeaningIdSchema,
  NonNegativeIntegerSchema,
  StoryIdSchema,
  TtsChunkIdSchema,
} from "./primitives";
import { ProductionRevisionIdSchema } from "./production-revision";
import { ProducerTaskKindSchema, TaskRevisionSchema } from "./producer-task";

export const PRODUCTION_INSPECTION_VERSION = "production-inspection-v1" as const;

export const DiagnosticInputIdSchema = z.enum([
  "beat",
  "brief",
  "cover-spec",
  "generation-input",
  "mastering-policy",
  "narration",
  "provider-attempt",
  "publishing",
  "readability",
  "render",
  "requirements",
  "resources",
  "runtime",
  "sound",
  "story",
  "template-instance",
  "timing",
  "tts-chunk",
  "visual-style",
]);

const StableSubjectIdSchema = z
  .string()
  .min(1)
  .max(96)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);

export const DiagnosticSubjectSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("meaning"), id: MeaningIdSchema }).strict().readonly(),
  z.object({ kind: z.literal("tts-chunk"), id: TtsChunkIdSchema }).strict().readonly(),
  z.object({ kind: z.literal("project"), id: StoryIdSchema }).strict().readonly(),
]);

export const ArtifactStateSchema = z.enum([
  "valid",
  "missing",
  "manifest-invalid",
  "identity-mismatch",
  "exact-set-drift",
  "checksum-drift",
  "unsafe-path",
]);

export const TaskDecisionActionSchema = z.enum([
  "reuse",
  "dispatch-agent",
  "prepare-fixed",
  "blocked",
  "converge",
]);

export const TaskDirectChangeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("input"), id: DiagnosticInputIdSchema }).strict().readonly(),
  z.object({ kind: z.literal("validator"), id: z.literal("validator-policy") }).strict().readonly(),
  z
    .object({
      kind: z.literal("declared-io"),
      id: z.enum(["declared-read-set", "declared-output-set"]),
    })
    .strict()
    .readonly(),
]);

export const TaskDependencyChangeSchema = z
  .object({
    taskKind: ProducerTaskKindSchema,
    subjectId: StableSubjectIdSchema,
    taskRevision: TaskRevisionSchema.nullable(),
  })
  .strict()
  .readonly();

const compareDirectChange = (
  left: z.infer<typeof TaskDirectChangeSchema>,
  right: z.infer<typeof TaskDirectChangeSchema>,
) => `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`);

const compareDependencyChange = (
  left: z.infer<typeof TaskDependencyChangeSchema>,
  right: z.infer<typeof TaskDependencyChangeSchema>,
) =>
  `${left.taskKind}:${left.subjectId}:${left.taskRevision ?? ""}`.localeCompare(
    `${right.taskKind}:${right.subjectId}:${right.taskRevision ?? ""}`,
  );

const assertSortedUnique = <T>({
  values,
  compare,
  key,
  context,
  path,
}: {
  readonly values: readonly T[];
  readonly compare: (left: T, right: T) => number;
  readonly key: (value: T) => string;
  readonly context: z.RefinementCtx;
  readonly path: readonly (string | number)[];
}) => {
  const sorted = [...values].sort(compare);
  if (
    values.some((value, index) => compare(value, sorted[index] as T) !== 0) ||
    new Set(values.map(key)).size !== values.length
  ) {
    context.addIssue({
      code: "custom",
      message: "Diagnostic values must be sorted and unique.",
      path: [...path],
    });
  }
};

const expectedSubjectKind = (
  taskKind: z.infer<typeof ProducerTaskKindSchema>,
) => {
  if (taskKind === "narration-chunk") return "tts-chunk" as const;
  if (taskKind === "scene-owner" || taskKind === "scene-template") {
    return "meaning" as const;
  }
  return "project" as const;
};

export const TaskDecisionExplanationSchema = z
  .object({
    taskKind: ProducerTaskKindSchema,
    subject: DiagnosticSubjectSchema,
    taskRevision: TaskRevisionSchema.nullable(),
    baselineTaskRevision: TaskRevisionSchema.nullable(),
    action: TaskDecisionActionSchema,
    artifactState: ArtifactStateSchema,
    directChanges: z.array(TaskDirectChangeSchema).readonly(),
    dependencyChanges: z.array(TaskDependencyChangeSchema).readonly(),
    blockedBy: z.array(TaskDependencyChangeSchema).readonly(),
    explanationAvailability: z.enum(["complete", "baseline-unavailable"]),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.subject.kind !== expectedSubjectKind(value.taskKind)) {
      context.addIssue({
        code: "custom",
        message: "Diagnostic subject kind does not match task kind.",
        path: ["subject", "kind"],
      });
    }
    if ((value.action === "blocked") !== (value.blockedBy.length > 0)) {
      context.addIssue({
        code: "custom",
        message: "Only blocked decisions bind blocking dependencies.",
        path: ["blockedBy"],
      });
    }
    if (value.action === "reuse" && value.artifactState !== "valid") {
      context.addIssue({
        code: "custom",
        message: "Only a valid artifact can be reused.",
        path: ["artifactState"],
      });
    }
    if (
      value.explanationAvailability === "baseline-unavailable" &&
      (value.baselineTaskRevision !== null ||
        value.directChanges.length > 0 ||
        value.dependencyChanges.length > 0)
    ) {
      context.addIssue({
        code: "custom",
        message: "Unavailable baselines cannot claim comparative changes.",
        path: ["explanationAvailability"],
      });
    }
    assertSortedUnique({
      values: value.directChanges,
      compare: compareDirectChange,
      key: (change) => `${change.kind}:${change.id}`,
      context,
      path: ["directChanges"],
    });
    for (const field of ["dependencyChanges", "blockedBy"] as const) {
      assertSortedUnique({
        values: value[field],
        compare: compareDependencyChange,
        key: (change) => `${change.taskKind}:${change.subjectId}`,
        context,
        path: [field],
      });
    }
  })
  .readonly();

export const taskDecisionSortKey = (
  decision: z.infer<typeof TaskDecisionExplanationSchema>,
) =>
  decision.taskRevision ??
  `unplanned:${decision.taskKind}:${decision.subject.kind}:${decision.subject.id}`;

export const TaskDecisionExplanationListSchema = z
  .array(TaskDecisionExplanationSchema)
  .superRefine((values, context) => {
    const keys = values.map(taskDecisionSortKey);
    const sorted = [...keys].sort();
    if (
      keys.some((key, index) => key !== sorted[index]) ||
      new Set(keys).size !== keys.length
    ) {
      context.addIssue({
        code: "custom",
        message: "Task explanations must be sorted and unique.",
      });
    }
    const subjects = values.map(
      ({ taskKind, subject }) => `${taskKind}:${subject.kind}:${subject.id}`,
    );
    if (new Set(subjects).size !== subjects.length) {
      context.addIssue({
        code: "custom",
        message: "Task diagnostic subjects must be unique per task kind.",
      });
    }
  })
  .readonly();

export const validateTaskExplanationStoryBinding = ({
  storyId,
  tasks,
  context,
  path = ["tasks"],
}: {
  readonly storyId: string;
  readonly tasks: readonly z.infer<typeof TaskDecisionExplanationSchema>[];
  readonly context: z.RefinementCtx;
  readonly path?: readonly (string | number)[];
}) => {
  tasks.forEach((task, index) => {
    if (task.subject.kind === "project" && task.subject.id !== storyId) {
      context.addIssue({
        code: "custom",
        message: "Project diagnostic subject is cross-story.",
        path: [...path, index, "subject", "id"],
      });
    }
  });
};

const DeliveryMediaSchema = z.enum(["video", "cover-4x3", "cover-3x4"]);

export const DeliveryMediaListSchema = z
  .array(DeliveryMediaSchema)
  .max(3)
  .superRefine((media, context) => {
    const expected = ["video", "cover-4x3", "cover-3x4"].filter((value) =>
      media.includes(value as z.infer<typeof DeliveryMediaSchema>),
    );
    if (
      expected.length !== media.length ||
      media.some((value, index) => value !== expected[index])
    ) {
      context.addIssue({
        code: "custom",
        message: "Delivery media must be sorted and unique.",
      });
    }
  })
  .readonly();

export const EstimatedProductionCostSchema = z
  .object({
    providerRequests: NonNegativeIntegerSchema.nullable(),
    providerCacheHits: NonNegativeIntegerSchema,
    agentTasks: NonNegativeIntegerSchema.nullable(),
    deliveryMedia: DeliveryMediaListSchema.nullable(),
  })
  .strict()
  .readonly();

export const ActualProductionCostSchema = z
  .object({
    providerRequests: NonNegativeIntegerSchema,
    providerCacheHits: NonNegativeIntegerSchema,
    agentTasks: NonNegativeIntegerSchema,
    deliveryMedia: DeliveryMediaListSchema,
  })
  .strict()
  .readonly();

export const ProductionInspectionSchema = z
  .object({
    schemaVersion: z.literal(1),
    contractVersion: z.literal(PRODUCTION_INSPECTION_VERSION),
    storyId: StoryIdSchema,
    sourceState: z.enum([
      "configured-authoring",
      "timing-ready",
      "production-inputs-ready",
    ]),
    currentRevisionId: ProductionRevisionIdSchema.nullable(),
    baseline: z
      .object({
        kind: z.enum(["current-delivery", "latest-verified-attempt", "none"]),
        revisionId: ProductionRevisionIdSchema.nullable(),
      })
      .strict()
      .readonly(),
    estimatedCost: EstimatedProductionCostSchema,
    tasks: TaskDecisionExplanationListSchema,
    nextAction: z.enum([
      "complete-authoring",
      "prepare-narration",
      "prepare-production",
      "converge-current",
    ]),
  })
  .strict()
  .superRefine((inspection, context) => {
    if (
      (inspection.baseline.kind === "none") !==
      (inspection.baseline.revisionId === null)
    ) {
      context.addIssue({
        code: "custom",
        message: "A diagnostic baseline kind and Revision must be present together.",
        path: ["baseline"],
      });
    }
    if (
      inspection.sourceState === "production-inputs-ready" &&
      inspection.currentRevisionId === null
    ) {
      context.addIssue({
        code: "custom",
        message: "Ready production inputs require a current Revision.",
        path: ["currentRevisionId"],
      });
    }
    validateTaskExplanationStoryBinding({
      storyId: inspection.storyId,
      tasks: inspection.tasks,
      context,
    });
  })
  .readonly();

export type DiagnosticInputId = z.infer<typeof DiagnosticInputIdSchema>;
export type DiagnosticSubject = z.infer<typeof DiagnosticSubjectSchema>;
export type ArtifactState = z.infer<typeof ArtifactStateSchema>;
export type TaskDecisionExplanation = z.infer<
  typeof TaskDecisionExplanationSchema
>;
export type ProductionInspection = z.infer<typeof ProductionInspectionSchema>;
export type EstimatedProductionCost = z.infer<
  typeof EstimatedProductionCostSchema
>;
export type ActualProductionCost = z.infer<typeof ActualProductionCostSchema>;

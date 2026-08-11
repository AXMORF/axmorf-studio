import { z } from "zod";

import { createFingerprint } from "./fingerprint";
import {
  MeaningIdSchema,
  PositiveIntegerSchema,
  Sha256DigestSchema,
  StoryIdSchema,
} from "./primitives";
import { NarrationExecutionSnapshotSchema } from "./narration-execution";

export const PRODUCTION_RUN_CONTRACT_VERSION =
  "production-run-current-v2" as const;
export const PRODUCTION_EVENT_CONTRACT_VERSION =
  "production-stage-event-current-v2" as const;
export const PRODUCTION_STATE_CONTRACT_VERSION =
  "production-run-state-current-v2" as const;

export const PRODUCTION_STAGE_IDS = [
  "production-start",
  "narrative",
  "scene-freeze",
  "scenes",
  "render-ready",
] as const;

export const PRODUCTION_RUN_STATES = [
  "initialized",
  "narrative-running",
  "baseline-ready",
  "scene-inputs-frozen",
  "waiting-for-owner-results",
  "render-ready-running",
  "render-ready",
  "failed",
] as const;

export const ProductionRunIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
  .brand<"ProductionRunId">();

export const ProductionStageIdSchema = z.enum(PRODUCTION_STAGE_IDS);
export const ProductionRunStateNameSchema = z.enum(PRODUCTION_RUN_STATES);

const StableCommandIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9][a-z0-9:.-]*$/u);

const StableArtifactIdSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/u);

const SafeRepositoryPathSchema = z
  .string()
  .min(1)
  .max(512)
  .refine(
    (value) =>
      !value.startsWith("/") &&
      !value.includes("\\") &&
      !value.split("/").includes("..") &&
      !value.includes("://"),
    "Production artifact paths must be repository-relative.",
  );

const IsoTimestampSchema = z.string().datetime({ offset: true });

export const ProductionFingerprintRefSchema = z
  .object({
    artifactId: StableArtifactIdSchema,
    fingerprint: Sha256DigestSchema,
  })
  .strict()
  .readonly();

export const ProductionOutputArtifactSchema = z
  .object({
    artifactId: StableArtifactIdSchema,
    repositoryPath: SafeRepositoryPathSchema,
    fingerprint: Sha256DigestSchema,
  })
  .strict()
  .readonly();

const addUniqueArtifactIssues = (
  references: readonly { readonly artifactId: string }[],
  context: z.RefinementCtx,
  path: PropertyKey,
) => {
  const ids = references.map(({ artifactId }) => artifactId);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({
      code: "custom",
      message: "Production artifact identities must be unique.",
      path: [path],
    });
  }
};

export const ProductionRunPolicySchema = z
  .object({
    pollIntervalMs: PositiveIntegerSchema.max(60_000),
  })
  .strict()
  .readonly();

export const DEFAULT_PRODUCTION_RUN_POLICY = ProductionRunPolicySchema.parse({
  pollIntervalMs: 1_000,
});

const ProductionRunManifestInputObject = z
  .object({
    schemaVersion: z.literal(1),
    contractVersion: z.literal(PRODUCTION_RUN_CONTRACT_VERSION),
    runId: ProductionRunIdSchema,
    storyId: StoryIdSchema,
    requirementsPath: SafeRepositoryPathSchema,
    requirementsFingerprint: Sha256DigestSchema,
    narrationExecution: NarrationExecutionSnapshotSchema.optional(),
    policy: ProductionRunPolicySchema,
    createdAt: IsoTimestampSchema,
  })
  .strict()
  .superRefine((run, context) => {
    if (
      run.requirementsPath !==
      `src/projects/${run.storyId}/production/requirements.json`
    ) {
      context.addIssue({
        code: "custom",
        message: "Production run requirements path is not current.",
        path: ["requirementsPath"],
      });
    }
  });

export const ProductionRunManifestInputSchema =
  ProductionRunManifestInputObject.readonly();

export const computeProductionRunFingerprint = (rawInput: unknown) => {
  const record = { ...(rawInput as Record<string, unknown>) };
  delete record.runFingerprint;
  const input = ProductionRunManifestInputSchema.parse(record);
  return createFingerprint({
    namespace: "production-run-manifest",
    version: 1,
    value: input,
  });
};

export const ProductionRunManifestSchema = ProductionRunManifestInputObject.extend({
  runFingerprint: Sha256DigestSchema,
})
  .strict()
  .superRefine((run, context) => {
    const { runFingerprint, ...input } = run;
    if (runFingerprint !== computeProductionRunFingerprint(input)) {
      context.addIssue({
        code: "custom",
        message: "Production run fingerprint is stale.",
        path: ["runFingerprint"],
      });
    }
  })
  .readonly();

export const createProductionRunManifest = (rawInput: unknown) => {
  const input = ProductionRunManifestInputSchema.parse({
    ...(rawInput as Record<string, unknown>),
    schemaVersion: 1,
    contractVersion: PRODUCTION_RUN_CONTRACT_VERSION,
  });
  return ProductionRunManifestSchema.parse({
    ...input,
    runFingerprint: computeProductionRunFingerprint(input),
  });
};

const UNSAFE_PERSISTED_ERROR_PATTERN =
  /(?:Bearer\s+\S+|https?:\/\/|(?:^|\s)\/(?:home|data|srv|tmp|Users|var|etc|opt)\/|[A-Za-z]:\\|(?:api[-_ ]?key|access[-_ ]?token|auth[-_ ]?token|provider[-_ ]?endpoint)\s*[=:]|(?:^|\n)\s*at\s|\bstack\b|\bcause\b)/iu;

const SafePersistedErrorTextSchema = (maximum: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maximum)
    .refine(
      (value) =>
        !value.includes("\n") &&
        !value.includes("\r") &&
        !UNSAFE_PERSISTED_ERROR_PATTERN.test(value),
      "Persisted ProductionError text contains unsafe diagnostics.",
    );

const ProductionErrorInputObject = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.enum(["expected", "unexpected"]),
    code: z.string().regex(/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/u).max(96),
    stageId: ProductionStageIdSchema,
    scope: z.enum([
      "run",
      "narrative",
      "scene",
      "global-visual",
      "render-ready",
    ]),
    meaningId: MeaningIdSchema.nullable(),
    summary: SafePersistedErrorTextSchema(240),
    description: SafePersistedErrorTextSchema(1_200),
    retryable: z.boolean(),
    remediation: SafePersistedErrorTextSchema(600).nullable(),
    commandId: StableCommandIdSchema,
    inputFingerprint: Sha256DigestSchema,
    redactionApplied: z.boolean(),
  })
  .strict()
  .superRefine((error, context) => {
    if ((error.scope === "scene") !== (error.meaningId !== null)) {
      context.addIssue({
        code: "custom",
        message: "Only Scene-scoped errors bind a meaningId.",
        path: ["meaningId"],
      });
    }
    if (
      error.scope === "global-visual" &&
      (error.stageId !== "scenes" || error.meaningId !== null)
    ) {
      context.addIssue({
        code: "custom",
        message: "GlobalVisual errors belong to the scenes stage.",
        path: ["scope"],
      });
    }
    if (error.kind === "unexpected" && error.code !== "UNEXPECTED") {
      context.addIssue({
        code: "custom",
        message: "Unexpected ProductionError must use the UNEXPECTED code.",
        path: ["code"],
      });
    }
  });

export const ProductionErrorInputSchema = ProductionErrorInputObject.readonly();

export const computeProductionErrorFingerprint = (rawInput: unknown) => {
  const record = { ...(rawInput as Record<string, unknown>) };
  delete record.errorFingerprint;
  const input = ProductionErrorInputSchema.parse(record);
  return createFingerprint({
    namespace: "production-error",
    version: 1,
    value: input,
  });
};

export const ProductionErrorSchema = ProductionErrorInputObject.extend({
  errorFingerprint: Sha256DigestSchema,
})
  .strict()
  .superRefine((error, context) => {
    const { errorFingerprint, ...input } = error;
    if (errorFingerprint !== computeProductionErrorFingerprint(input)) {
      context.addIssue({
        code: "custom",
        message: "ProductionError fingerprint is stale.",
        path: ["errorFingerprint"],
      });
    }
  })
  .readonly();

export const createProductionError = (rawInput: unknown) => {
  const input = ProductionErrorInputSchema.parse({
    ...(rawInput as Record<string, unknown>),
    schemaVersion: 1,
  });
  return ProductionErrorSchema.parse({
    ...input,
    errorFingerprint: computeProductionErrorFingerprint(input),
  });
};

const EventCommonShape = {
  schemaVersion: z.literal(1),
  eventVersion: z.literal(PRODUCTION_EVENT_CONTRACT_VERSION),
  runId: ProductionRunIdSchema,
  storyId: StoryIdSchema,
  sequence: PositiveIntegerSchema,
  eventId: z.string().min(1).max(128).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
  stageId: ProductionStageIdSchema,
  attempt: PositiveIntegerSchema.max(10_000),
  occurredAt: IsoTimestampSchema,
  commandId: StableCommandIdSchema,
  previousStateFingerprint: Sha256DigestSchema,
  inputFingerprints: z
    .array(ProductionFingerprintRefSchema)
    .min(1)
    .max(128)
    .readonly(),
} as const;

const eventInputObjects = [
  z.object({ ...EventCommonShape, type: z.literal("stage-started") }).strict(),
  z
    .object({
      ...EventCommonShape,
      type: z.literal("stage-succeeded"),
      outputArtifacts: z
        .array(ProductionOutputArtifactSchema)
        .min(1)
        .max(128)
        .readonly(),
    })
    .strict(),
  z
    .object({
      ...EventCommonShape,
      type: z.literal("stage-failed"),
      error: ProductionErrorSchema,
    })
    .strict(),
  z
    .object({
      ...EventCommonShape,
      type: z.literal("scene-result-accepted"),
      stageId: z.literal("scenes"),
      meaningId: MeaningIdSchema,
      sceneResultFingerprint: Sha256DigestSchema,
      outputArtifacts: z.array(ProductionOutputArtifactSchema).length(1).readonly(),
    })
    .strict(),
  z
    .object({
      ...EventCommonShape,
      type: z.literal("global-visual-result-accepted"),
      stageId: z.literal("scenes"),
      globalVisualResultFingerprint: Sha256DigestSchema,
      outputArtifacts: z.array(ProductionOutputArtifactSchema).length(1).readonly(),
    })
    .strict(),
  z
    .object({
      ...EventCommonShape,
      type: z.literal("render-ready"),
      stageId: z.literal("render-ready"),
      outputArtifacts: z
        .array(ProductionOutputArtifactSchema)
        .min(2)
        .max(8)
        .readonly(),
      status: z.literal("render-ready"),
      handoff: z.literal("awaiting-automatic-delivery"),
    })
    .strict(),
] as const;

const ProductionStageEventInputUnion = z.discriminatedUnion(
  "type",
  eventInputObjects,
);

export const ProductionStageEventInputSchema =
  ProductionStageEventInputUnion.superRefine((event, context) => {
    addUniqueArtifactIssues(
      event.inputFingerprints,
      context,
      "inputFingerprints",
    );
    if ("outputArtifacts" in event) {
      addUniqueArtifactIssues(event.outputArtifacts, context, "outputArtifacts");
    }
    if (
      event.type === "stage-failed" &&
      (event.error.stageId !== event.stageId ||
        event.error.commandId !== event.commandId)
    ) {
      context.addIssue({
        code: "custom",
        message: "Failed stage event and ProductionError identities must match.",
        path: ["error"],
      });
    }
  }).readonly();

export const computeProductionStageEventFingerprint = (rawInput: unknown) => {
  const record = { ...(rawInput as Record<string, unknown>) };
  delete record.eventFingerprint;
  const input = ProductionStageEventInputSchema.parse(record);
  return createFingerprint({
    namespace: "production-stage-event",
    version: 1,
    value: input,
  });
};

const withEventFingerprint = <Shape extends z.ZodRawShape>(shape: Shape) =>
  z.object({ ...shape, eventFingerprint: Sha256DigestSchema }).strict();

const ProductionStageEventUnion = z.discriminatedUnion("type", [
  withEventFingerprint({ ...EventCommonShape, type: z.literal("stage-started") }),
  withEventFingerprint({
    ...EventCommonShape,
    type: z.literal("stage-succeeded"),
    outputArtifacts: z
      .array(ProductionOutputArtifactSchema)
      .min(1)
      .max(128)
      .readonly(),
  }),
  withEventFingerprint({
    ...EventCommonShape,
    type: z.literal("stage-failed"),
    error: ProductionErrorSchema,
  }),
  withEventFingerprint({
    ...EventCommonShape,
    type: z.literal("scene-result-accepted"),
    stageId: z.literal("scenes"),
    meaningId: MeaningIdSchema,
    sceneResultFingerprint: Sha256DigestSchema,
    outputArtifacts: z.array(ProductionOutputArtifactSchema).length(1).readonly(),
  }),
  withEventFingerprint({
    ...EventCommonShape,
    type: z.literal("global-visual-result-accepted"),
    stageId: z.literal("scenes"),
    globalVisualResultFingerprint: Sha256DigestSchema,
    outputArtifacts: z.array(ProductionOutputArtifactSchema).length(1).readonly(),
  }),
  withEventFingerprint({
    ...EventCommonShape,
    type: z.literal("render-ready"),
    stageId: z.literal("render-ready"),
    outputArtifacts: z
      .array(ProductionOutputArtifactSchema)
      .min(2)
      .max(8)
      .readonly(),
    status: z.literal("render-ready"),
    handoff: z.literal("awaiting-automatic-delivery"),
  }),
]);

export const ProductionStageEventSchema = ProductionStageEventUnion.superRefine(
  (event, context) => {
    const { eventFingerprint, ...input } = event;
    const parsed = ProductionStageEventInputSchema.safeParse(input);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        context.addIssue({ code: "custom", message: issue.message, path: issue.path });
      }
      return;
    }
    if (
      eventFingerprint !== computeProductionStageEventFingerprint(parsed.data)
    ) {
      context.addIssue({
        code: "custom",
        message: "Production stage event fingerprint is stale.",
        path: ["eventFingerprint"],
      });
    }
  },
).readonly();

const AcceptedSceneResultSchema = z
  .object({
    meaningId: MeaningIdSchema,
    resultFingerprint: Sha256DigestSchema,
  })
  .strict()
  .readonly();

const AcceptedGlobalVisualResultSchema = z
  .object({ resultFingerprint: Sha256DigestSchema })
  .strict()
  .readonly();

const ProductionRunStateInputObject = z
  .object({
    schemaVersion: z.literal(1),
    stateVersion: z.literal(PRODUCTION_STATE_CONTRACT_VERSION),
    runId: ProductionRunIdSchema,
    storyId: StoryIdSchema,
    runFingerprint: Sha256DigestSchema,
    state: ProductionRunStateNameSchema,
    lastSequence: z.number().int().nonnegative().safe(),
    lastEventFingerprint: Sha256DigestSchema.nullable(),
    inputFingerprints: z
      .array(ProductionFingerprintRefSchema)
      .min(1)
      .max(256)
      .readonly(),
    outputArtifacts: z
      .array(ProductionOutputArtifactSchema)
      .max(512)
      .readonly(),
    acceptedSceneResults: z.array(AcceptedSceneResultSchema).max(256).readonly(),
    acceptedGlobalVisualResult: AcceptedGlobalVisualResultSchema.nullable(),
    failure: ProductionErrorSchema.nullable(),
  })
  .strict()
  .superRefine((state, context) => {
    addUniqueArtifactIssues(state.inputFingerprints, context, "inputFingerprints");
    addUniqueArtifactIssues(state.outputArtifacts, context, "outputArtifacts");
    const meaningIds = state.acceptedSceneResults.map(({ meaningId }) => meaningId);
    if (new Set(meaningIds).size !== meaningIds.length) {
      context.addIssue({
        code: "custom",
        message: "A Scene result can be accepted only once.",
        path: ["acceptedSceneResults"],
      });
    }
    if ((state.state === "failed") !== (state.failure !== null)) {
      context.addIssue({
        code: "custom",
        message: "Only failed run state carries one ProductionError.",
        path: ["failure"],
      });
    }
    if ((state.lastSequence === 0) !== (state.lastEventFingerprint === null)) {
      context.addIssue({
        code: "custom",
        message: "Initial state is the only state without a last event.",
        path: ["lastEventFingerprint"],
      });
    }
  });

export const ProductionRunStateInputSchema =
  ProductionRunStateInputObject.readonly();

export const computeProductionRunStateFingerprint = (rawInput: unknown) => {
  const record = { ...(rawInput as Record<string, unknown>) };
  delete record.stateFingerprint;
  const input = ProductionRunStateInputSchema.parse(record);
  return createFingerprint({
    namespace: "production-run-state",
    version: 1,
    value: input,
  });
};

export const ProductionRunStateSchema = ProductionRunStateInputObject.extend({
  stateFingerprint: Sha256DigestSchema,
})
  .strict()
  .superRefine((state, context) => {
    const { stateFingerprint, ...input } = state;
    if (stateFingerprint !== computeProductionRunStateFingerprint(input)) {
      context.addIssue({
        code: "custom",
        message: "Production run state fingerprint is stale.",
        path: ["stateFingerprint"],
      });
    }
  })
  .readonly();

export const createProductionRunState = (rawInput: unknown) => {
  const input = ProductionRunStateInputSchema.parse({
    ...(rawInput as Record<string, unknown>),
    schemaVersion: 1,
    stateVersion: PRODUCTION_STATE_CONTRACT_VERSION,
  });
  return ProductionRunStateSchema.parse({
    ...input,
    stateFingerprint: computeProductionRunStateFingerprint(input),
  });
};

export type ProductionRunId = z.infer<typeof ProductionRunIdSchema>;
export type ProductionStageId = z.infer<typeof ProductionStageIdSchema>;
export type ProductionRunStateName = z.infer<typeof ProductionRunStateNameSchema>;
export type ProductionFingerprintRef = z.infer<typeof ProductionFingerprintRefSchema>;
export type ProductionOutputArtifact = z.infer<typeof ProductionOutputArtifactSchema>;
export type ProductionRunManifest = z.infer<typeof ProductionRunManifestSchema>;
export type ProductionRunPolicy = z.infer<typeof ProductionRunPolicySchema>;
export type ProductionError = z.infer<typeof ProductionErrorSchema>;
export type ProductionStageEvent = z.infer<typeof ProductionStageEventSchema>;
export type ProductionRunState = z.infer<typeof ProductionRunStateSchema>;

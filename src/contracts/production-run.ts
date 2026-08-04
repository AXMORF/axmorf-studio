import { z } from "zod";

import { createFingerprint } from "./fingerprint";
import {
  MeaningIdSchema,
  PositiveIntegerSchema,
  Sha256DigestSchema,
  StoryIdSchema,
} from "./primitives";

export const PRODUCTION_RUN_CONTRACT_VERSION = "production-run-v1" as const;
export const PRODUCTION_EVENT_CONTRACT_VERSION =
  "production-stage-event-v1" as const;
export const PRODUCTION_STATE_CONTRACT_VERSION =
  "production-run-state-v1" as const;

export const PRODUCTION_STAGE_IDS = [
  "production-start",
  "narrative",
  "scene-freeze",
  "scenes",
  "post-scene",
  "preview",
] as const;

export const PRODUCTION_RUN_STATES = [
  "initialized",
  "narrative-running",
  "baseline-ready",
  "scene-inputs-frozen",
  "scenes-running",
  "post-scene-running",
  "preview-ready",
  "failed",
] as const;

export const ProductionRunIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .brand<"ProductionRunId">();

export const ProductionStageIdSchema = z.enum(PRODUCTION_STAGE_IDS);
export const ProductionRunStateNameSchema = z.enum(PRODUCTION_RUN_STATES);

const StableCommandIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9][a-z0-9:.-]*$/);

const StableArtifactIdSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/);

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

const ProductionRunPolicySchema = z
  .object({
    pollIntervalMs: PositiveIntegerSchema.max(60_000),
    sceneTimeoutMs: PositiveIntegerSchema.max(7 * 24 * 60 * 60 * 1_000),
  })
  .strict()
  .refine((policy) => policy.sceneTimeoutMs >= policy.pollIntervalMs, {
    message: "Scene timeout must not be shorter than the poll interval.",
    path: ["sceneTimeoutMs"],
  })
  .readonly();

const ProductionRunManifestInputObject = z
  .object({
    schemaVersion: z.literal(1),
    contractVersion: z.literal(PRODUCTION_RUN_CONTRACT_VERSION),
    runId: ProductionRunIdSchema,
    storyId: StoryIdSchema,
    requirementsPath: SafeRepositoryPathSchema,
    requirementsFingerprint: Sha256DigestSchema,
    policy: ProductionRunPolicySchema,
    createdAt: IsoTimestampSchema,
  })
  .strict()
  .superRefine((run, context) => {
    const expected = `src/projects/${run.storyId}/production/requirements.json`;
    if (run.requirementsPath !== expected) {
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
  if (
    rawInput === null ||
    typeof rawInput !== "object" ||
    Array.isArray(rawInput)
  ) {
    return ProductionRunManifestInputSchema.parse(rawInput);
  }
  const inputRecord = { ...(rawInput as Record<string, unknown>) };
  delete inputRecord.runFingerprint;
  const input = ProductionRunManifestInputSchema.parse(inputRecord);
  return createFingerprint({
    namespace: "production-run-manifest",
    version: 1,
    value: input,
  });
};

const ProductionRunManifestObject = z
  .object({
    schemaVersion: z.literal(1),
    contractVersion: z.literal(PRODUCTION_RUN_CONTRACT_VERSION),
    runId: ProductionRunIdSchema,
    storyId: StoryIdSchema,
    requirementsPath: SafeRepositoryPathSchema,
    requirementsFingerprint: Sha256DigestSchema,
    policy: ProductionRunPolicySchema,
    createdAt: IsoTimestampSchema,
    runFingerprint: Sha256DigestSchema,
  })
  .strict();

export const ProductionRunManifestSchema =
  ProductionRunManifestObject.superRefine((run, context) => {
    const { runFingerprint, ...input } = run;
    const expectedPath = `src/projects/${run.storyId}/production/requirements.json`;
    if (run.requirementsPath !== expectedPath) {
      context.addIssue({
        code: "custom",
        message: "Production run requirements path is not current.",
        path: ["requirementsPath"],
      });
    }
    let expectedFingerprint;
    try {
      expectedFingerprint = computeProductionRunFingerprint(input);
    } catch {
      return;
    }
    if (runFingerprint !== expectedFingerprint) {
      context.addIssue({
        code: "custom",
        message: "Production run fingerprint is stale.",
        path: ["runFingerprint"],
      });
    }
  }).readonly();

export const createProductionRunManifest = (rawInput: unknown) => {
  const inputRecord: Record<string, unknown> = {
    ...(rawInput as Record<string, unknown>),
    schemaVersion: 1,
    contractVersion: PRODUCTION_RUN_CONTRACT_VERSION,
  };
  delete inputRecord.runFingerprint;
  const input = ProductionRunManifestInputSchema.parse(inputRecord);
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
    code: z
      .string()
      .regex(/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/)
      .max(96),
    stageId: ProductionStageIdSchema,
    scope: z.enum(["run", "narrative", "scene", "post-scene", "preview"]),
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
    if (error.kind === "unexpected" && error.code !== "UNEXPECTED") {
      context.addIssue({
        code: "custom",
        message:
          "Unexpected ProductionError must use the stable UNEXPECTED code.",
        path: ["code"],
      });
    }
  });

export const ProductionErrorInputSchema = ProductionErrorInputObject.readonly();

export const computeProductionErrorFingerprint = (rawInput: unknown) => {
  if (
    rawInput === null ||
    typeof rawInput !== "object" ||
    Array.isArray(rawInput)
  ) {
    return ProductionErrorInputSchema.parse(rawInput);
  }
  const inputRecord = { ...(rawInput as Record<string, unknown>) };
  delete inputRecord.errorFingerprint;
  const input = ProductionErrorInputSchema.parse(inputRecord);
  return createFingerprint({
    namespace: "production-error",
    version: 1,
    value: input,
  });
};

const ProductionErrorObject = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.enum(["expected", "unexpected"]),
    code: z
      .string()
      .regex(/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/)
      .max(96),
    stageId: ProductionStageIdSchema,
    scope: z.enum(["run", "narrative", "scene", "post-scene", "preview"]),
    meaningId: MeaningIdSchema.nullable(),
    summary: SafePersistedErrorTextSchema(240),
    description: SafePersistedErrorTextSchema(1_200),
    retryable: z.boolean(),
    remediation: SafePersistedErrorTextSchema(600).nullable(),
    commandId: StableCommandIdSchema,
    inputFingerprint: Sha256DigestSchema,
    redactionApplied: z.boolean(),
    errorFingerprint: Sha256DigestSchema,
  })
  .strict();

export const ProductionErrorSchema = ProductionErrorObject.superRefine(
  (error, context) => {
    const { errorFingerprint, ...input } = error;
    const parsed = ProductionErrorInputSchema.safeParse(input);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        context.addIssue({
          code: "custom",
          message: issue.message,
          path: issue.path,
        });
      }
      return;
    }
    if (errorFingerprint !== computeProductionErrorFingerprint(parsed.data)) {
      context.addIssue({
        code: "custom",
        message: "ProductionError fingerprint is stale.",
        path: ["errorFingerprint"],
      });
    }
  },
).readonly();

export const createProductionError = (rawInput: unknown) => {
  const inputRecord: Record<string, unknown> = {
    ...(rawInput as Record<string, unknown>),
    schemaVersion: 1,
  };
  delete inputRecord.errorFingerprint;
  const input = ProductionErrorInputSchema.parse(inputRecord);
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
  eventId: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
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

const StageStartedEventInputObject = z
  .object({ ...EventCommonShape, type: z.literal("stage-started") })
  .strict();
const StageSucceededEventInputObject = z
  .object({
    ...EventCommonShape,
    type: z.literal("stage-succeeded"),
    outputArtifacts: z
      .array(ProductionOutputArtifactSchema)
      .min(1)
      .max(128)
      .readonly(),
  })
  .strict();
const StageFailedEventInputObject = z
  .object({
    ...EventCommonShape,
    type: z.literal("stage-failed"),
    error: ProductionErrorSchema,
  })
  .strict();
const SceneResultAcceptedEventInputObject = z
  .object({
    ...EventCommonShape,
    type: z.literal("scene-result-accepted"),
    stageId: z.literal("scenes"),
    meaningId: MeaningIdSchema,
    sceneResultFingerprint: Sha256DigestSchema,
    outputArtifacts: z
      .array(ProductionOutputArtifactSchema)
      .min(1)
      .max(32)
      .readonly(),
  })
  .strict();
const PreviewReadyEventInputObject = z
  .object({
    ...EventCommonShape,
    type: z.literal("preview-ready"),
    stageId: z.literal("preview"),
    outputArtifacts: z
      .array(ProductionOutputArtifactSchema)
      .min(1)
      .max(128)
      .readonly(),
    status: z.literal("preview-ready"),
    handoff: z.literal("awaiting explicit user preview decision"),
  })
  .strict();

const ProductionStageEventInputUnion = z.discriminatedUnion("type", [
  StageStartedEventInputObject,
  StageSucceededEventInputObject,
  StageFailedEventInputObject,
  SceneResultAcceptedEventInputObject,
  PreviewReadyEventInputObject,
]);

const addEventInputIssues = (
  event: z.infer<typeof ProductionStageEventInputUnion>,
  context: z.RefinementCtx,
) => {
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
};

export const ProductionStageEventInputSchema =
  ProductionStageEventInputUnion.superRefine(addEventInputIssues).readonly();

export const computeProductionStageEventFingerprint = (rawInput: unknown) => {
  if (
    rawInput === null ||
    typeof rawInput !== "object" ||
    Array.isArray(rawInput)
  ) {
    return ProductionStageEventInputSchema.parse(rawInput);
  }
  const inputRecord = { ...(rawInput as Record<string, unknown>) };
  delete inputRecord.eventFingerprint;
  const input = ProductionStageEventInputSchema.parse(inputRecord);
  return createFingerprint({
    namespace: "production-stage-event",
    version: 1,
    value: input,
  });
};

const withEventFingerprint = <Shape extends z.ZodRawShape>(shape: Shape) =>
  z.object({ ...shape, eventFingerprint: Sha256DigestSchema }).strict();

const ProductionStageEventUnion = z.discriminatedUnion("type", [
  withEventFingerprint({
    ...EventCommonShape,
    type: z.literal("stage-started"),
  }),
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
    outputArtifacts: z
      .array(ProductionOutputArtifactSchema)
      .min(1)
      .max(32)
      .readonly(),
  }),
  withEventFingerprint({
    ...EventCommonShape,
    type: z.literal("preview-ready"),
    stageId: z.literal("preview"),
    outputArtifacts: z
      .array(ProductionOutputArtifactSchema)
      .min(1)
      .max(128)
      .readonly(),
    status: z.literal("preview-ready"),
    handoff: z.literal("awaiting explicit user preview decision"),
  }),
]);

export const ProductionStageEventSchema = ProductionStageEventUnion.superRefine(
  (event, context) => {
    const { eventFingerprint, ...input } = event;
    const parsed = ProductionStageEventInputSchema.safeParse(input);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        context.addIssue({
          code: "custom",
          message: issue.message,
          path: issue.path,
        });
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
    acceptedSceneResults: z
      .array(AcceptedSceneResultSchema)
      .max(256)
      .readonly(),
    failure: ProductionErrorSchema.nullable(),
  })
  .strict()
  .superRefine((state, context) => {
    addUniqueArtifactIssues(
      state.inputFingerprints,
      context,
      "inputFingerprints",
    );
    addUniqueArtifactIssues(state.outputArtifacts, context, "outputArtifacts");
    const meaningIds = state.acceptedSceneResults.map(
      ({ meaningId }) => meaningId,
    );
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
  if (
    rawInput === null ||
    typeof rawInput !== "object" ||
    Array.isArray(rawInput)
  ) {
    return ProductionRunStateInputSchema.parse(rawInput);
  }
  const inputRecord = { ...(rawInput as Record<string, unknown>) };
  delete inputRecord.stateFingerprint;
  const input = ProductionRunStateInputSchema.parse(inputRecord);
  return createFingerprint({
    namespace: "production-run-state",
    version: 1,
    value: input,
  });
};

const ProductionRunStateObject = z
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
    acceptedSceneResults: z
      .array(AcceptedSceneResultSchema)
      .max(256)
      .readonly(),
    failure: ProductionErrorSchema.nullable(),
    stateFingerprint: Sha256DigestSchema,
  })
  .strict();

export const ProductionRunStateSchema = ProductionRunStateObject.superRefine(
  (state, context) => {
    const { stateFingerprint, ...input } = state;
    const parsed = ProductionRunStateInputSchema.safeParse(input);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        context.addIssue({
          code: "custom",
          message: issue.message,
          path: issue.path,
        });
      }
      return;
    }
    if (
      stateFingerprint !== computeProductionRunStateFingerprint(parsed.data)
    ) {
      context.addIssue({
        code: "custom",
        message: "Production run state fingerprint is stale.",
        path: ["stateFingerprint"],
      });
    }
  },
).readonly();

export const createProductionRunState = (rawInput: unknown) => {
  const inputRecord: Record<string, unknown> = {
    ...(rawInput as Record<string, unknown>),
    schemaVersion: 1,
    stateVersion: PRODUCTION_STATE_CONTRACT_VERSION,
  };
  delete inputRecord.stateFingerprint;
  const input = ProductionRunStateInputSchema.parse(inputRecord);
  return ProductionRunStateSchema.parse({
    ...input,
    stateFingerprint: computeProductionRunStateFingerprint(input),
  });
};

export type ProductionRunId = z.infer<typeof ProductionRunIdSchema>;
export type ProductionStageId = z.infer<typeof ProductionStageIdSchema>;
export type ProductionRunStateName = z.infer<
  typeof ProductionRunStateNameSchema
>;
export type ProductionFingerprintRef = z.infer<
  typeof ProductionFingerprintRefSchema
>;
export type ProductionOutputArtifact = z.infer<
  typeof ProductionOutputArtifactSchema
>;
export type ProductionRunManifest = z.infer<typeof ProductionRunManifestSchema>;
export type ProductionError = z.infer<typeof ProductionErrorSchema>;
export type ProductionStageEvent = z.infer<typeof ProductionStageEventSchema>;
export type ProductionRunState = z.infer<typeof ProductionRunStateSchema>;

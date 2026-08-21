import { z } from "zod";

export const EXECUTION_PREFERENCES_VERSION =
  "execution-preferences-v1" as const;
export const REPOSITORY_SUBAGENT_CONCURRENCY_CEILING = 4;
export const UNKNOWN_RUNTIME_SUBAGENT_CONCURRENCY = 1;

const ConfiguredConcurrencySchema = z.number().int().min(1).max(4);
const RequestedConcurrencySchema = z.number().int().min(1).max(1_000);
const RuntimeConcurrencySchema = z.number().int().nonnegative().safe();

export const CreativeTaskExecutionSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("inline") }).strict().readonly(),
  z
    .object({
      mode: z.literal("subagents"),
      maxConcurrency: ConfiguredConcurrencySchema,
    })
    .strict()
    .readonly(),
]);

export const ExecutionPreferencesSchema = z
  .object({
    schemaVersion: z.literal(1),
    contractVersion: z.literal(EXECUTION_PREFERENCES_VERSION),
    creativeTaskExecution: CreativeTaskExecutionSchema,
  })
  .strict()
  .readonly();

export const DEFAULT_EXECUTION_PREFERENCES = ExecutionPreferencesSchema.parse({
  schemaVersion: 1,
  contractVersion: EXECUTION_PREFERENCES_VERSION,
  creativeTaskExecution: {
    mode: "inline",
  },
});

export const AgentExecutionOverrideSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("inline") }).strict().readonly(),
  z
    .object({
      mode: z.literal("subagents"),
      maxConcurrency: RequestedConcurrencySchema.optional(),
      requireExactConcurrency: z.boolean().optional(),
    })
    .strict()
    .readonly(),
]);

export type ExecutionPreferences = z.infer<typeof ExecutionPreferencesSchema>;
export type AgentExecutionOverride = z.infer<
  typeof AgentExecutionOverrideSchema
>;
export type ExecutionPreferenceSource = "settings" | "builtin-default";

const configuredSubagentConcurrency = ({
  preferences,
  source,
}: {
  readonly preferences: ExecutionPreferences;
  readonly source: ExecutionPreferenceSource;
}) =>
  preferences.creativeTaskExecution.mode === "subagents"
    ? {
        value: preferences.creativeTaskExecution.maxConcurrency,
        source,
      }
    : {
        value: REPOSITORY_SUBAGENT_CONCURRENCY_CEILING,
        source: "builtin-default" as const,
      };

export const resolveAgentExecution = ({
  preferences: rawPreferences,
  preferenceSource,
  override: rawOverride,
  runtimeMaxConcurrency: rawRuntimeMaxConcurrency,
}: {
  readonly preferences: ExecutionPreferences;
  readonly preferenceSource: ExecutionPreferenceSource;
  readonly override?: AgentExecutionOverride;
  readonly runtimeMaxConcurrency?: number;
}) => {
  const preferences = ExecutionPreferencesSchema.parse(rawPreferences);
  const override =
    rawOverride === undefined
      ? undefined
      : AgentExecutionOverrideSchema.parse(rawOverride);
  const runtimeMaxConcurrency =
    rawRuntimeMaxConcurrency === undefined
      ? undefined
      : RuntimeConcurrencySchema.parse(rawRuntimeMaxConcurrency);
  const mode = override?.mode ?? preferences.creativeTaskExecution.mode;
  const modeSource = override === undefined ? preferenceSource : "user-prompt";
  if (mode === "inline") {
    return {
      status: "ready" as const,
      mode,
      requestedMaxConcurrency: null,
      effectiveMaxConcurrency: 0,
      requireExactConcurrency: false,
      source: { mode: modeSource, maxConcurrency: null },
      limitedBy: [] as const,
      persistence: "current-production-only" as const,
    };
  }

  const configured = configuredSubagentConcurrency({
    preferences,
    source: preferenceSource,
  });
  const requestedMaxConcurrency =
    override?.mode === "subagents" && override.maxConcurrency !== undefined
      ? override.maxConcurrency
      : configured.value;
  const maxConcurrencySource =
    override?.mode === "subagents" && override.maxConcurrency !== undefined
      ? ("user-prompt" as const)
      : configured.source;
  const runtimeLimit =
    runtimeMaxConcurrency ?? UNKNOWN_RUNTIME_SUBAGENT_CONCURRENCY;
  const effectiveMaxConcurrency = Math.min(
    requestedMaxConcurrency,
    runtimeLimit,
    REPOSITORY_SUBAGENT_CONCURRENCY_CEILING,
  );
  const limitedBy = [
    ...(rawRuntimeMaxConcurrency === undefined &&
    effectiveMaxConcurrency < requestedMaxConcurrency
      ? (["runtime-unknown-default"] as const)
      : []),
    ...(runtimeMaxConcurrency !== undefined &&
    runtimeMaxConcurrency < requestedMaxConcurrency &&
    runtimeMaxConcurrency <= REPOSITORY_SUBAGENT_CONCURRENCY_CEILING
      ? (["runtime-capacity"] as const)
      : []),
    ...(REPOSITORY_SUBAGENT_CONCURRENCY_CEILING < requestedMaxConcurrency &&
    REPOSITORY_SUBAGENT_CONCURRENCY_CEILING <= runtimeLimit
      ? (["repository-safety-ceiling"] as const)
      : []),
  ];
  const requireExactConcurrency =
    override?.mode === "subagents" &&
    override.requireExactConcurrency === true;
  return {
    status:
      effectiveMaxConcurrency === 0 ||
      (requireExactConcurrency &&
        effectiveMaxConcurrency < requestedMaxConcurrency)
        ? ("blocked" as const)
        : ("ready" as const),
    mode,
    requestedMaxConcurrency,
    effectiveMaxConcurrency,
    requireExactConcurrency,
    source: { mode: modeSource, maxConcurrency: maxConcurrencySource },
    limitedBy,
    persistence: "current-production-only" as const,
  };
};

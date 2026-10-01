import {
  REPOSITORY_SUBAGENT_CONCURRENCY_CEILING,
  resolveAgentExecution,
  type AgentExecutionOverride,
} from "../../../settings/contracts/execution-preferences";
import {
  loadExecutionPreferences,
  resolveExecutionPreferencesPath,
} from "../../config/execution-preferences";

export const resolveProjectAgentExecution = async ({
  rootDir,
  override,
  runtimeMaxConcurrency,
  runtimeWorkerTransport,
  allowInlineFallback = false,
}: {
  readonly rootDir: string;
  readonly override?: AgentExecutionOverride;
  readonly runtimeMaxConcurrency?: number;
  readonly runtimeWorkerTransport?: "shared-workspace" | "controller-io";
  readonly allowInlineFallback?: boolean;
}) => {
  const loaded = await loadExecutionPreferences({
    preferencesPath: resolveExecutionPreferencesPath({ rootDir }),
  });
  const result = resolveAgentExecution({
    preferences: loaded.preferences,
    preferenceSource: loaded.source,
    ...(override === undefined ? {} : { override }),
    ...(runtimeMaxConcurrency === undefined ? {} : { runtimeMaxConcurrency }),
    ...(runtimeWorkerTransport === undefined ? {} : { runtimeWorkerTransport }),
  });
  if (result.status === "ready") return result;
  // An explicit production-only authorization is not parallel capability evidence.
  // Exact concurrency requests and failures after dispatch are never downgraded.
  if (allowInlineFallback && !result.requireExactConcurrency) {
    return {
      ...resolveAgentExecution({
        preferences: loaded.preferences,
        preferenceSource: loaded.source,
        override: { mode: "inline" },
      }),
      fallback: {
        authorization: "explicit-inline-fallback" as const,
        requestedExecution: result,
        parallelVerified: false as const,
        releaseValidation: "unchanged" as const,
      },
    };
  }
  return {
    ...result,
    nextSteps: {
      reference:
        ".agents/skills/axmorf-video/references/execution-capabilities.md",
      actions: [
        "Read the execution-capabilities reference and use its shipped native-probe helper to generate complete absolute-path assignments. Verify the current host exposes bounded native child execution. Threads, shell subprocesses, and configured preferences are not runtime capability evidence. Release all completed probe slots before production dispatch.",
        ...(runtimeWorkerTransport === undefined
          ? [
              "Complete the documented native child transport probe and verify its result before supplying --worker-transport. Do not fill this flag from the requested mode or a copied example.",
            ]
          : []),
        "Determine the available native child capacity from the current host. --runtime-max-concurrency reports verified available capacity; it is not the configured or requested concurrency. Unknown or zero capacity remains blocked with effective capacity 0. A single worker I/O test does not establish the host's maximum.",
        ...(runtimeMaxConcurrency === undefined
          ? [
              `If the native host does not expose its capacity, follow the reference's bounded concurrent probe: request up to ${Math.min(result.requestedMaxConcurrency, REPOSITORY_SUBAGENT_CONCURRENCY_CEILING)} separate native children, dispatch the batch before waiting, and verify every admitted child's distinct challenge. Respect any known lower host limit. Report only the capacity established by native admission and completion; do not fill in the requested number without evidence.`,
            ]
          : []),
        "Resolve again with --worker-transport only after the native child probe passes and --runtime-max-concurrency only when host evidence establishes it. Do not prepare production or fall back to inline while blocked.",
      ],
    },
  };
};

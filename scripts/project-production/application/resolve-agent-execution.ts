import {
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
}: {
  readonly rootDir: string;
  readonly override?: AgentExecutionOverride;
  readonly runtimeMaxConcurrency?: number;
  readonly runtimeWorkerTransport?: "shared-workspace" | "controller-io";
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
  return {
    ...result,
    nextSteps: {
      reference:
        ".agents/skills/axmorf-video/references/execution-capabilities.md",
      actions: [
        "Read the execution-capabilities reference and verify the current host exposes bounded native child execution. Threads, shell subprocesses, and configured preferences are not runtime capability evidence.",
        ...(runtimeWorkerTransport === undefined
          ? [
              "Complete the documented native child transport probe and verify its result before supplying --worker-transport. Do not fill this flag from the requested mode or a copied example.",
            ]
          : []),
        "Determine the available native child capacity from the current host. --runtime-max-concurrency reports that capacity; it is not the configured or requested concurrency. Unknown capacity remains limited to 1, and zero capacity or an unmet exact concurrency request remains blocked.",
        "Resolve again with --worker-transport only after the native child probe passes and --runtime-max-concurrency only when host evidence establishes it. Do not prepare production or fall back to inline while blocked.",
      ],
    },
  };
};

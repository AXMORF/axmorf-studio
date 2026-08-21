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
}: {
  readonly rootDir: string;
  readonly override?: AgentExecutionOverride;
  readonly runtimeMaxConcurrency?: number;
}) => {
  const loaded = await loadExecutionPreferences({
    preferencesPath: resolveExecutionPreferencesPath({ rootDir }),
  });
  return resolveAgentExecution({
    preferences: loaded.preferences,
    preferenceSource: loaded.source,
    ...(override === undefined ? {} : { override }),
    ...(runtimeMaxConcurrency === undefined
      ? {}
      : { runtimeMaxConcurrency }),
  });
};

import {
  ApiErrorSchema,
  DeleteProjectResponseSchema,
  EnvironmentDiagnosticsSchema,
  ExecutionPreferencesSchema,
  ProductionProgressResponseSchema,
  SETTINGS_API_ROUTES,
  parseEditableConfig,
  type EditableConfig,
  type ExecutionPreferences,
} from "../contracts/api";

const readJsonResponse = async (response: Response): Promise<unknown> => {
  const body = await response.json();
  if (!response.ok) {
    const parsed = ApiErrorSchema.safeParse(body);
    throw new Error(parsed.success ? parsed.data.error : "本地 API 请求失败");
  }
  return body;
};

export const loadSettings = async () =>
  parseEditableConfig(
    await readJsonResponse(
      await fetch(SETTINGS_API_ROUTES.settings, { cache: "no-store" }),
    ),
  );

export const saveSettings = async (config: EditableConfig) =>
  parseEditableConfig(
    await readJsonResponse(
      await fetch(SETTINGS_API_ROUTES.settings, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(config),
      }),
    ),
  );

export const loadExecutionPreferences = async () =>
  ExecutionPreferencesSchema.parse(
    await readJsonResponse(
      await fetch(SETTINGS_API_ROUTES.executionPreferences, {
        cache: "no-store",
      }),
    ),
  );

export const saveExecutionPreferences = async (
  preferences: ExecutionPreferences,
) =>
  ExecutionPreferencesSchema.parse(
    await readJsonResponse(
      await fetch(SETTINGS_API_ROUTES.executionPreferences, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(preferences),
      }),
    ),
  );

export const loadEnvironmentDiagnostics = async (signal: AbortSignal) =>
  EnvironmentDiagnosticsSchema.parse(
    await readJsonResponse(
      await fetch(SETTINGS_API_ROUTES.diagnostics, {
        cache: "no-store",
        signal,
      }),
    ),
  );

export const loadProductionProgress = async (signal: AbortSignal) =>
  ProductionProgressResponseSchema.parse(
    await readJsonResponse(
      await fetch(SETTINGS_API_ROUTES.productionProgress, {
        cache: "no-store",
        signal,
      }),
    ),
  );

export const requestProjectDeletion = async (
  projectId: string,
  confirmation: string,
) =>
  DeleteProjectResponseSchema.parse(
    await readJsonResponse(
      await fetch(SETTINGS_API_ROUTES.projectDeletion, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId, confirmation }),
      }),
    ),
  );

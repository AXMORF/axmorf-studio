import {
  ApiErrorSchema,
  DeleteFilmResponseSchema,
  EnvironmentDiagnosticsSchema,
  FilmListResponseSchema,
  SETTINGS_API_ROUTES,
  parseEditableConfig,
  type EditableConfig,
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

export const loadEnvironmentDiagnostics = async (signal: AbortSignal) =>
  EnvironmentDiagnosticsSchema.parse(
    await readJsonResponse(
      await fetch(SETTINGS_API_ROUTES.diagnostics, {
        cache: "no-store",
        signal,
      }),
    ),
  );

export const loadFilms = async (signal: AbortSignal) =>
  FilmListResponseSchema.parse(
    await readJsonResponse(
      await fetch(SETTINGS_API_ROUTES.films, { cache: "no-store", signal }),
    ),
  );

export const requestFilmDeletion = async (
  filmId: string,
  confirmation: string,
) =>
  DeleteFilmResponseSchema.parse(
    await readJsonResponse(
      await fetch(SETTINGS_API_ROUTES.filmDeletion, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filmId, confirmation }),
      }),
    ),
  );

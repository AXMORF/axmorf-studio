import {
  readProducerConfig,
  resolveProducerConfigPathFromEnvironment,
  writeProducerConfig,
} from "../../scripts/config/producer-config";
import {
  DeleteFilmRequestSchema,
  DeleteFilmResponseSchema,
  EnvironmentDiagnosticsSchema,
  FilmListResponseSchema,
  SETTINGS_API_ROUTES,
  type EnvironmentDiagnostics,
  type FilmListResponse,
} from "../contracts/api";
import { isSameOriginSettingsWrite } from "./dev-network";

export const SETTINGS_API_MAX_BODY_BYTES = 1024 * 1024;

type ApiRequest = Readonly<{
  method: string | undefined;
  url: string | undefined;
  headers: Readonly<Record<string, string | undefined>>;
  body?: string;
}>;

type ApiResponse = Readonly<{ statusCode: number; body: unknown }>;

export const createSettingsApi = ({
  rootDir,
  env,
  diagnose,
  listFilms,
  deleteFilm,
}: {
  readonly rootDir: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly diagnose: () => Promise<EnvironmentDiagnostics>;
  readonly listFilms: () => Promise<FilmListResponse>;
  readonly deleteFilm: (input: { readonly filmId: string }) => Promise<unknown>;
}) => {
  let deletionInProgress = false;
  return async (request: ApiRequest): Promise<ApiResponse> => {
    if (request.url === SETTINGS_API_ROUTES.films) {
      if (request.method !== "GET") {
        return { statusCode: 405, body: { error: "作品列表只允许 GET" } };
      }
      try {
        return {
          statusCode: 200,
          body: FilmListResponseSchema.parse(await listFilms()),
        };
      } catch {
        return {
          statusCode: 500,
          body: { error: "作品列表不可用；请检查 src/films 与 deliveries。" },
        };
      }
    }
    if (request.url === SETTINGS_API_ROUTES.diagnostics) {
      if (request.method !== "GET") {
        return { statusCode: 405, body: { error: "环境诊断只允许 GET" } };
      }
      try {
        return {
          statusCode: 200,
          body: EnvironmentDiagnosticsSchema.parse(await diagnose()),
        };
      } catch {
        return {
          statusCode: 500,
          body: { error: "环境诊断失败；请检查本地配置与宿主权限。" },
        };
      }
    }
    if (request.url === SETTINGS_API_ROUTES.filmDeletion) {
      if (request.method !== "DELETE") {
        return { statusCode: 405, body: { error: "作品删除只允许 DELETE" } };
      }
      if (
        !isSameOriginSettingsWrite({
          origin: request.headers.origin,
          host: request.headers.host,
        })
      ) {
        return { statusCode: 403, body: { error: "拒绝非同源作品删除" } };
      }
      if (!request.headers["content-type"]?.startsWith("application/json")) {
        return { statusCode: 415, body: { error: "作品删除必须使用 JSON" } };
      }
      if (
        request.body === undefined ||
        Buffer.byteLength(request.body) > SETTINGS_API_MAX_BODY_BYTES
      ) {
        return { statusCode: 400, body: { error: "作品删除请求正文无效。" } };
      }
      let raw: unknown;
      try {
        raw = JSON.parse(request.body);
      } catch {
        return { statusCode: 400, body: { error: "作品删除请求正文无效。" } };
      }
      const parsedRequest = DeleteFilmRequestSchema.safeParse(raw);
      if (!parsedRequest.success) {
        return {
          statusCode: 400,
          body: {
            error:
              parsedRequest.error.issues[0]?.message ?? "作品删除请求正文无效。",
          },
        };
      }
      const { filmId } = parsedRequest.data;
      if (deletionInProgress) {
        return { statusCode: 409, body: { error: "已有作品正在删除。" } };
      }
      deletionInProgress = true;
      try {
        await deleteFilm({ filmId });
        return {
          statusCode: 200,
          body: DeleteFilmResponseSchema.parse({ deletedFilmId: filmId }),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (message.includes("is not a film")) {
          return { statusCode: 404, body: { error: "作品已不存在。" } };
        }
        if (message.includes("operation is already active")) {
          return {
            statusCode: 409,
            body: { error: "Workspace 正在执行其他操作，请稍后重试。" },
          };
        }
        return {
          statusCode: 500,
          body: { error: "作品删除失败，请检查本地状态。" },
        };
      } finally {
        deletionInProgress = false;
      }
    }
    if (request.url !== SETTINGS_API_ROUTES.settings) {
      return { statusCode: 404, body: { error: "未找到配置接口" } };
    }
    const configPath = await resolveProducerConfigPathFromEnvironment({
      rootDir,
      env,
    });
    if (request.method === "GET") {
      try {
        return {
          statusCode: 200,
          body: await readProducerConfig({ configPath }),
        };
      } catch {
        return { statusCode: 400, body: { error: "制作配置不可用。" } };
      }
    }
    if (request.method !== "PUT") {
      return { statusCode: 405, body: { error: "只允许 GET 或 PUT" } };
    }
    if (
      !isSameOriginSettingsWrite({
        origin: request.headers.origin,
        host: request.headers.host,
      })
    ) {
      return { statusCode: 403, body: { error: "拒绝非同源配置写入" } };
    }
    if (!request.headers["content-type"]?.startsWith("application/json")) {
      return { statusCode: 415, body: { error: "配置写入必须使用 JSON" } };
    }
    if (
      request.body === undefined ||
      Buffer.byteLength(request.body) > SETTINGS_API_MAX_BODY_BYTES
    ) {
      return { statusCode: 400, body: { error: "配置请求正文无效。" } };
    }
    let value: unknown;
    try {
      value = JSON.parse(request.body);
    } catch {
      return { statusCode: 400, body: { error: "配置请求正文无效。" } };
    }
    try {
      return {
        statusCode: 200,
        body: await writeProducerConfig({ configPath, value }),
      };
    } catch {
      return { statusCode: 400, body: { error: "配置严格校验失败。" } };
    }
  };
};

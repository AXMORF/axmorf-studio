import {
  readProducerConfig,
  resolveProducerConfigPathFromEnvironment,
  writeProducerConfig,
} from "../../scripts/config/producer-config";
import {
  DeleteProjectResponseSchema,
  DeleteProjectRequestSchema,
  EnvironmentDiagnosticsSchema,
  ProductionProgressResponseSchema,
  SETTINGS_API_ROUTES,
  type EnvironmentDiagnostics,
  type ProductionProgressResponse,
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
  inspectProductionProgress,
  deleteProject,
}: {
  readonly rootDir: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly diagnose: () => Promise<EnvironmentDiagnostics>;
  readonly inspectProductionProgress: () => Promise<ProductionProgressResponse>;
  readonly deleteProject: (input: {
    readonly projectId: string;
  }) => Promise<unknown>;
}) => {
  let deletionInProgress = false;
  return async (request: ApiRequest): Promise<ApiResponse> => {
    if (request.url === SETTINGS_API_ROUTES.productionProgress) {
      if (request.method !== "GET") {
        return { statusCode: 405, body: { error: "Project 状态只允许 GET" } };
      }
      try {
        return {
          statusCode: 200,
          body: ProductionProgressResponseSchema.parse(
            await inspectProductionProgress(),
          ),
        };
      } catch {
        return {
          statusCode: 500,
          body: { error: "Project 构建与交付状态不可用；请检查本地数据。" },
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
    if (request.url === SETTINGS_API_ROUTES.projectDeletion) {
      if (request.method !== "DELETE") {
        return {
          statusCode: 405,
          body: { error: "Project 删除只允许 DELETE" },
        };
      }
      if (
        !isSameOriginSettingsWrite({
          origin: request.headers.origin,
          host: request.headers.host,
        })
      ) {
        return { statusCode: 403, body: { error: "拒绝非同源 Project 删除" } };
      }
      if (!request.headers["content-type"]?.startsWith("application/json")) {
        return {
          statusCode: 415,
          body: { error: "Project 删除必须使用 JSON" },
        };
      }
      if (
        request.body === undefined ||
        Buffer.byteLength(request.body) > SETTINGS_API_MAX_BODY_BYTES
      ) {
        return {
          statusCode: 400,
          body: { error: "Project 删除请求正文无效。" },
        };
      }
      let raw: unknown;
      try {
        raw = JSON.parse(request.body);
      } catch {
        return {
          statusCode: 400,
          body: { error: "Project 删除请求正文无效。" },
        };
      }
      const parsedRequest = DeleteProjectRequestSchema.safeParse(raw);
      if (!parsedRequest.success) {
        return {
          statusCode: 400,
          body: {
            error:
              parsedRequest.error.issues[0]?.message ??
              "Project 删除请求正文无效。",
          },
        };
      }
      const { projectId } = parsedRequest.data;
      if (deletionInProgress) {
        return { statusCode: 409, body: { error: "已有 Project 正在删除。" } };
      }
      deletionInProgress = true;
      try {
        await deleteProject({ projectId });
        return {
          statusCode: 200,
          body: DeleteProjectResponseSchema.parse({
            deletedProjectId: projectId,
          }),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (message.includes("No Project-owned data found")) {
          return {
            statusCode: 404,
            body: { error: "Project 已不存在或没有可删除数据。" },
          };
        }
        if (message.includes("writer lock")) {
          return {
            statusCode: 409,
            body: { error: "Project 仍有活动 writer lock，暂不能删除。" },
          };
        }
        if (message.includes("Delivery staging")) {
          return {
            statusCode: 409,
            body: { error: "交付 staging 尚未清空，暂不能删除 Project。" },
          };
        }
        if (
          message.includes("Another Project operation") ||
          message.includes("Project-owned data changed")
        ) {
          return {
            statusCode: 409,
            body: { error: "Project 数据正在变化，未执行删除；请稍后重试。" },
          };
        }
        return {
          statusCode: 500,
          body: { error: "Project 删除失败或未完整结束，请检查本地状态。" },
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

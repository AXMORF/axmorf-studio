import {
  readProducerConfig,
  resolveProducerConfigPathFromEnvironment,
  writeProducerConfig,
} from "../scripts/config/producer-config";
import { StoryIdSchema } from "../src/contracts";
import { isSameOriginSettingsWrite } from "./dev-network";
import type { ProductionProgressResponse } from "./production-progress";

const MAX_BODY_BYTES = 1024 * 1024;

type ApiRequest = Readonly<{
  method: string | undefined;
  url: string | undefined;
  headers: Readonly<Record<string, string | undefined>>;
  body?: string;
}>;

type ApiResponse = Readonly<{ statusCode: number; body: unknown }>;

export type SafeEnvironmentDiagnostics = Readonly<{
  schemaVersion: 1;
  status: "pass" | "attention";
  checks: readonly Readonly<{
    id: string;
    status: "pass" | "fail";
    summary: string;
    remediation: string | null;
  }>[];
}>;

export const createSettingsApi = ({
  rootDir,
  env,
  diagnose,
  inspectProductionProgress,
  deleteProject,
}: {
  readonly rootDir: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly diagnose: () => Promise<SafeEnvironmentDiagnostics>;
  readonly inspectProductionProgress: () => Promise<ProductionProgressResponse>;
  readonly deleteProject: (input: {
    readonly projectId: string;
  }) => Promise<unknown>;
}) => {
  let deletionInProgress = false;
  return async (request: ApiRequest): Promise<ApiResponse> => {
    if (request.url === "/api/production-progress") {
      if (request.method !== "GET") {
        return { statusCode: 405, body: { error: "生产进度只允许 GET" } };
      }
      try {
        return { statusCode: 200, body: await inspectProductionProgress() };
      } catch {
        return {
          statusCode: 500,
          body: { error: "Project 生产进度不可用；请检查本地 Project 数据。" },
        };
      }
    }
    if (request.url === "/api/diagnostics") {
      if (request.method !== "GET") {
        return { statusCode: 405, body: { error: "环境诊断只允许 GET" } };
      }
      try {
        return { statusCode: 200, body: await diagnose() };
      } catch {
        return {
          statusCode: 500,
          body: { error: "环境诊断失败；请检查本地配置与宿主权限。" },
        };
      }
    }
    if (request.url === "/api/projects/delete") {
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
        Buffer.byteLength(request.body) > MAX_BODY_BYTES
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
      if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
        return {
          statusCode: 400,
          body: { error: "Project 删除请求正文无效。" },
        };
      }
      const record = raw as Record<string, unknown>;
      if (
        Object.keys(record).sort().join(",") !== "confirmation,projectId" ||
        typeof record.projectId !== "string" ||
        typeof record.confirmation !== "string"
      ) {
        return {
          statusCode: 400,
          body: { error: "Project 删除请求正文无效。" },
        };
      }
      let projectId: string;
      try {
        projectId = StoryIdSchema.parse(record.projectId);
      } catch {
        return { statusCode: 400, body: { error: "Project ID 无效。" } };
      }
      if (record.confirmation !== projectId) {
        return {
          statusCode: 400,
          body: { error: "请输入完整 Project ID 确认删除。" },
        };
      }
      if (deletionInProgress) {
        return { statusCode: 409, body: { error: "已有 Project 正在删除。" } };
      }
      deletionInProgress = true;
      try {
        await deleteProject({ projectId });
        return { statusCode: 200, body: { deletedProjectId: projectId } };
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
    if (request.url !== "/api/settings") {
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
      Buffer.byteLength(request.body) > MAX_BODY_BYTES
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

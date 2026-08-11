import {
  readProducerConfig,
  resolveProducerConfigPathFromEnvironment,
  writeProducerConfig,
} from "../scripts/config/producer-config";
import { isSameOriginSettingsWrite } from "./dev-network";

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

export const createSettingsApi =
  ({
    rootDir,
    env,
    diagnose,
  }: {
    readonly rootDir: string;
    readonly env: Readonly<Record<string, string | undefined>>;
    readonly diagnose: () => Promise<SafeEnvironmentDiagnostics>;
  }) =>
  async (request: ApiRequest): Promise<ApiResponse> => {
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

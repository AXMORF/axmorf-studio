import type { IncomingMessage, ServerResponse } from "node:http";

import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

import {
  readProducerConfig,
  resolveProducerConfigPath,
  writeProducerConfig,
} from "../scripts/config/producer-config";
import { isLanDevEnabled, isSameOriginSettingsWrite } from "./dev-network";

const MAX_BODY_BYTES = 1024 * 1024;

const json = (response: ServerResponse, statusCode: number, value: unknown) => {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store, max-age=0");
  response.setHeader("x-content-type-options", "nosniff");
  response.end(JSON.stringify(value));
};

const readBody = async (request: IncomingMessage) => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.from(chunk as Uint8Array);
    size += bytes.length;
    if (size > MAX_BODY_BYTES) throw new Error("配置内容超过 1MB 限制");
    chunks.push(bytes);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
};

const settingsApi = (): Plugin => ({
  name: "rsp-local-settings-api",
  configureServer(server) {
    server.middlewares.use(async (request, response, next) => {
      if (request.url === "/favicon.ico") {
        response.statusCode = 204;
        response.end();
        return;
      }
      if (request.url !== "/api/settings") return next();
      const configPath = resolveProducerConfigPath({
        rootDir: process.cwd(),
        env: process.env,
      });
      try {
        if (request.method === "GET") {
          json(response, 200, await readProducerConfig({ configPath }));
          return;
        }
        if (request.method !== "PUT") {
          json(response, 405, { error: "只允许 GET 或 PUT" });
          return;
        }
        const origin = request.headers.origin;
        if (
          !isSameOriginSettingsWrite({ origin, host: request.headers.host })
        ) {
          json(response, 403, { error: "拒绝非同源配置写入" });
          return;
        }
        if (!request.headers["content-type"]?.startsWith("application/json")) {
          json(response, 415, { error: "配置写入必须使用 JSON" });
          return;
        }
        json(
          response,
          200,
          await writeProducerConfig({
            configPath,
            value: await readBody(request),
          }),
        );
      } catch (error) {
        json(response, 400, {
          error: error instanceof Error ? error.message : "配置请求失败",
        });
      }
    });
  },
});

const lanDevEnabled = isLanDevEnabled(process.env);

export default defineConfig({
  root: "settings",
  plugins: [react(), settingsApi()],
  server: {
    host: lanDevEnabled ? "0.0.0.0" : "127.0.0.1",
    port: 3100,
    strictPort: true,
  },
  build: { outDir: "../dist/settings", emptyOutDir: true },
});

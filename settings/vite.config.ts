import type { IncomingMessage, ServerResponse } from "node:http";

import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

import { createSettingsApi } from "./api";
import { runProducerEnvironmentDiagnostics } from "./diagnostics";
import { isLanDevEnabled } from "./dev-network";

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
  return Buffer.concat(chunks).toString("utf8");
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
      if (
        request.url !== "/api/settings" &&
        request.url !== "/api/diagnostics"
      ) {
        return next();
      }
      const api = createSettingsApi({
        rootDir: process.cwd(),
        env: process.env,
        diagnose: () =>
          runProducerEnvironmentDiagnostics({
            rootDir: process.cwd(),
            env: process.env,
          }),
      });
      let body: string | undefined;
      try {
        body = request.method === "PUT" ? await readBody(request) : undefined;
      } catch {
        json(response, 400, { error: "配置请求正文无效。" });
        return;
      }
      const result = await api({
        method: request.method,
        url: request.url,
        headers: {
          origin: request.headers.origin,
          host: request.headers.host,
          "content-type": request.headers["content-type"],
        },
        ...(body === undefined ? {} : { body }),
      });
      json(response, result.statusCode, result.body);
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

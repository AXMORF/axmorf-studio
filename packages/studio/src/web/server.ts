import { realpath } from "node:fs/promises";
import { createServer } from "node:http";

import { serveDeliveryMedia } from "./delivery-media";
import {
  readApiBody,
  sendEmpty,
  sendJson,
  setSecurityHeaders,
  singleHeader,
} from "./http-response";
import { serveStaticAsset, validateStudioUrl } from "./static-assets";
import type {
  RunningWebControlCenter,
  StartWebControlCenterInput,
} from "./types";

const LOOPBACK_HOST = "127.0.0.1";

const parseRequestPathname = (rawUrl: string | undefined) => {
  if (rawUrl === undefined) return null;
  try {
    return new URL(rawUrl, "http://127.0.0.1").pathname;
  } catch {
    return null;
  }
};

const listen = async (server: ReturnType<typeof createServer>, port: number) =>
  new Promise<number>((resolvePromise, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("Web server did not bind a TCP port."));
        return;
      }
      resolvePromise(address.port);
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, LOOPBACK_HOST);
  });

export const startWebControlCenter = async ({
  rootDir,
  assetsDir,
  port = 0,
  studioUrl: rawStudioUrl,
  api,
  inspectCurrentDelivery,
  readCurrentRevision,
}: StartWebControlCenterInput): Promise<RunningWebControlCenter> => {
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error("Web server port must be an integer from 0 through 65535.");
  }
  const [canonicalRootDir, canonicalAssetsDir] = await Promise.all([
    realpath(rootDir),
    realpath(assetsDir),
  ]);
  const studioUrl = validateStudioUrl(rawStudioUrl);
  let boundPort: number | null = null;
  const server = createServer(async (request, response) => {
    setSecurityHeaders(response);
    const expectedHost =
      boundPort === null ? null : `${LOOPBACK_HOST}:${boundPort}`;
    const host = singleHeader(request.headers.host);
    if (expectedHost === null || host !== expectedHost) {
      sendJson(response, 421, { error: "Request Host is not the Web server." });
      return;
    }
    const origin = singleHeader(request.headers.origin);
    if (origin !== undefined && origin !== `http://${expectedHost}`) {
      sendJson(response, 403, { error: "Cross-origin Web request rejected." });
      return;
    }
    const pathname = parseRequestPathname(request.url);
    if (pathname === null) {
      sendJson(response, 400, { error: "Web request URL is invalid." });
      return;
    }
    try {
      if (pathname.startsWith("/api/delivery/")) {
        await serveDeliveryMedia({
          request,
          response,
          pathname,
          rootDir: canonicalRootDir,
          inspectCurrentDelivery,
          readCurrentRevision,
        });
        return;
      }
      if (pathname.startsWith("/api/")) {
        let body: string | undefined;
        try {
          body =
            request.method === "GET" || request.method === "HEAD"
              ? undefined
              : await readApiBody(request);
        } catch {
          sendJson(response, 400, {
            error: "Web API request body is invalid.",
          });
          return;
        }
        const result = await api({
          method: request.method,
          url: pathname,
          headers: {
            origin,
            host,
            "content-type": singleHeader(request.headers["content-type"]),
          },
          ...(body === undefined ? {} : { body }),
        });
        sendJson(response, result.statusCode, result.body);
        return;
      }
      if (pathname === "/favicon.ico") {
        sendEmpty(response, 204);
        return;
      }
      await serveStaticAsset({
        request,
        response,
        assetsDir: canonicalAssetsDir,
        studioUrl,
      });
    } catch {
      if (!response.headersSent) {
        sendJson(response, 500, { error: "Local Web request failed." });
      } else {
        response.destroy();
      }
    }
  });
  boundPort = await listen(server, port);
  return {
    url: `http://${LOOPBACK_HOST}:${boundPort}/`,
    port: boundPort,
    close: () =>
      new Promise<void>((resolvePromise, reject) => {
        server.closeAllConnections();
        server.close((error) =>
          error === undefined ? resolvePromise() : reject(error),
        );
      }),
  };
};

export type {
  RunningWebControlCenter,
  StartWebControlCenterInput,
  WebApiRequest,
  WebApiResponse,
} from "./types";

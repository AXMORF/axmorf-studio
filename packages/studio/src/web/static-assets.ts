import { lstat, readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";

import { sendJson } from "./http-response";

const LOOPBACK_HOST = "127.0.0.1";

const staticContentTypes: Readonly<Record<string, string>> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const resolveStaticAsset = async ({
  rawUrl,
  assetsDir,
}: {
  readonly rawUrl: string | undefined;
  readonly assetsDir: string;
}) => {
  if (rawUrl === undefined) return null;
  const rawPathname = rawUrl.split(/[?#]/u, 1)[0];
  if (rawPathname === undefined) return null;
  let pathname: string;
  try {
    pathname = decodeURIComponent(rawPathname);
  } catch {
    return null;
  }
  if (
    !pathname.startsWith("/") ||
    pathname.includes("\\") ||
    pathname.includes("\0")
  ) {
    return null;
  }
  const segments = pathname.split("/").filter(Boolean);
  if (segments.some((segment) => segment === "." || segment === "..")) {
    return null;
  }
  const relativePath = pathname === "/" ? "index.html" : segments.join("/");
  if (relativePath.length === 0) return null;
  const absolutePath = resolve(assetsDir, relativePath);
  const containment = relative(assetsDir, absolutePath);
  if (
    containment === "" ||
    containment === ".." ||
    containment.startsWith(`..${sep}`) ||
    isAbsolute(containment)
  ) {
    return null;
  }
  try {
    const metadata = await lstat(absolutePath);
    if (!metadata.isFile() || metadata.isSymbolicLink()) return null;
  } catch {
    return null;
  }
  return { absolutePath, relativePath } as const;
};

export const validateStudioUrl = (rawUrl: string | undefined) => {
  if (rawUrl === undefined) return null;
  const url = new URL(rawUrl);
  if (
    url.protocol !== "http:" ||
    url.hostname !== LOOPBACK_HOST ||
    url.username !== "" ||
    url.password !== ""
  ) {
    throw new Error("Studio URL must be an unauthenticated loopback HTTP URL.");
  }
  return url.toString();
};

const escapeHtmlAttribute = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

export const serveStaticAsset = async ({
  request,
  response,
  assetsDir,
  studioUrl,
}: {
  readonly request: IncomingMessage;
  readonly response: ServerResponse;
  readonly assetsDir: string;
  readonly studioUrl: string | null;
}) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.setHeader("allow", "GET, HEAD");
    sendJson(response, 405, { error: "Web assets only allow GET or HEAD." });
    return;
  }
  const asset = await resolveStaticAsset({ rawUrl: request.url, assetsDir });
  if (asset === null) {
    sendJson(response, 404, { error: "Web asset not found." });
    return;
  }
  const contentType =
    staticContentTypes[extname(asset.relativePath).toLowerCase()];
  if (contentType === undefined) {
    sendJson(response, 404, { error: "Web asset not found." });
    return;
  }
  let bytes = await readFile(asset.absolutePath);
  if (asset.relativePath === "index.html" && studioUrl !== null) {
    bytes = Buffer.from(
      bytes
        .toString("utf8")
        .replaceAll("__AXMORF_STUDIO_URL__", escapeHtmlAttribute(studioUrl)),
    );
  }
  response.statusCode = 200;
  response.setHeader("cache-control", "no-cache");
  response.setHeader("content-type", contentType);
  response.setHeader("content-length", bytes.length);
  response.end(request.method === "HEAD" ? undefined : bytes);
};

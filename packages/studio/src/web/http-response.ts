import type { IncomingMessage, ServerResponse } from "node:http";

const MAX_API_BODY_BYTES = 1024 * 1024;

const securityHeaders = {
  "content-security-policy": [
    "default-src 'self'",
    "base-uri 'none'",
    "connect-src 'self'",
    "font-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data:",
    "media-src 'self'",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
  ].join("; "),
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin",
  "permissions-policy": "camera=(), geolocation=(), microphone=()",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
} as const;

export const setSecurityHeaders = (response: ServerResponse) => {
  for (const [name, value] of Object.entries(securityHeaders)) {
    response.setHeader(name, value);
  }
};

export const sendJson = (
  response: ServerResponse,
  statusCode: number,
  body: unknown,
) => {
  const bytes = Buffer.from(JSON.stringify(body));
  response.statusCode = statusCode;
  response.setHeader("cache-control", "no-store, max-age=0");
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("content-length", bytes.length);
  response.end(bytes);
};

export const sendEmpty = (response: ServerResponse, statusCode: number) => {
  response.statusCode = statusCode;
  response.setHeader("cache-control", "no-store, max-age=0");
  response.end();
};

export const singleHeader = (
  value: string | readonly string[] | undefined,
): string | undefined => (typeof value === "string" ? value : value?.[0]);

export const readApiBody = async (request: IncomingMessage) => {
  const declaredLength = Number(request.headers["content-length"] ?? 0);
  if (
    !Number.isSafeInteger(declaredLength) ||
    declaredLength < 0 ||
    declaredLength > MAX_API_BODY_BYTES
  ) {
    throw new Error("Web API request body is invalid.");
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.from(chunk as Uint8Array);
    size += bytes.length;
    if (size > MAX_API_BODY_BYTES) {
      throw new Error("Web API request body exceeds the fixed limit.");
    }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks).toString("utf8");
};

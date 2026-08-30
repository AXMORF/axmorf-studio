import { lstat, open } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";

import {
  parseDeliveryMediaPath,
  type DeliveryMediaKind,
} from "./delivery-route";
import { sendEmpty, sendJson, singleHeader } from "./http-response";
import type { CurrentDelivery, StartWebControlCenterInput } from "./types";

const deliveryFiles: Record<
  DeliveryMediaKind,
  Readonly<{
    fileName: string;
    contentType: string;
    artifact: "video" | "cover4x3" | "cover3x4";
  }>
> = {
  video: {
    fileName: "video.mp4",
    contentType: "video/mp4",
    artifact: "video",
  },
  "cover-4x3": {
    fileName: "cover-4x3.png",
    contentType: "image/png",
    artifact: "cover4x3",
  },
  "cover-3x4": {
    fileName: "cover-3x4.png",
    contentType: "image/png",
    artifact: "cover3x4",
  },
};

type ParsedRange =
  | Readonly<{ kind: "full" }>
  | Readonly<{ kind: "partial"; start: number; end: number }>
  | Readonly<{ kind: "invalid" }>;

const parseSingleRange = (
  rawRange: string | undefined,
  size: number,
): ParsedRange => {
  if (rawRange === undefined) return { kind: "full" };
  const match = /^bytes=(\d*)-(\d*)$/u.exec(rawRange);
  if (match === null) return { kind: "invalid" };
  const [, rawStart, rawEnd] = match;
  if (rawStart === undefined || rawEnd === undefined) {
    return { kind: "invalid" };
  }
  if (rawStart === "") {
    if (rawEnd === "") return { kind: "invalid" };
    const suffixLength = Number(rawEnd);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
      return { kind: "invalid" };
    }
    return {
      kind: "partial",
      start: Math.max(size - suffixLength, 0),
      end: size - 1,
    };
  }
  const start = Number(rawStart);
  const parsedEnd = rawEnd === "" ? size - 1 : Number(rawEnd);
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(parsedEnd) ||
    start < 0 ||
    start >= size ||
    parsedEnd < start
  ) {
    return { kind: "invalid" };
  }
  return {
    kind: "partial",
    start,
    end: Math.min(parsedEnd, size - 1),
  };
};

export const serveDeliveryMedia = async ({
  request,
  response,
  pathname,
  rootDir,
  inspectCurrentDelivery,
  readCurrentRevision,
}: {
  readonly request: IncomingMessage;
  readonly response: ServerResponse;
  readonly pathname: string;
  readonly rootDir: string;
  readonly inspectCurrentDelivery: StartWebControlCenterInput["inspectCurrentDelivery"];
  readonly readCurrentRevision: StartWebControlCenterInput["readCurrentRevision"];
}) => {
  const mediaRequest = parseDeliveryMediaPath(pathname);
  if (mediaRequest === null) {
    sendJson(response, 404, { error: "Delivery media not found." });
    return;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.setHeader("allow", "GET, HEAD");
    sendJson(response, 405, {
      error: "Delivery media only allows GET or HEAD.",
    });
    return;
  }

  let delivery: CurrentDelivery | null;
  let currentRevision: Readonly<{ revisionId: string }>;
  try {
    [delivery, currentRevision] = await Promise.all([
      inspectCurrentDelivery({
        rootDir,
        storyId: mediaRequest.projectId,
      }),
      readCurrentRevision({
        rootDir,
        projectId: mediaRequest.projectId,
      }),
    ]);
  } catch {
    sendJson(response, 404, { error: "Current Delivery media not found." });
    return;
  }
  if (
    delivery === null ||
    delivery.storyId !== mediaRequest.projectId ||
    delivery.deliveryBuildId !== mediaRequest.deliveryBuildId ||
    delivery.revisionId !== currentRevision.revisionId
  ) {
    sendJson(response, 404, { error: "Current Delivery media not found." });
    return;
  }

  const binding = deliveryFiles[mediaRequest.kind];
  const expectedSize = delivery.artifacts[binding.artifact].sizeBytes;
  if (!Number.isSafeInteger(expectedSize) || expectedSize <= 0) {
    sendJson(response, 404, { error: "Current Delivery media not found." });
    return;
  }
  const absolutePath = join(
    rootDir,
    "deliveries",
    mediaRequest.projectId,
    binding.fileName,
  );
  let file: Awaited<ReturnType<typeof open>> | undefined;
  try {
    const pathMetadata = await lstat(absolutePath);
    if (
      !pathMetadata.isFile() ||
      pathMetadata.isSymbolicLink() ||
      pathMetadata.size !== expectedSize
    ) {
      sendJson(response, 404, { error: "Current Delivery media not found." });
      return;
    }
    file = await open(absolutePath, "r");
    const metadata = await file.stat();
    if (
      !metadata.isFile() ||
      metadata.size !== expectedSize ||
      metadata.dev !== pathMetadata.dev ||
      metadata.ino !== pathMetadata.ino
    ) {
      await file.close();
      sendJson(response, 404, { error: "Current Delivery media not found." });
      return;
    }
  } catch {
    await file?.close();
    sendJson(response, 404, { error: "Current Delivery media not found." });
    return;
  }

  const range = parseSingleRange(
    singleHeader(request.headers.range),
    expectedSize,
  );
  if (range.kind === "invalid") {
    await file.close();
    response.setHeader("content-range", `bytes */${expectedSize}`);
    sendEmpty(response, 416);
    return;
  }
  const start = range.kind === "partial" ? range.start : 0;
  const end = range.kind === "partial" ? range.end : expectedSize - 1;
  response.statusCode = range.kind === "partial" ? 206 : 200;
  response.setHeader("accept-ranges", "bytes");
  response.setHeader("cache-control", "no-store, max-age=0");
  response.setHeader(
    "content-disposition",
    `inline; filename="${binding.fileName}"`,
  );
  response.setHeader("content-type", binding.contentType);
  response.setHeader("content-length", end - start + 1);
  if (range.kind === "partial") {
    response.setHeader(
      "content-range",
      `bytes ${start}-${end}/${expectedSize}`,
    );
  }
  if (request.method === "HEAD") {
    await file.close();
    response.end();
    return;
  }
  const stream = file.createReadStream({ start, end, autoClose: false });
  let fileCloseStarted = false;
  const closeFile = () => {
    if (fileCloseStarted) return;
    fileCloseStarted = true;
    void file.close().catch(() => response.destroy());
  };
  const closeOnAbortedResponse = () => {
    if (!response.writableFinished) stream.destroy();
  };
  response.once("close", closeOnAbortedResponse);
  stream.once("end", closeFile);
  stream.once("close", () => {
    response.off("close", closeOnAbortedResponse);
    closeFile();
  });
  stream.once("error", () => {
    closeFile();
    response.destroy();
  });
  stream.pipe(response);
};

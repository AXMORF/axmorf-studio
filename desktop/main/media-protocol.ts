import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, realpath, type FileHandle } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";

import {
  buildPreviewVideoUrl,
  DESKTOP_MEDIA_SCHEME,
  type PreviewCatalog,
  type PreviewCatalogEntry,
} from "../contracts/preview";

const VIDEO_CONTENT_TYPE = "video/mp4";
const READ_CHUNK_BYTES = 64 * 1024;

type FileIdentity = Readonly<{
  dev: bigint;
  ino: bigint;
  size: number;
  mtimeNs: bigint;
  ctimeNs: bigint;
}>;

type MediaTicket = Readonly<{
  url: string;
  path: string;
  handle: FileHandle;
  checksum: string;
  identity: FileIdentity;
}>;

type ByteRange = Readonly<{ start: number; end: number }>;

const sameIdentity = (left: FileIdentity, right: FileIdentity) =>
  left.dev === right.dev &&
  left.ino === right.ino &&
  left.size === right.size &&
  left.mtimeNs === right.mtimeNs &&
  left.ctimeNs === right.ctimeNs;

const toIdentity = (stat: {
  readonly dev: bigint;
  readonly ino: bigint;
  readonly size: bigint;
  readonly mtimeNs: bigint;
  readonly ctimeNs: bigint;
}): FileIdentity => {
  const size = Number(stat.size);
  if (!Number.isSafeInteger(size) || size < 0) {
    throw new Error("desktop-media-size-invalid");
  }
  return {
    dev: stat.dev,
    ino: stat.ino,
    size,
    mtimeNs: stat.mtimeNs,
    ctimeNs: stat.ctimeNs,
  };
};

const checksumHandle = async (handle: FileHandle, size: number) => {
  const hash = createHash("sha256");
  let position = 0;
  while (position < size) {
    const length = Math.min(READ_CHUNK_BYTES, size - position);
    const buffer = Buffer.allocUnsafe(length);
    const { bytesRead } = await handle.read(buffer, 0, length, position);
    if (bytesRead === 0) throw new Error("desktop-media-truncated");
    hash.update(buffer.subarray(0, bytesRead));
    position += bytesRead;
  }
  return `sha256:${hash.digest("hex")}`;
};

const parseRange = (header: string | null, size: number): ByteRange | null => {
  if (header === null) return { start: 0, end: size - 1 };
  const match = /^bytes=(\d*)-(\d*)$/u.exec(header);
  if (match === null || (match[1] === "" && match[2] === "")) return null;
  if (match[1] === "") {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    return { start: Math.max(0, size - suffixLength), end: size - 1 };
  }
  const start = Number(match[1]);
  const requestedEnd = match[2] === "" ? size - 1 : Number(match[2]);
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(requestedEnd) ||
    start < 0 ||
    start >= size ||
    requestedEnd < start
  ) {
    return null;
  }
  return { start, end: Math.min(requestedEnd, size - 1) };
};

const rangeStream = (
  handle: FileHandle,
  { start, end }: ByteRange,
): ReadableStream<Uint8Array> =>
  Readable.toWeb(
    handle.createReadStream({ autoClose: false, start, end }),
  ) as ReadableStream<Uint8Array>;

const unavailable = (status: number) =>
  new Response(null, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

export class DesktopMediaProtocol {
  #deliveryRoot: string | null = null;
  #tickets = new Map<string, MediaTicket>();
  #closed = false;

  selectWorkspace = async (workspaceRoot: string) => {
    if (this.#closed) throw new Error("desktop-media-protocol-closed");
    await this.#replaceTickets(new Map());
    this.#deliveryRoot = join(workspaceRoot, "deliveries");
  };

  replaceCatalog = async (catalog: PreviewCatalog) => {
    if (this.#closed) throw new Error("desktop-media-protocol-closed");
    const next = new Map<string, MediaTicket>();
    try {
      for (const entry of catalog.entries) {
        const url = buildPreviewVideoUrl(entry);
        const previous = this.#tickets.get(url);
        const ticket =
          previous !== undefined &&
          previous.checksum === entry.video.checksum &&
          previous.identity.size === entry.video.sizeBytes &&
          (await this.#isCurrent(previous))
            ? previous
            : await this.#openTicket(entry);
        if (next.has(ticket.url)) throw new Error("desktop-media-url-conflict");
        next.set(ticket.url, ticket);
      }
    } catch (error) {
      await Promise.allSettled(
        [...next.values()].map(({ handle }) => handle.close()),
      );
      await this.#replaceTickets(new Map());
      throw error;
    }
    if (this.#closed) {
      await Promise.allSettled(
        [...next.values()].map(({ handle }) => handle.close()),
      );
      throw new Error("desktop-media-protocol-closed");
    }
    await this.#replaceTickets(next);
  };

  handleRequest = async (request: Request) => {
    if (this.#closed) return unavailable(503);
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response(null, {
        status: 405,
        headers: {
          Allow: "GET, HEAD",
          "Cache-Control": "no-store",
          "Content-Length": "0",
        },
      });
    }
    const ticket = this.#tickets.get(request.url);
    if (ticket === undefined) return unavailable(404);
    if (!(await this.#isCurrent(ticket))) return unavailable(409);

    const rangeHeader = request.headers.get("range");
    const range = parseRange(rangeHeader, ticket.identity.size);
    if (range === null) {
      return new Response(null, {
        status: 416,
        headers: {
          "Accept-Ranges": "bytes",
          "Cache-Control": "no-store",
          "Content-Length": "0",
          "Content-Range": `bytes */${ticket.identity.size}`,
        },
      });
    }
    const isPartial = rangeHeader !== null;
    const contentLength = range.end - range.start + 1;
    const headers = new Headers({
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
      "Content-Length": String(contentLength),
      "Content-Type": VIDEO_CONTENT_TYPE,
    });
    if (isPartial) {
      headers.set(
        "Content-Range",
        `bytes ${range.start}-${range.end}/${ticket.identity.size}`,
      );
    }
    return new Response(
      request.method === "HEAD" ? null : rangeStream(ticket.handle, range),
      { status: isPartial ? 206 : 200, headers },
    );
  };

  close = async () => {
    if (this.#closed) return;
    this.#closed = true;
    await this.#replaceTickets(new Map());
  };

  #openTicket = async (entry: PreviewCatalogEntry): Promise<MediaTicket> => {
    if (this.#deliveryRoot === null) {
      throw new Error("desktop-media-workspace-not-selected");
    }
    const path = join(
      this.#deliveryRoot,
      entry.storyId,
      "video.mp4",
    );
    const pathStat = await lstat(path, { bigint: true });
    if (!pathStat.isFile() || pathStat.isSymbolicLink()) {
      throw new Error("desktop-media-file-invalid");
    }
    if ((await realpath(path)) !== path) {
      throw new Error("desktop-media-path-invalid");
    }
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const identity = toIdentity(await handle.stat({ bigint: true }));
      if (
        !sameIdentity(identity, toIdentity(pathStat)) ||
        identity.size !== entry.video.sizeBytes ||
        (await checksumHandle(handle, identity.size)) !== entry.video.checksum
      ) {
        throw new Error("desktop-media-identity-invalid");
      }
      return {
        url: buildPreviewVideoUrl(entry),
        path,
        handle,
        checksum: entry.video.checksum,
        identity,
      };
    } catch (error) {
      await handle.close();
      throw error;
    }
  };

  #isCurrent = async (ticket: MediaTicket) => {
    try {
      const [descriptorStat, pathStat, currentPath] = await Promise.all([
        ticket.handle.stat({ bigint: true }),
        lstat(ticket.path, { bigint: true }),
        realpath(ticket.path),
      ]);
      const descriptorIdentity = toIdentity(descriptorStat);
      if (
        currentPath !== ticket.path ||
        !pathStat.isFile() ||
        pathStat.isSymbolicLink() ||
        !sameIdentity(descriptorIdentity, ticket.identity) ||
        !sameIdentity(toIdentity(pathStat), ticket.identity)
      ) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  };

  #replaceTickets = async (next: Map<string, MediaTicket>) => {
    const previous = this.#tickets;
    this.#tickets = next;
    const retained = new Set(next.values());
    await Promise.allSettled(
      [...previous.values()]
        .filter((ticket) => !retained.has(ticket))
        .map(({ handle }) => handle.close()),
    );
  };
}

export type MediaProtocolPort = Readonly<{
  handle: (
    scheme: string,
    handler: (request: Request) => Promise<Response>,
  ) => void;
  unhandle: (scheme: string) => void;
}>;

export const registerDesktopMediaProtocol = ({
  protocol,
  media,
}: Readonly<{
  protocol: MediaProtocolPort;
  media: DesktopMediaProtocol;
}>) => {
  protocol.handle(DESKTOP_MEDIA_SCHEME, media.handleRequest);
  return () => protocol.unhandle(DESKTOP_MEDIA_SCHEME);
};

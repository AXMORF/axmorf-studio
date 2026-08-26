import { createHash, randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, realpath, type FileHandle } from "node:fs/promises";
import { join } from "node:path";

import {
  buildPreviewVideoUrl,
  DESKTOP_MEDIA_SCHEME,
  parsePreviewVideoUrl,
  projectPreviewCatalogForPlayer,
  type PreviewCatalog,
  type PreviewCatalogEntry,
  type PreviewPlayerCatalog,
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

type MediaTicket = {
  readonly storyId: PreviewCatalogEntry["storyId"];
  readonly deliveryBuildId: PreviewCatalogEntry["deliveryBuildId"];
  readonly requestNonce: string;
  url: string;
  path: string;
  handle: FileHandle;
  checksum: string;
  identity: FileIdentity;
  activeRequests: number;
  retired: boolean;
  closePromise: Promise<void> | null;
};

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
  release: () => void,
): ReadableStream<Uint8Array> => {
  let position = start;
  let released = false;
  const releaseOnce = () => {
    if (released) return;
    released = true;
    release();
  };
  return new ReadableStream<Uint8Array>({
    pull: async (controller) => {
      if (position > end) {
        controller.close();
        releaseOnce();
        return;
      }
      const length = Math.min(READ_CHUNK_BYTES, end - position + 1);
      const buffer = Buffer.allocUnsafe(length);
      try {
        const { bytesRead } = await handle.read(buffer, 0, length, position);
        if (bytesRead === 0) throw new Error("desktop-media-truncated");
        position += bytesRead;
        controller.enqueue(buffer.subarray(0, bytesRead));
        if (position > end) {
          controller.close();
          releaseOnce();
        }
      } catch (error) {
        controller.error(error);
        releaseOnce();
      }
    },
    cancel: () => releaseOnce(),
  });
};

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

  replaceCatalog = async (
    catalog: PreviewCatalog,
  ): Promise<PreviewPlayerCatalog> => {
    if (this.#closed) throw new Error("desktop-media-protocol-closed");
    try {
      return await this.#bindCatalog(catalog, null);
    } catch (error) {
      await this.#replaceTickets(new Map());
      throw error;
    }
  };

  recoverPlayback = async (
    catalog: PreviewCatalog,
    storyId: PreviewCatalogEntry["storyId"],
  ): Promise<PreviewPlayerCatalog> => {
    if (this.#closed) throw new Error("desktop-media-protocol-closed");
    if (!catalog.entries.some((entry) => entry.storyId === storyId)) {
      throw new Error("desktop-media-recovery-entry-missing");
    }
    return this.#bindCatalog(catalog, storyId);
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
    const mediaRequest = parsePreviewVideoUrl(request.url);
    if (mediaRequest === null) return unavailable(404);
    const ticket = this.#tickets.get(mediaRequest.storyId);
    if (ticket === undefined) return unavailable(404);
    if (
      ticket.deliveryBuildId !== mediaRequest.deliveryBuildId ||
      ticket.requestNonce !== mediaRequest.requestNonce ||
      ticket.url !== request.url
    ) {
      return unavailable(404);
    }
    const release = this.#acquire(ticket);
    if (release === null) return unavailable(404);
    if (!(await this.#isCurrent(ticket))) {
      release();
      return unavailable(409);
    }

    const rangeHeader = request.headers.get("range");
    const range = parseRange(rangeHeader, ticket.identity.size);
    if (range === null) {
      release();
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
    if (request.method === "HEAD") release();
    return new Response(
      request.method === "HEAD"
        ? null
        : rangeStream(ticket.handle, range, release),
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
    const path = join(this.#deliveryRoot, entry.storyId, "video.mp4");
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
      const requestNonce = randomBytes(16).toString("hex");
      return {
        storyId: entry.storyId,
        deliveryBuildId: entry.deliveryBuildId,
        requestNonce,
        url: buildPreviewVideoUrl({
          storyId: entry.storyId,
          deliveryBuildId: entry.deliveryBuildId,
          requestNonce,
        }),
        path,
        handle,
        checksum: entry.video.checksum,
        identity,
        activeRequests: 0,
        retired: false,
        closePromise: null,
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

  #bindCatalog = async (
    catalog: PreviewCatalog,
    recoveryStoryId: PreviewCatalogEntry["storyId"] | null,
  ) => {
    const next = new Map<string, MediaTicket>();
    const opened: MediaTicket[] = [];
    try {
      for (const entry of catalog.entries) {
        const previous = this.#tickets.get(entry.storyId);
        const ticket =
          entry.storyId !== recoveryStoryId &&
          previous !== undefined &&
          previous.deliveryBuildId === entry.deliveryBuildId &&
          previous.checksum === entry.video.checksum &&
          previous.identity.size === entry.video.sizeBytes &&
          (await this.#isCurrent(previous))
            ? previous
            : await this.#openTicket(entry);
        if (ticket !== previous) opened.push(ticket);
        if (next.has(entry.storyId)) {
          throw new Error("desktop-media-story-conflict");
        }
        next.set(entry.storyId, ticket);
      }
      if (this.#closed) throw new Error("desktop-media-protocol-closed");
      const playerCatalog = projectPreviewCatalogForPlayer(catalog, (entry) => {
        const ticket = next.get(entry.storyId);
        if (
          ticket === undefined ||
          ticket.deliveryBuildId !== entry.deliveryBuildId
        ) {
          throw new Error("desktop-media-ticket-missing");
        }
        return ticket.url;
      });
      await this.#replaceTickets(next);
      return playerCatalog;
    } catch (error) {
      await Promise.allSettled(opened.map(({ handle }) => handle.close()));
      throw error;
    }
  };

  #acquire = (ticket: MediaTicket) => {
    if (ticket.retired) return null;
    ticket.activeRequests += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      ticket.activeRequests -= 1;
      if (ticket.activeRequests < 0) {
        throw new Error("desktop-media-ticket-lease-invalid");
      }
      void this.#closeIfIdle(ticket)?.catch(() => undefined);
    };
  };

  #closeIfIdle = (ticket: MediaTicket) => {
    if (
      !ticket.retired ||
      ticket.activeRequests !== 0 ||
      ticket.closePromise !== null
    ) {
      return ticket.closePromise;
    }
    ticket.closePromise = ticket.handle.close();
    return ticket.closePromise;
  };

  #retire = (ticket: MediaTicket) => {
    // Removing the ticket blocks new lookups immediately. A response that
    // acquired its lease before rotation keeps the descriptor alive until its
    // body finishes or is cancelled.
    ticket.retired = true;
    return this.#closeIfIdle(ticket);
  };

  #replaceTickets = async (next: Map<string, MediaTicket>) => {
    const previous = this.#tickets;
    this.#tickets = next;
    const retained = new Set(next.values());
    await Promise.allSettled(
      [...previous.values()]
        .filter((ticket) => !retained.has(ticket))
        .map((ticket) => this.#retire(ticket)),
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

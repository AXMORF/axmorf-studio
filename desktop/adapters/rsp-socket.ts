import { randomUUID, timingSafeEqual } from "node:crypto";
import {
  chmod,
  link,
  lstat,
  readFile,
  realpath,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { dirname, join, relative, resolve, sep } from "node:path";

import {
  DoctorResponseSchema,
  RSP_PROTOCOL_VERSION,
  SessionRecordSchema,
  type DoctorResponse,
  type SessionRecord,
} from "../contracts/protocol";

const SESSION_FILE_NAME = "session.json";
const TOKEN_FILE_NAME = "token";
const SOCKET_FILE_NAME = "rsp.sock";
const MAX_RESPONSE_BYTES = 1024 * 1024;

const isContained = (parent: string, candidate: string) => {
  const path = relative(parent, candidate);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== "..");
};

const writeAtomicOwnerOnly = async (path: string, contents: string) => {
  const stagingPath = join(
    dirname(path),
    `.${path.split(sep).at(-1)}.${process.pid}.${randomUUID()}.tmp`,
  );
  await writeFile(stagingPath, contents, { flag: "wx", mode: 0o600 });
  try {
    await chmod(stagingPath, 0o600);
    try {
      await link(stagingPath, path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        throw new Error("rsp-session-target-already-exists", { cause: error });
      }
      throw error;
    }
    await unlink(stagingPath);
    await chmod(path, 0o600);
  } catch (error) {
    await rm(stagingPath, { force: true });
    throw error;
  }
};

const tokenMatches = (authorization: string | undefined, token: Uint8Array) => {
  if (authorization === undefined || !authorization.startsWith("Bearer ")) {
    return false;
  }
  const provided = Buffer.from(authorization.slice("Bearer ".length), "utf8");
  const expected = Buffer.from(token).toString("hex");
  const expectedBytes = Buffer.from(expected, "utf8");
  return (
    provided.length === expectedBytes.length &&
    timingSafeEqual(provided, expectedBytes)
  );
};

const respond = (
  response: import("node:http").ServerResponse,
  statusCode: number,
  value: unknown,
) => {
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`);
  if (bytes.length > MAX_RESPONSE_BYTES) {
    throw new Error("rsp doctor response exceeded the fixed size limit.");
  }
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store, max-age=0");
  response.setHeader("x-content-type-options", "nosniff");
  response.end(bytes);
};

const listen = (server: Server, socketPath: string) =>
  new Promise<void>((resolvePromise, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolvePromise();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(socketPath);
  });

const closeServer = (server: Server) =>
  new Promise<void>((resolvePromise, reject) => {
    server.close((error) =>
      error === undefined ? resolvePromise() : reject(error),
    );
  });

const readOwnedSession = async (sessionPath: string) => {
  const stats = await lstat(sessionPath);
  if (
    !stats.isFile() ||
    stats.isSymbolicLink() ||
    (stats.mode & 0o777) !== 0o600
  ) {
    throw new Error("rsp-session-record-untrusted");
  }
  return SessionRecordSchema.parse(
    JSON.parse(await readFile(sessionPath, "utf8")),
  );
};

const removeOwnedStaleSocket = async ({
  socketPath,
  sessionPath,
  workspaceId,
  isPidRunning,
  now,
}: {
  readonly socketPath: string;
  readonly sessionPath: string;
  readonly workspaceId: string;
  readonly isPidRunning: (pid: number) => boolean;
  readonly now: Date;
}) => {
  let socketStats;
  try {
    socketStats = await lstat(socketPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  if (!socketStats.isSocket() || socketStats.isSymbolicLink()) {
    throw new Error("rsp-socket-path-untrusted");
  }
  const previous = await readOwnedSession(sessionPath);
  if (
    previous.workspaceId !== workspaceId ||
    previous.socketPath !== socketPath
  ) {
    throw new Error("rsp-stale-session-ownership-mismatch");
  }
  const expired = Date.parse(previous.expiresAt) <= now.getTime();
  if (!expired && isPidRunning(previous.enginePid)) {
    throw new Error("rsp-session-already-active");
  }
  await rm(socketPath);
};

const removeOwnedStaleSessionFiles = async ({
  sessionPath,
  tokenPath,
  socketPath,
  workspaceId,
  isPidRunning,
  now,
}: {
  readonly sessionPath: string;
  readonly tokenPath: string;
  readonly socketPath: string;
  readonly workspaceId: string;
  readonly isPidRunning: (pid: number) => boolean;
  readonly now: Date;
}) => {
  let previous: SessionRecord;
  try {
    previous = await readOwnedSession(sessionPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      try {
        await lstat(tokenPath);
      } catch (tokenError) {
        if ((tokenError as NodeJS.ErrnoException).code === "ENOENT") return;
        throw tokenError;
      }
      throw new Error("rsp-orphan-token-untrusted");
    }
    throw error;
  }
  if (
    previous.workspaceId !== workspaceId ||
    previous.socketPath !== socketPath
  ) {
    throw new Error("rsp-stale-session-ownership-mismatch");
  }
  const expired = Date.parse(previous.expiresAt) <= now.getTime();
  if (!expired && isPidRunning(previous.enginePid)) {
    throw new Error("rsp-session-already-active");
  }
  const tokenStats = await lstat(tokenPath);
  if (
    !tokenStats.isFile() ||
    tokenStats.isSymbolicLink() ||
    (tokenStats.mode & 0o777) !== 0o600
  ) {
    throw new Error("rsp-token-record-untrusted");
  }
  await Promise.all([rm(sessionPath), rm(tokenPath)]);
};

export type RspDoctorServerHandle = Readonly<{
  record: SessionRecord;
  close: () => Promise<void>;
}>;

export const startRspDoctorServer = async ({
  workspaceRoot,
  workspaceId,
  appPid,
  enginePid,
  expiresAt,
  token,
  getDoctorState,
  now = () => new Date(),
  isPidRunning = (pid: number) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  },
}: {
  readonly workspaceRoot: string;
  readonly workspaceId: string;
  readonly appPid: number;
  readonly enginePid: number;
  readonly expiresAt: string;
  readonly token: Uint8Array;
  readonly getDoctorState: () => DoctorResponse;
  readonly now?: () => Date;
  readonly isPidRunning?: (pid: number) => boolean;
}): Promise<RspDoctorServerHandle> => {
  if (token.byteLength < 32) throw new Error("rsp-token-too-short");
  const canonicalWorkspace = await realpath(workspaceRoot);
  const sessionDirectory = resolve(canonicalWorkspace, ".rsp/session");
  const sessionDirectoryStats = await lstat(sessionDirectory);
  if (
    sessionDirectoryStats.isSymbolicLink() ||
    !sessionDirectoryStats.isDirectory() ||
    (sessionDirectoryStats.mode & 0o777) !== 0o700
  ) {
    throw new Error("rsp-session-path-untrusted");
  }
  const canonicalSessionDirectory = await realpath(sessionDirectory);
  if (
    canonicalSessionDirectory !== sessionDirectory ||
    !isContained(canonicalWorkspace, canonicalSessionDirectory)
  ) {
    throw new Error("rsp-session-path-escape");
  }
  const socketPath = join(canonicalSessionDirectory, SOCKET_FILE_NAME);
  const sessionPath = join(canonicalSessionDirectory, SESSION_FILE_NAME);
  const tokenPath = join(canonicalSessionDirectory, TOKEN_FILE_NAME);
  for (const path of [socketPath, sessionPath, tokenPath]) {
    if (!isContained(canonicalSessionDirectory, path)) {
      throw new Error("rsp-session-path-escape");
    }
  }
  await removeOwnedStaleSocket({
    socketPath,
    sessionPath,
    workspaceId,
    isPidRunning,
    now: now(),
  });
  await removeOwnedStaleSessionFiles({
    sessionPath,
    tokenPath,
    socketPath,
    workspaceId,
    isPidRunning,
    now: now(),
  });
  const record = SessionRecordSchema.parse({
    schemaVersion: 1,
    protocolVersion: RSP_PROTOCOL_VERSION,
    workspaceId,
    socketPath,
    appPid,
    enginePid,
    expiresAt,
  });
  const server = createServer((request, response) => {
    if (request.method !== "GET" || request.url !== "/v1/doctor") {
      respond(response, 404, { code: "rsp-not-found" });
      return;
    }
    if (request.headers["x-rsp-protocol-version"] !== RSP_PROTOCOL_VERSION) {
      respond(response, 426, { code: "rsp-protocol-incompatible" });
      return;
    }
    if (!tokenMatches(request.headers.authorization, token)) {
      respond(response, 401, { code: "rsp-unauthorized" });
      return;
    }
    if (Date.parse(expiresAt) <= now().getTime()) {
      respond(response, 503, { code: "rsp-app-unavailable" });
      return;
    }
    try {
      respond(response, 200, DoctorResponseSchema.parse(getDoctorState()));
    } catch {
      respond(response, 503, { code: "rsp-app-unavailable" });
    }
  });
  let socketOwned = false;
  try {
    await writeAtomicOwnerOnly(
      tokenPath,
      `${Buffer.from(token).toString("hex")}\n`,
    );
    await writeAtomicOwnerOnly(
      sessionPath,
      `${JSON.stringify(record, null, 2)}\n`,
    );
    await listen(server, socketPath);
    socketOwned = true;
    await chmod(socketPath, 0o600);
  } catch (error) {
    if (server.listening) await closeServer(server).catch(() => undefined);
    await Promise.all([
      ...(socketOwned ? [rm(socketPath, { force: true })] : []),
      rm(sessionPath, { force: true }),
      rm(tokenPath, { force: true }),
    ]);
    throw error;
  }
  let closed = false;
  return {
    record,
    close: async () => {
      if (closed) return;
      closed = true;
      if (server.listening) await closeServer(server);
      let current: SessionRecord | undefined;
      try {
        current = await readOwnedSession(sessionPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      if (
        current !== undefined &&
        current.workspaceId === record.workspaceId &&
        current.socketPath === record.socketPath &&
        current.enginePid === record.enginePid
      ) {
        await Promise.all([
          rm(socketPath, { force: true }),
          rm(sessionPath, { force: true }),
          rm(tokenPath, { force: true }),
        ]);
      }
    },
  };
};

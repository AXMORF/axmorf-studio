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
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { dirname, join, relative, resolve, sep } from "node:path";

import {
  RSP_MAX_REQUEST_BYTES,
  RSP_PROTOCOL_VERSION,
  RspCommandRequestSchema,
  RspCommandResponseSchema,
  SessionRecordSchema,
  type DoctorResponse,
  type RspCommandRequest,
  type SessionRecord,
} from "../contracts/protocol";
import {
  RspPublicCommandError,
  type RspFieldIssue,
} from "../contracts/issues";

const SESSION_FILE_NAME = "session.json";
const TOKEN_FILE_NAME = "token";
const SOCKET_FILE_NAME = "rsp.sock";
const COMMAND_PATH = "/v2/command";
const MAX_RESPONSE_BYTES = 1024 * 1024;
const INVALID_REQUEST_ID = "rsp-invalid-request";

export { RspPublicCommandError as RspCommandFailure } from "../contracts/issues";

class RspRequestFailure extends Error {
  readonly code:
    | "rsp-request-invalid"
    | "rsp-workspace-invalid"
    | "rsp-request-body-too-large";

  constructor(code: RspRequestFailure["code"]) {
    super(code);
    this.code = code;
  }
}

const readJsonBody = (request: IncomingMessage) =>
  new Promise<unknown>((resolvePromise, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const rejectOnce = (failure: RspRequestFailure) => {
      if (settled) return;
      settled = true;
      reject(failure);
    };
    request.on("data", (chunk: Buffer) => {
      if (settled) return;
      size += chunk.length;
      if (size > RSP_MAX_REQUEST_BYTES) {
        chunks.length = 0;
        rejectOnce(new RspRequestFailure("rsp-request-body-too-large"));
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
    request.on("end", () => {
      if (settled) return;
      settled = true;
      try {
        resolvePromise(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new RspRequestFailure("rsp-request-invalid"));
      }
    });
    request.on("aborted", () =>
      rejectOnce(new RspRequestFailure("rsp-request-invalid")),
    );
    request.on("error", () =>
      rejectOnce(new RspRequestFailure("rsp-request-invalid")),
    );
  });

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
  const expected = Buffer.from(Buffer.from(token).toString("hex"), "utf8");
  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
};

const respond = (
  response: ServerResponse,
  statusCode: number,
  value: unknown,
) => {
  if (response.destroyed || response.writableEnded) return;
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`);
  if (bytes.length > MAX_RESPONSE_BYTES) {
    throw new Error("rsp-response-too-large");
  }
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store, max-age=0");
  response.setHeader("x-content-type-options", "nosniff");
  response.end(bytes);
};

const errorResponse = ({
  response,
  requestId,
  statusCode,
  code,
  message,
  issues = [],
}: {
  readonly response: ServerResponse;
  readonly requestId: string;
  readonly statusCode: number;
  readonly code: string;
  readonly message: string;
  readonly issues?: readonly RspFieldIssue[];
}) =>
  respond(
    response,
    statusCode,
    RspCommandResponseSchema.parse({
      protocolVersion: RSP_PROTOCOL_VERSION,
      requestId,
      ok: false,
      error: { code, message, ...(issues.length === 0 ? {} : { issues }) },
    }),
  );

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

export type RspCommandExecutor = (
  request: RspCommandRequest,
) => Promise<unknown>;

export type RspCommandAuthorizer = (request: RspCommandRequest) => void;

export const startRspDoctorServer = async ({
  workspaceRoot,
  workspaceId,
  appPid,
  enginePid,
  expiresAt,
  token,
  getDoctorState,
  authorizeCommand,
  executeCommand,
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
  readonly authorizeCommand?: RspCommandAuthorizer;
  readonly executeCommand?: RspCommandExecutor;
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
    schemaVersion: 2,
    protocolVersion: RSP_PROTOCOL_VERSION,
    workspaceId,
    socketPath,
    appPid,
    enginePid,
    expiresAt,
  });
  let mutatingQueue = Promise.resolve();
  const readonlyCommands = new Set<RspCommandRequest["command"]>([
    "doctor",
    "project-create-context",
    "project-validate",
    "project-list",
    "context",
    "inspect",
    "attempt-status",
    "task-describe",
    "task-check",
  ]);
  const runCommand = (command: RspCommandRequest) => {
    if (command.command === "doctor") return Promise.resolve(getDoctorState());
    if (executeCommand === undefined) {
      return Promise.reject(
        new RspPublicCommandError(
          "rsp-command-failed",
          "The requested command is unavailable.",
        ),
      );
    }
    try {
      authorizeCommand?.(command);
    } catch (error) {
      return Promise.reject(error);
    }
    if (readonlyCommands.has(command.command)) return executeCommand(command);
    const queued = mutatingQueue.then(() => executeCommand(command));
    mutatingQueue = queued.then(
      () => undefined,
      () => undefined,
    );
    return queued;
  };
  const server = createServer((request, response) => {
    let responseRequestId = INVALID_REQUEST_ID;
    if (request.method !== "POST" || request.url !== COMMAND_PATH) {
      respond(response, 404, { code: "rsp-not-found" });
      return;
    }
    if (request.headers["x-rsp-protocol-version"] !== RSP_PROTOCOL_VERSION) {
      errorResponse({
        response,
        requestId: INVALID_REQUEST_ID,
        statusCode: 426,
        code: "rsp-protocol-incompatible",
        message: "App protocol is incompatible.",
      });
      return;
    }
    if (!tokenMatches(request.headers.authorization, token)) {
      errorResponse({
        response,
        requestId: INVALID_REQUEST_ID,
        statusCode: 401,
        code: "rsp-unauthorized",
        message: "Session authorization failed.",
      });
      return;
    }
    if (Date.parse(expiresAt) <= now().getTime()) {
      errorResponse({
        response,
        requestId: INVALID_REQUEST_ID,
        statusCode: 503,
        code: "rsp-app-unavailable",
        message: "App session is stale.",
      });
      return;
    }
    if (request.headers["content-type"] !== "application/json") {
      errorResponse({
        response,
        requestId: INVALID_REQUEST_ID,
        statusCode: 400,
        code: "rsp-request-invalid",
        message: "Request content type must be application/json.",
      });
      request.resume();
      return;
    }
    const contentLength = Number(request.headers["content-length"] ?? 0);
    if (
      !Number.isSafeInteger(contentLength) ||
      contentLength < 0 ||
      contentLength > RSP_MAX_REQUEST_BYTES
    ) {
      errorResponse({
        response,
        requestId: INVALID_REQUEST_ID,
        statusCode: 413,
        code: "rsp-request-invalid",
        message: "Request body exceeds the fixed size limit.",
      });
      request.resume();
      return;
    }
    void readJsonBody(request)
      .then((raw) => {
        const parsed = RspCommandRequestSchema.safeParse(raw);
        if (!parsed.success) {
          throw new RspRequestFailure("rsp-request-invalid");
        }
        if (parsed.data.workspaceId !== workspaceId) {
          throw new RspRequestFailure("rsp-workspace-invalid");
        }
        responseRequestId = parsed.data.requestId;
        return runCommand(parsed.data).then((result) => ({
          command: parsed.data,
          result,
        }));
      })
      .then(({ command, result }) =>
        respond(
          response,
          200,
          RspCommandResponseSchema.parse({
            protocolVersion: RSP_PROTOCOL_VERSION,
            requestId: command.requestId,
            ok: true,
            result: result ?? null,
          }),
        ),
      )
      .catch((error: unknown) => {
        if (response.headersSent || response.destroyed) return;
        if (error instanceof RspRequestFailure) {
          const bodyTooLarge = error.code === "rsp-request-body-too-large";
          const workspaceInvalid = error.code === "rsp-workspace-invalid";
          errorResponse({
            response,
            requestId: responseRequestId,
            statusCode: bodyTooLarge ? 413 : workspaceInvalid ? 403 : 400,
            code: workspaceInvalid
              ? "rsp-workspace-invalid"
              : "rsp-request-invalid",
            message: bodyTooLarge
              ? "Request body exceeds the fixed size limit."
              : workspaceInvalid
                ? "Request Workspace does not match the active session."
                : "Request does not match rsp-local-v2.",
          });
          return;
        }
        const failure =
          error instanceof RspPublicCommandError
            ? error
            : new RspPublicCommandError(
                "rsp-command-failed",
                "The requested command failed.",
              );
        errorResponse({
          response,
          requestId: responseRequestId,
          statusCode: failure.code === "rsp-conflict" ? 409 : 422,
          code: failure.code,
          message: failure.message,
          issues: failure.issues,
        });
      });
  });
  server.requestTimeout = 0;
  server.headersTimeout = 10_000;
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

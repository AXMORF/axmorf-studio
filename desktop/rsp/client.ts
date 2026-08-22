import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { request } from "node:http";
import { dirname, join, relative, resolve, sep } from "node:path";

import {
  DoctorResponseSchema,
  RSP_CLI_FAILURES,
  RSP_PROTOCOL_VERSION,
  SessionRecordSchema,
} from "../contracts/protocol";
import {
  ManagedFilesLedgerSchema,
  WorkspaceManifestSchema,
} from "../contracts/workspace";

const MAX_BODY_BYTES = 1024 * 1024;

type CliFailureKey = keyof typeof RSP_CLI_FAILURES;

class RspCliFailure extends Error {
  readonly failure: (typeof RSP_CLI_FAILURES)[CliFailureKey];

  constructor(key: CliFailureKey, message: string) {
    super(message);
    this.failure = RSP_CLI_FAILURES[key];
  }
}

const isContained = (parent: string, candidate: string) => {
  const path = relative(parent, candidate);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== "..");
};

const readRegularOwnerOnly = async (path: string) => {
  const stats = await lstat(path);
  if (
    !stats.isFile() ||
    stats.isSymbolicLink() ||
    (stats.mode & 0o777) !== 0o600
  ) {
    throw new RspCliFailure(
      "unauthorized",
      "Session credential permissions are invalid.",
    );
  }
  return readFile(path, "utf8");
};

const readWorkspaceJson = async (path: string) => {
  const stats = await lstat(path);
  if (
    !stats.isFile() ||
    stats.isSymbolicLink() ||
    (stats.mode & 0o777) !== 0o600
  ) {
    throw new RspCliFailure(
      "workspaceInvalid",
      "Workspace control file permissions are invalid.",
    );
  }
  return JSON.parse(await readFile(path, "utf8")) as unknown;
};

const assertPrivateDirectory = async (path: string) => {
  const stats = await lstat(path);
  if (
    !stats.isDirectory() ||
    stats.isSymbolicLink() ||
    (stats.mode & 0o777) !== 0o700 ||
    (await realpath(path)) !== path
  ) {
    throw new RspCliFailure(
      "workspaceInvalid",
      "Workspace session directory is invalid.",
    );
  }
};

const assertSessionSocket = async (path: string) => {
  let stats;
  try {
    stats = await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new RspCliFailure("appUnavailable", "App session is unavailable.");
    }
    throw error;
  }
  if (
    !stats.isSocket() ||
    stats.isSymbolicLink() ||
    (stats.mode & 0o777) !== 0o600
  ) {
    throw new RspCliFailure(
      "workspaceInvalid",
      "Session socket is not Workspace-owned.",
    );
  }
};

const requestDoctor = async ({
  socketPath,
  token,
}: {
  readonly socketPath: string;
  readonly token: string;
}) =>
  new Promise<unknown>((resolvePromise, reject) => {
    const outgoing = request(
      {
        socketPath,
        path: "/v1/doctor",
        method: "GET",
        headers: {
          authorization: `Bearer ${token}`,
          "x-rsp-protocol-version": RSP_PROTOCOL_VERSION,
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BODY_BYTES) {
            outgoing.destroy(
              new Error("rsp response exceeded the fixed size limit"),
            );
            return;
          }
          chunks.push(Buffer.from(chunk));
        });
        response.on("end", () => {
          let body: unknown;
          try {
            body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          } catch {
            reject(
              new RspCliFailure(
                "appUnavailable",
                "App returned an invalid response.",
              ),
            );
            return;
          }
          if (response.statusCode === 401) {
            reject(
              new RspCliFailure(
                "unauthorized",
                "Session authorization failed.",
              ),
            );
          } else if (response.statusCode === 426) {
            reject(
              new RspCliFailure(
                "protocolIncompatible",
                "App protocol is incompatible.",
              ),
            );
          } else if (response.statusCode !== 200) {
            reject(
              new RspCliFailure("appUnavailable", "App doctor is unavailable."),
            );
          } else {
            resolvePromise(body);
          }
        });
      },
    );
    outgoing.setTimeout(5_000, () =>
      outgoing.destroy(new Error("rsp request timed out")),
    );
    outgoing.once("error", (error) => reject(error));
    outgoing.end();
  });

const doctor = async (moduleDirectory: string) => {
  const workspaceRoot = resolve(moduleDirectory, "../..");
  let canonicalWorkspace: string;
  try {
    canonicalWorkspace = await realpath(workspaceRoot);
  } catch {
    throw new RspCliFailure("workspaceInvalid", "Workspace root is invalid.");
  }
  let manifest;
  let ledger;
  try {
    manifest = WorkspaceManifestSchema.parse(
      await readWorkspaceJson(join(canonicalWorkspace, ".rsp/workspace.json")),
    );
    ledger = ManagedFilesLedgerSchema.parse(
      await readWorkspaceJson(
        join(canonicalWorkspace, ".rsp/managed-files.json"),
      ),
    );
  } catch {
    throw new RspCliFailure(
      "workspaceInvalid",
      "Workspace contract is invalid.",
    );
  }
  if (ledger.workspaceId !== manifest.workspaceId || ledger.state !== "ready") {
    throw new RspCliFailure(
      "workspaceInvalid",
      "Workspace integration is incomplete.",
    );
  }
  const sessionDirectory = join(canonicalWorkspace, ".rsp/session");
  try {
    await assertPrivateDirectory(join(canonicalWorkspace, ".rsp"));
    await assertPrivateDirectory(sessionDirectory);
  } catch (error) {
    if (error instanceof RspCliFailure) throw error;
    throw new RspCliFailure(
      "workspaceInvalid",
      "Workspace session directory is invalid.",
    );
  }
  const sessionPath = join(sessionDirectory, "session.json");
  const tokenPath = join(sessionDirectory, "token");
  let session;
  try {
    const rawSession = JSON.parse(
      await readRegularOwnerOnly(sessionPath),
    ) as unknown;
    if (
      typeof rawSession === "object" &&
      rawSession !== null &&
      "protocolVersion" in rawSession &&
      rawSession.protocolVersion !== RSP_PROTOCOL_VERSION
    ) {
      throw new RspCliFailure(
        "protocolIncompatible",
        "App protocol is incompatible.",
      );
    }
    session = SessionRecordSchema.parse(rawSession);
  } catch (error) {
    if (error instanceof RspCliFailure) throw error;
    throw new RspCliFailure("appUnavailable", "App session is unavailable.");
  }
  if (
    session.workspaceId !== manifest.workspaceId ||
    Date.parse(session.expiresAt) <= Date.now()
  ) {
    throw new RspCliFailure("appUnavailable", "App session is stale.");
  }
  if (
    !isContained(sessionDirectory, session.socketPath) ||
    dirname(session.socketPath) !== sessionDirectory
  ) {
    throw new RspCliFailure(
      "workspaceInvalid",
      "Session socket escaped the Workspace.",
    );
  }
  await assertSessionSocket(session.socketPath);
  let token: string;
  try {
    token = (await readRegularOwnerOnly(tokenPath)).trim();
  } catch (error) {
    if (error instanceof RspCliFailure) throw error;
    throw new RspCliFailure(
      "unauthorized",
      "Session credential is unavailable.",
    );
  }
  if (!/^(?:[a-f0-9]{2}){32,}$/u.test(token)) {
    throw new RspCliFailure("unauthorized", "Session credential is invalid.");
  }
  try {
    return DoctorResponseSchema.parse(
      await requestDoctor({ socketPath: session.socketPath, token }),
    );
  } catch (error) {
    if (error instanceof RspCliFailure) throw error;
    throw new RspCliFailure("appUnavailable", "App session is unavailable.");
  }
};

export type RspCliIo = Readonly<{
  stdout: (value: string) => void;
  stderr: (value: string) => void;
}>;

export const executeRspCli = async (
  args: readonly string[],
  moduleDirectory: string,
  io: RspCliIo,
) => {
  try {
    if (args.length !== 1 || args[0] !== "doctor") {
      throw new RspCliFailure(
        "workspaceInvalid",
        "Phase A only supports rsp doctor.",
      );
    }
    const result = await doctor(moduleDirectory);
    io.stdout(`${JSON.stringify(result)}\n`);
    return 0;
  } catch (error) {
    const failure =
      error instanceof RspCliFailure
        ? error
        : new RspCliFailure("appUnavailable", "App session is unavailable.");
    io.stderr(
      `${JSON.stringify({ code: failure.failure.code, message: failure.message })}\n`,
    );
    return failure.failure.exitCode;
  }
};

export const checksumRspClient = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

import { createHash, randomUUID } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { request } from "node:http";
import { dirname, join, relative, resolve, sep } from "node:path";

import { ProjectCreateInputSchema } from "../../src/contracts";
import {
  buildRspProjectCreateSchemaResponse,
  projectCreateFieldIssues,
  type RspFieldIssue,
} from "../contracts/project-create-surface";
import {
  buildRspAssetImportSchemaResponse,
  buildRspCommandCatalog,
} from "../contracts/command-surface";
import {
  DoctorResponseSchema,
  RSP_CLI_FAILURES,
  RSP_MAX_REQUEST_BYTES,
  RSP_PROTOCOL_VERSION,
  RspAssetImportInputSchema,
  RspCommandRequestSchema,
  RspCommandResponseSchema,
  SessionRecordSchema,
  type RspCommandRequest,
} from "../contracts/protocol";
import {
  ManagedFilesLedgerSchema,
  WorkspaceManifestSchema,
} from "../contracts/workspace";

const MAX_RESPONSE_BYTES = 1024 * 1024;

type CliFailureKey = keyof typeof RSP_CLI_FAILURES;

class RspCliFailure extends Error {
  readonly failure: (typeof RSP_CLI_FAILURES)[CliFailureKey];
  readonly issues: readonly RspFieldIssue[];

  constructor(
    key: CliFailureKey,
    message: string,
    issues: readonly RspFieldIssue[] = [],
  ) {
    super(message);
    this.failure = RSP_CLI_FAILURES[key];
    this.issues = issues;
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

const failureKeyForCode = (code: string): CliFailureKey => {
  switch (code) {
    case "rsp-protocol-incompatible":
      return "protocolIncompatible";
    case "rsp-workspace-invalid":
      return "workspaceInvalid";
    case "rsp-unauthorized":
      return "unauthorized";
    case "rsp-request-invalid":
      return "requestInvalid";
    case "rsp-command-failed":
      return "commandFailed";
    case "rsp-conflict":
      return "conflict";
    default:
      return "appUnavailable";
  }
};

const requestCommand = async ({
  socketPath,
  token,
  command,
}: {
  readonly socketPath: string;
  readonly token: string;
  readonly command: RspCommandRequest;
}) => {
  const body = Buffer.from(JSON.stringify(command));
  if (body.length > RSP_MAX_REQUEST_BYTES) {
    throw new RspCliFailure(
      "requestInvalid",
      "Request body exceeds the fixed size limit.",
    );
  }
  const rawResponse = await new Promise<{
    readonly statusCode: number;
    readonly body: unknown;
  }>((resolvePromise, reject) => {
    const outgoing = request(
      {
        socketPath,
        path: "/v2/command",
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-length": body.length,
          "content-type": "application/json",
          "x-rsp-protocol-version": RSP_PROTOCOL_VERSION,
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_RESPONSE_BYTES) {
            outgoing.destroy(new Error("rsp-response-too-large"));
            return;
          }
          chunks.push(Buffer.from(chunk));
        });
        response.on("end", () => {
          try {
            resolvePromise({
              statusCode: response.statusCode ?? 0,
              body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
            });
          } catch {
            reject(
              new RspCliFailure(
                "appUnavailable",
                "App returned an invalid response.",
              ),
            );
          }
        });
      },
    );
    outgoing.once("error", reject);
    outgoing.end(body);
  });
  const parsed = RspCommandResponseSchema.safeParse(rawResponse.body);
  if (!parsed.success) {
    if (rawResponse.statusCode === 401) {
      throw new RspCliFailure("unauthorized", "Session authorization failed.");
    }
    if (rawResponse.statusCode === 426) {
      throw new RspCliFailure(
        "protocolIncompatible",
        "App protocol is incompatible.",
      );
    }
    throw new RspCliFailure(
      "appUnavailable",
      "App returned an invalid response.",
    );
  }
  if (parsed.data.protocolVersion !== RSP_PROTOCOL_VERSION) {
    throw new RspCliFailure(
      "protocolIncompatible",
      "App protocol is incompatible.",
    );
  }
  if (!parsed.data.ok) {
    const key = failureKeyForCode(parsed.data.error.code);
    throw new RspCliFailure(
      key,
      parsed.data.error.message,
      parsed.data.error.issues ?? [],
    );
  }
  if (parsed.data.requestId !== command.requestId) {
    throw new RspCliFailure(
      "protocolIncompatible",
      "App response request identity is incompatible.",
    );
  }
  return parsed.data.result;
};

const loadActiveSession = async (moduleDirectory: string) => {
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
  return { manifest, session, token };
};

const parseOptions = (args: readonly string[], allowed: readonly string[]) => {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (
      flag === undefined ||
      value === undefined ||
      !allowed.includes(flag) ||
      values.has(flag) ||
      value.startsWith("--")
    ) {
      throw new RspCliFailure(
        "requestInvalid",
        "Command arguments are invalid.",
      );
    }
    values.set(flag, value);
  }
  return values;
};

const requiredOption = (options: Map<string, string>, flag: string) => {
  const value = options.get(flag);
  if (value === undefined) {
    throw new RspCliFailure(
      "requestInvalid",
      `Required option ${flag} is missing.`,
    );
  }
  return value;
};

const readStdinJson = async (io: RspCliIo) => {
  if (io.stdin === undefined) {
    throw new RspCliFailure(
      "requestInvalid",
      "This command requires one JSON value on stdin.",
    );
  }
  let input: string;
  try {
    input = await io.stdin();
  } catch {
    throw new RspCliFailure("requestInvalid", "stdin could not be read.");
  }
  if (Buffer.byteLength(input) > RSP_MAX_REQUEST_BYTES) {
    throw new RspCliFailure(
      "requestInvalid",
      "stdin exceeds the fixed size limit.",
    );
  }
  try {
    return JSON.parse(input) as unknown;
  } catch {
    throw new RspCliFailure("requestInvalid", "stdin must contain valid JSON.");
  }
};

const parseOptionalDeliveryPolicy = (options: Map<string, string>) => {
  const policy = options.get("--delivery-policy");
  if (policy === undefined) return undefined;
  if (policy !== "manual" && policy !== "automatic") {
    throw new RspCliFailure(
      "requestInvalid",
      "Delivery policy must be manual or automatic.",
    );
  }
  return policy;
};

const parseDeliveryPolicy = (options: Map<string, string>) =>
  parseOptionalDeliveryPolicy(options) ?? "manual";

const parseExecutionOverride = (options: Map<string, string>) => {
  const mode = options.get("--execution-mode");
  const rawMaxConcurrency = options.get("--max-concurrency");
  const rawRequireExact = options.get("--require-exact-concurrency");
  if (
    mode === undefined &&
    rawMaxConcurrency === undefined &&
    rawRequireExact === undefined
  ) {
    return undefined;
  }
  if (mode !== "inline" && mode !== "subagents") {
    throw new RspCliFailure(
      "requestInvalid",
      "Execution mode must be inline or subagents.",
    );
  }
  let maxConcurrency: number | undefined;
  if (rawMaxConcurrency !== undefined) {
    if (!/^[1-9][0-9]*$/u.test(rawMaxConcurrency)) {
      throw new RspCliFailure(
        "requestInvalid",
        "Execution concurrency must be a positive integer.",
      );
    }
    maxConcurrency = Number(rawMaxConcurrency);
  }
  let requireExactConcurrency: boolean | undefined;
  if (rawRequireExact !== undefined) {
    if (rawRequireExact !== "true" && rawRequireExact !== "false") {
      throw new RspCliFailure(
        "requestInvalid",
        "Exact concurrency must be true or false.",
      );
    }
    requireExactConcurrency = rawRequireExact === "true";
  }
  return mode === "inline"
    ? { mode }
    : {
        mode,
        ...(maxConcurrency === undefined ? {} : { maxConcurrency }),
        ...(requireExactConcurrency === undefined
          ? {}
          : { requireExactConcurrency }),
      };
};

const parseRuntimeMaxConcurrency = (options: Map<string, string>) => {
  const raw = options.get("--runtime-max-concurrency");
  if (raw === undefined) return undefined;
  if (!/^(?:0|[1-9][0-9]*)$/u.test(raw) || !Number.isSafeInteger(Number(raw))) {
    throw new RspCliFailure(
      "requestInvalid",
      "Runtime concurrency must be a non-negative safe integer.",
    );
  }
  return Number(raw);
};

export const buildRspCommand = async ({
  args,
  workspaceId,
  io,
}: {
  readonly args: readonly string[];
  readonly workspaceId: string;
  readonly io: RspCliIo;
}): Promise<RspCommandRequest> => {
  const [noun, verb, ...rest] = args;
  const base = {
    protocolVersion: RSP_PROTOCOL_VERSION,
    requestId: randomUUID(),
    workspaceId,
  } as const;
  let requestValue: unknown;
  if (noun === "doctor" && verb === undefined) {
    requestValue = { ...base, command: "doctor" };
  } else if (noun === "project" && verb === "create-context") {
    if (rest.length !== 0) {
      throw new RspCliFailure(
        "requestInvalid",
        "Command arguments are invalid.",
      );
    }
    requestValue = { ...base, command: "project-create-context" };
  } else if (noun === "project" && verb === "validate") {
    if (rest.length !== 0) {
      throw new RspCliFailure(
        "requestInvalid",
        "Command arguments are invalid.",
      );
    }
    requestValue = {
      ...base,
      command: "project-validate",
      input: await readStdinJson(io),
    };
  } else if (noun === "context") {
    const options = parseOptions(args.slice(1), [
      "--project",
      "--delivery-policy",
      "--execution-mode",
      "--max-concurrency",
      "--require-exact-concurrency",
      "--runtime-max-concurrency",
    ]);
    const deliveryPolicy = parseOptionalDeliveryPolicy(options);
    const execution = parseExecutionOverride(options);
    const runtimeMaxConcurrency = parseRuntimeMaxConcurrency(options);
    requestValue = {
      ...base,
      command: "context",
      storyId: requiredOption(options, "--project"),
      ...(deliveryPolicy === undefined ? {} : { deliveryPolicy }),
      ...(execution === undefined ? {} : { execution }),
      ...(runtimeMaxConcurrency === undefined
        ? {}
        : { runtimeMaxConcurrency }),
    };
  } else if (noun === "project" && verb === "create") {
    if (rest.length !== 0) {
      throw new RspCliFailure(
        "requestInvalid",
        "Command arguments are invalid.",
      );
    }
    const rawInput = await readStdinJson(io);
    const input = ProjectCreateInputSchema.safeParse(rawInput);
    if (!input.success) {
      throw new RspCliFailure(
        "requestInvalid",
        "Project create stdin does not match the strict raw ProjectCreateInput contract.",
        projectCreateFieldIssues({ error: input.error, raw: rawInput }),
      );
    }
    requestValue = {
      ...base,
      command: "project-create",
      input: input.data,
    };
  } else if (noun === "project" && verb === "list") {
    if (rest.length !== 0) {
      throw new RspCliFailure(
        "requestInvalid",
        "Command arguments are invalid.",
      );
    }
    requestValue = { ...base, command: "project-list" };
  } else if (noun === "project" && verb === "delete") {
    if (
      rest.length !== 3 ||
      rest[0] !== "--project" ||
      rest[1] === undefined ||
      rest[1].startsWith("--") ||
      rest[2] !== "--confirm-delete"
    ) {
      throw new RspCliFailure(
        "requestInvalid",
        "Project delete requires --project <storyId> --confirm-delete.",
      );
    }
    requestValue = {
      ...base,
      command: "project-delete",
      storyId: rest[1],
      confirmDelete: true,
    };
  } else if (noun === "asset" && verb === "import") {
    const options = parseOptions(rest, ["--project"]);
    const parsedInput = RspAssetImportInputSchema.safeParse(
      await readStdinJson(io),
    );
    if (!parsedInput.success)
      throw new RspCliFailure(
        "requestInvalid",
        "Asset import stdin does not match rsp-local-v2.",
      );
    requestValue = {
      ...base,
      command: "asset-import",
      storyId: requiredOption(options, "--project"),
      ...parsedInput.data,
    };
  } else if (noun === "inspect") {
    const options = parseOptions(args.slice(1), ["--project"]);
    requestValue = {
      ...base,
      command: "inspect",
      storyId: requiredOption(options, "--project"),
    };
  } else if (noun === "prepare") {
    const options = parseOptions(args.slice(1), [
      "--project",
      "--delivery-policy",
    ]);
    const deliveryPolicy = parseOptionalDeliveryPolicy(options);
    requestValue = {
      ...base,
      command: "prepare",
      storyId: requiredOption(options, "--project"),
      ...(deliveryPolicy === undefined ? {} : { deliveryPolicy }),
    };
  } else if (noun === "task" && verb === "check") {
    const options = parseOptions(rest, ["--task"]);
    requestValue = {
      ...base,
      command: "task-check",
      taskRevision: requiredOption(options, "--task"),
    };
  } else if (noun === "task" && verb === "describe") {
    const options = parseOptions(rest, ["--task"]);
    requestValue = {
      ...base,
      command: "task-describe",
      taskRevision: requiredOption(options, "--task"),
    };
  } else if (noun === "task" && verb === "finalize") {
    const options = parseOptions(rest, ["--task"]);
    requestValue = {
      ...base,
      command: "task-finalize",
      taskRevision: requiredOption(options, "--task"),
    };
  } else if (noun === "task" && verb === "commit") {
    const options = parseOptions(rest, ["--task", "--attempt"]);
    requestValue = {
      ...base,
      command: "task-commit",
      taskRevision: requiredOption(options, "--task"),
      attemptId: requiredOption(options, "--attempt"),
    };
  } else if (noun === "task" && verb === "fail") {
    const options = parseOptions(rest, ["--task", "--attempt", "--kind"]);
    requestValue = {
      ...base,
      command: "task-fail",
      taskRevision: requiredOption(options, "--task"),
      attemptId: requiredOption(options, "--attempt"),
      kind: requiredOption(options, "--kind"),
    };
  } else if (noun === "continue") {
    const options = parseOptions(args.slice(1), [
      "--project",
      "--revision",
      "--attempt",
      "--delivery-policy",
    ]);
    requestValue = {
      ...base,
      command: "continue",
      storyId: requiredOption(options, "--project"),
      revisionId: requiredOption(options, "--revision"),
      attemptId: requiredOption(options, "--attempt"),
      deliveryPolicy: parseDeliveryPolicy(options),
    };
  } else if (noun === "attempt" && verb === "status") {
    const options = parseOptions(rest, ["--project", "--attempt"]);
    requestValue = {
      ...base,
      command: "attempt-status",
      storyId: requiredOption(options, "--project"),
      attemptId: requiredOption(options, "--attempt"),
    };
  } else if (noun === "delivery" && verb === "build") {
    const options = parseOptions(rest, ["--project"]);
    requestValue = {
      ...base,
      command: "delivery-build",
      storyId: requiredOption(options, "--project"),
    };
  } else {
    throw new RspCliFailure("requestInvalid", "Unknown rsp command.");
  }
  const parsed = RspCommandRequestSchema.safeParse(requestValue);
  if (!parsed.success) {
    throw new RspCliFailure(
      "requestInvalid",
      "Command request does not match rsp-local-v2.",
    );
  }
  return parsed.data;
};

export type RspCliIo = Readonly<{
  stdin?: () => Promise<string>;
  stdout: (value: string) => void;
  stderr: (value: string) => void;
}>;

export const executeRspCli = async (
  args: readonly string[],
  moduleDirectory: string,
  io: RspCliIo,
) => {
  try {
    if (args.length === 2 && args[0] === "help" && args[1] === "--json") {
      io.stdout(`${JSON.stringify(buildRspCommandCatalog())}\n`);
      return 0;
    }
    if (
      args.length === 2 &&
      args[0] === "schema" &&
      args[1] === "project-create"
    ) {
      io.stdout(`${JSON.stringify(buildRspProjectCreateSchemaResponse())}\n`);
      return 0;
    }
    if (
      args.length === 2 &&
      args[0] === "schema" &&
      args[1] === "asset-import"
    ) {
      io.stdout(`${JSON.stringify(buildRspAssetImportSchemaResponse())}\n`);
      return 0;
    }
    const commandTemplate = await buildRspCommand({
      args,
      workspaceId: "00000000-0000-4000-8000-000000000000",
      io,
    });
    const { manifest, session, token } =
      await loadActiveSession(moduleDirectory);
    const command = RspCommandRequestSchema.parse({
      ...commandTemplate,
      workspaceId: manifest.workspaceId,
    });
    const rawResult = await requestCommand({
      socketPath: session.socketPath,
      token,
      command,
    });
    const result =
      command.command === "doctor"
        ? DoctorResponseSchema.parse(rawResult)
        : rawResult;
    io.stdout(`${JSON.stringify(result)}\n`);
    return 0;
  } catch (error) {
    const failure =
      error instanceof RspCliFailure
        ? error
        : new RspCliFailure("appUnavailable", "App session is unavailable.");
    io.stderr(
      `${JSON.stringify({
        code: failure.failure.code,
        message: failure.message,
        ...(failure.issues.length === 0 ? {} : { issues: failure.issues }),
      })}\n`,
    );
    return failure.failure.exitCode;
  }
};

export const checksumRspClient = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

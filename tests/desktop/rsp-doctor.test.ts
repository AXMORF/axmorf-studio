import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";

import {
  RspCommandFailure,
  startRspDoctorServer,
} from "../../desktop/adapters/rsp-socket";
import {
  RspAssetImportSchemaResponseSchema,
  RspCommandCatalogSchema,
} from "../../desktop/contracts/command-surface";
import {
  DESKTOP_NETWORK_POLICY,
  RSP_CLI_FAILURES,
  RSP_MAX_REQUEST_BYTES,
  RSP_PROTOCOL_VERSION,
  type DoctorResponse,
  type RspCommandRequest,
} from "../../desktop/contracts/protocol";
import {
  RspProjectCreateSchemaResponseSchema,
} from "../../desktop/contracts/project-create-surface";
import {
  DESKTOP_MANAGED_FILE_PATHS,
  createWorkspaceManifest,
} from "../../desktop/contracts/workspace";
import { executeRspCli } from "../../desktop/rsp/client";
import { validProjectCreateInput } from "../fixtures/project-create";

const runtimePackId = `runtime-pack-${"a".repeat(64)}`;
const revisionId = `revision-${"b".repeat(64)}`;
const taskRevision = `task-${"c".repeat(64)}`;

const createWorkspace = async (context: TestContext) => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "axmorf-rsp-"));
  context.after(() => rm(workspaceRoot, { recursive: true, force: true }));
  await mkdir(join(workspaceRoot, ".rsp/session"), { recursive: true });
  await mkdir(join(workspaceRoot, ".rsp/bin"), { recursive: true });
  await chmod(join(workspaceRoot, ".rsp"), 0o700);
  await chmod(join(workspaceRoot, ".rsp/session"), 0o700);
  const workspaceId = randomUUID();
  await writeFile(
    join(workspaceRoot, ".rsp/workspace.json"),
    `${JSON.stringify(createWorkspaceManifest(workspaceId))}\n`,
    { mode: 0o600 },
  );
  await chmod(join(workspaceRoot, ".rsp/workspace.json"), 0o600);
  await writeFile(
    join(workspaceRoot, ".rsp/managed-files.json"),
    `${JSON.stringify({
      schemaVersion: 2,
      contractVersion: "desktop-managed-files-v2",
      integrationVersion: 2,
      workspaceId,
      state: "ready",
      files: DESKTOP_MANAGED_FILE_PATHS.map((path) => ({
        path,
        mode: path === ".rsp/bin/rsp" ? 0o755 : 0o644,
        sha256: "0".repeat(64),
      })),
    })}\n`,
    { mode: 0o600 },
  );
  await chmod(join(workspaceRoot, ".rsp/managed-files.json"), 0o600);
  return {
    workspaceRoot,
    workspaceId,
    moduleDirectory: join(workspaceRoot, ".rsp/bin"),
  };
};

const doctorState = ({
  workspaceId,
  expiresAt,
}: {
  readonly workspaceId: string;
  readonly expiresAt: string;
}): DoctorResponse => ({
  schemaVersion: 2,
  protocolVersion: RSP_PROTOCOL_VERSION,
  workspaceId,
  adapterMode: "workspace",
  runtimePackMode: "embedded",
  previewCatalog: {
    state: "ready",
    entryCount: 2,
    unavailableCount: 1,
    failureCode: null,
  },
  network: DESKTOP_NETWORK_POLICY,
  productionAvailable: true,
  deliveryAvailable: true,
  deliveryBlocker: null,
  distributionReady: false,
  runtimePackAvailable: true,
  runtimePack: { runtimePackId, architecture: "arm64" },
  provider: "ready",
  activeWork: null,
  process: { appPid: process.pid, enginePid: process.pid },
  session: { active: true, expiresAt },
});

const runCli = async (
  args: readonly string[],
  moduleDirectory: string,
  stdin?: unknown,
) => {
  let stdout = "";
  let stderr = "";
  const exitCode = await executeRspCli(args, moduleDirectory, {
    ...(stdin === undefined
      ? {}
      : { stdin: async () => JSON.stringify(stdin) }),
    stdout: (value) => {
      stdout += value;
    },
    stderr: (value) => {
      stderr += value;
    },
  });
  return { exitCode, stdout, stderr };
};

const acquiredImage = () =>
  ({
    schemaVersion: 1,
    provider: "pexels",
    acquisitionId: "pexels:1",
    providerAssetId: "1",
    sourcePageUrl: "https://www.pexels.com/photo/fixture-1/",
    creator: {
      name: "Creator",
      profileUrl: "https://www.pexels.com/@creator",
    },
    license: {
      name: "Pexels License",
      url: "https://www.pexels.com/license/",
    },
    providerPolicy: {
      attributionRequired: true,
      attributionText: "Photo by Creator on Pexels",
    },
    acquiredAt: "2026-08-23T00:00:00.000Z",
    file: {
      relativePath: "original.png",
      mimeType: "image/png",
      width: 1,
      height: 1,
      sizeInBytes: 68,
      sha256: "d".repeat(64),
    },
  });

const rawCommand = ({
  socketPath,
  token,
  body,
  protocolVersion = RSP_PROTOCOL_VERSION,
}: {
  readonly socketPath: string;
  readonly token: string;
  readonly body: Buffer;
  readonly protocolVersion?: string;
}) =>
  new Promise<{ readonly statusCode: number; readonly body: unknown }>(
    (resolvePromise, reject) => {
      const outgoing = request(
        {
          socketPath,
          path: "/v2/command",
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-length": body.length,
            "content-type": "application/json",
            "x-rsp-protocol-version": protocolVersion,
          },
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk: Buffer) =>
            chunks.push(Buffer.from(chunk)),
          );
          response.on("end", () => {
            resolvePromise({
              statusCode: response.statusCode ?? 0,
              body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
            });
          });
        },
      );
      outgoing.once("error", reject);
      outgoing.end(body);
    },
  );

test("rsp local discovery exposes structural schemas and the complete command catalog", async () => {
  const result = await runCli(
    ["schema", "project-create"],
    "/workspace-does-not-need-an-active-app/.rsp/bin",
  );
  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  const schema = RspProjectCreateSchemaResponseSchema.parse(
    JSON.parse(result.stdout),
  );
  assert.equal(schema.stdin, "raw-project-create-input");
  assert.equal(schema.schemaScope, "structural-and-cross-field-static");
  assert.equal(
    schema.operationalValidation.contextCommand,
    "./.rsp/bin/rsp project create-context",
  );
  assert.equal(
    schema.operationalValidation.validateCommand,
    "./.rsp/bin/rsp project validate",
  );
  assert.equal(schema.sceneTemplatesOmission, "inherit-producer-config-defaults");
  assert.deepEqual(schema.forbiddenWrapperFields, [
    "command",
    "input",
    "protocolVersion",
    "requestId",
    "workspaceId",
  ]);
  assert.equal("sceneTemplates" in schema.example, false);
  assert.equal(schema.example.storyId, "story-example");
  assert.equal(schema.jsonSchema.additionalProperties, false);
  assert.ok(
    typeof schema.jsonSchema.properties === "object" &&
      schema.jsonSchema.properties !== null,
  );
  const help = await runCli(
    ["help", "--json"],
    "/workspace-does-not-need-an-active-app/.rsp/bin",
  );
  const asset = await runCli(
    ["schema", "asset-import"],
    "/workspace-does-not-need-an-active-app/.rsp/bin",
  );
  assert.equal(help.exitCode, 0);
  assert.equal(asset.exitCode, 0);
  const catalog = RspCommandCatalogSchema.parse(JSON.parse(help.stdout));
  const commands = catalog.commands.map(({ command }) => command);
  assert.ok(commands.includes("help --json"));
  assert.ok(commands.includes("project create-context"));
  assert.ok(commands.includes("project validate"));
  assert.ok(commands.includes("task describe"));
  assert.ok(commands.includes("task finalize"));
  assert.ok(commands.includes("attempt status"));
  const assetSchema = RspAssetImportSchemaResponseSchema.parse(
    JSON.parse(asset.stdout),
  );
  assert.equal(assetSchema.stdin, "raw-asset-import-input");
  const create = catalog.commands.find(
    ({ command }) => command === "project create",
  );
  assert.equal(create?.stdin, "raw-project-create-input");
  assert.equal(create?.usage, "./.rsp/bin/rsp project create");
  assert.match(
    catalog.commands.find(({ command }) => command === "context")?.usage ?? "",
    /--runtime-max-concurrency/u,
  );
});

test("rsp project create rejects wrappers and reports redacted field paths", async () => {
  const moduleDirectory = "/workspace-does-not-need-an-active-app/.rsp/bin";
  const wrapped = await runCli(["project", "create"], moduleDirectory, {
    command: "project-create",
    protocolVersion: RSP_PROTOCOL_VERSION,
    input: validProjectCreateInput,
  });
  assert.equal(wrapped.exitCode, RSP_CLI_FAILURES.requestInvalid.exitCode);
  const wrapperFailure = JSON.parse(wrapped.stderr) as {
    readonly code: string;
    readonly issues: readonly Readonly<{
      path: string;
      code: string;
      message: string;
    }>[];
  };
  assert.equal(wrapperFailure.code, "rsp-request-invalid");
  assert.equal(wrapperFailure.issues[0]?.path, "$");
  assert.equal(
    wrapperFailure.issues[0]?.code,
    "rsp-project-create-wrapper-forbidden",
  );
  assert.doesNotMatch(wrapped.stderr, /must-not-leak/u);

  const invalid = await runCli(["project", "create"], moduleDirectory, {
    ...validProjectCreateInput,
    storyId: "INVALID STORY",
    render: {
      ...validProjectCreateInput.render,
      leadInFrames: "must-not-leak",
    },
  });
  assert.equal(invalid.exitCode, RSP_CLI_FAILURES.requestInvalid.exitCode);
  const fieldFailure = JSON.parse(invalid.stderr) as {
    readonly issues: readonly Readonly<{ path: string; code: string }>[];
  };
  assert.ok(fieldFailure.issues.some(({ path }) => path === "$.storyId"));
  assert.ok(
    fieldFailure.issues.some(({ path }) => path === "$.render.leadInFrames"),
  );
  assert.doesNotMatch(invalid.stderr, /must-not-leak/u);
});

test("authenticated rsp doctor serves concurrent v2 calls and cleans up", async (context) => {
  const workspace = await createWorkspace(context);
  const token = randomBytes(32);
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  const server = await startRspDoctorServer({
    ...workspace,
    appPid: process.pid,
    enginePid: process.pid,
    expiresAt,
    token,
    getDoctorState: () =>
      doctorState({ workspaceId: workspace.workspaceId, expiresAt }),
  });
  context.after(() => server.close().catch(() => undefined));
  const results = await Promise.all(
    Array.from({ length: 8 }, () =>
      runCli(["doctor"], workspace.moduleDirectory),
    ),
  );
  for (const result of results) {
    assert.equal(result.exitCode, 0);
    assert.equal(result.stderr, "");
    const parsed = JSON.parse(result.stdout) as DoctorResponse;
    assert.equal(parsed.adapterMode, "workspace");
    assert.equal(parsed.runtimePackMode, "embedded");
    assert.equal(parsed.productionAvailable, true);
    assert.equal(parsed.deliveryAvailable, true);
    assert.equal("repositoryMode" in parsed, false);
  }
  const sessionText = await readFile(
    join(workspace.workspaceRoot, ".rsp/session/session.json"),
    "utf8",
  );
  assert.doesNotMatch(sessionText, /token|secret/iu);
  assert.equal(
    results[0]?.stdout.includes(Buffer.from(token).toString("hex")),
    false,
  );
  await server.close();
  await assert.rejects(
    readFile(join(workspace.workspaceRoot, ".rsp/session/session.json")),
    { code: "ENOENT" },
  );
});

test("rsp CLI exposes every public command and reads create/import only from stdin", async (context) => {
  const workspace = await createWorkspace(context);
  const token = randomBytes(32);
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  const received: RspCommandRequest[] = [];
  const server = await startRspDoctorServer({
    ...workspace,
    appPid: process.pid,
    enginePid: process.pid,
    expiresAt,
    token,
    getDoctorState: () =>
      doctorState({ workspaceId: workspace.workspaceId, expiresAt }),
    executeCommand: async (command) => {
      received.push(command);
      return { command: command.command };
    },
  });
  context.after(() => server.close().catch(() => undefined));
  const attemptId = randomUUID();
  const calls = [
    runCli(
      [
        "context",
        "--project",
        "story-example",
        "--delivery-policy",
        "automatic",
        "--execution-mode",
        "subagents",
        "--max-concurrency",
        "3",
        "--require-exact-concurrency",
        "true",
        "--runtime-max-concurrency",
        "4",
      ],
      workspace.moduleDirectory,
    ),
    runCli(["project", "create-context"], workspace.moduleDirectory),
    runCli(
      ["project", "validate"],
      workspace.moduleDirectory,
      validProjectCreateInput,
    ),
    runCli(
      ["project", "create"],
      workspace.moduleDirectory,
      validProjectCreateInput,
    ),
    runCli(["project", "list"], workspace.moduleDirectory),
    runCli(
      ["project", "delete", "--project", "story-example", "--confirm-delete"],
      workspace.moduleDirectory,
    ),
    runCli(
      ["asset", "import", "--project", "story-example"],
      workspace.moduleDirectory,
      {
        role: "scene-visual",
        receipt: acquiredImage(),
        candidateBase64: Buffer.alloc(68).toString("base64"),
      },
    ),
    runCli(
      ["inspect", "--project", "story-example"],
      workspace.moduleDirectory,
    ),
    runCli(
      [
        "prepare",
        "--project",
        "story-example",
        "--delivery-policy",
        "automatic",
      ],
      workspace.moduleDirectory,
    ),
    runCli(
      ["task", "describe", "--task", taskRevision],
      workspace.moduleDirectory,
    ),
    runCli(
      ["task", "finalize", "--task", taskRevision],
      workspace.moduleDirectory,
    ),
    runCli(
      ["task", "check", "--task", taskRevision],
      workspace.moduleDirectory,
    ),
    runCli(
      ["task", "commit", "--task", taskRevision, "--attempt", attemptId],
      workspace.moduleDirectory,
    ),
    runCli(
      [
        "task",
        "fail",
        "--task",
        taskRevision,
        "--attempt",
        attemptId,
        "--kind",
        "host",
      ],
      workspace.moduleDirectory,
    ),
    runCli(
      [
        "continue",
        "--project",
        "story-example",
        "--revision",
        revisionId,
        "--attempt",
        attemptId,
      ],
      workspace.moduleDirectory,
    ),
    runCli(
      ["attempt", "status", "--project", "story-example", "--attempt", attemptId],
      workspace.moduleDirectory,
    ),
    runCli(
      ["delivery", "build", "--project", "story-example"],
      workspace.moduleDirectory,
    ),
  ];
  const results = await Promise.all(calls);
  assert.ok(
    results.every(({ exitCode, stderr }) => exitCode === 0 && stderr === ""),
  );
  assert.deepEqual(
    received.map(({ command }) => command).sort(),
    [
      "asset-import",
      "context",
      "continue",
      "delivery-build",
      "inspect",
      "prepare",
      "project-create",
      "project-create-context",
      "project-delete",
      "project-list",
      "project-validate",
      "attempt-status",
      "task-check",
      "task-commit",
      "task-describe",
      "task-fail",
      "task-finalize",
    ].sort(),
  );
  const create = received.find(({ command }) => command === "project-create");
  const projectedContext = received.find(
    ({ command }) => command === "context",
  );
  const acquisition = received.find(
    ({ command }) => command === "asset-import",
  );
  assert.equal(
    create?.command === "project-create" && create.input.storyId,
    "story-example",
  );
  assert.deepEqual(
    projectedContext?.command === "context"
      ? {
          deliveryPolicy: projectedContext.deliveryPolicy,
          execution: projectedContext.execution,
          runtimeMaxConcurrency: projectedContext.runtimeMaxConcurrency,
        }
      : null,
    {
      deliveryPolicy: "automatic",
      execution: {
        mode: "subagents",
        maxConcurrency: 3,
        requireExactConcurrency: true,
      },
      runtimeMaxConcurrency: 4,
    },
  );
  assert.equal(
    acquisition?.command === "asset-import" && acquisition.receipt.provider,
    "pexels",
  );
  assert.equal(
    acquisition?.command === "asset-import" && acquisition.storyId,
    "story-example",
  );
  assert.equal(
    acquisition?.command === "asset-import" && acquisition.role,
    "scene-visual",
  );
  assert.equal(
    acquisition?.command === "asset-import" &&
      Buffer.from(acquisition.candidateBase64, "base64").byteLength,
    68,
  );
});

test("rsp asset import binds Project scope only from --project", async (context) => {
  const workspace = await createWorkspace(context);
  const token = randomBytes(32);
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  let routed = 0;
  const server = await startRspDoctorServer({
    ...workspace,
    appPid: process.pid,
    enginePid: process.pid,
    expiresAt,
    token,
    getDoctorState: () =>
      doctorState({ workspaceId: workspace.workspaceId, expiresAt }),
    executeCommand: async () => {
      routed += 1;
      return {};
    },
  });
  context.after(() => server.close().catch(() => undefined));
  const stdin = {
    role: "scene-visual",
    receipt: acquiredImage(),
    candidateBase64: Buffer.alloc(68).toString("base64"),
  } as const;

  const missingScope = await runCli(
    ["asset", "import"],
    workspace.moduleDirectory,
    stdin,
  );
  assert.equal(missingScope.exitCode, RSP_CLI_FAILURES.requestInvalid.exitCode);

  for (const scopedStdin of [
    { ...stdin, storyId: "story-example" },
    { ...stdin, storyId: "another-story" },
    { ...stdin, candidatePath: "/tmp/candidate.png" },
  ]) {
    const result = await runCli(
      ["asset", "import", "--project", "story-example"],
      workspace.moduleDirectory,
      scopedStdin,
    );
    assert.equal(result.exitCode, RSP_CLI_FAILURES.requestInvalid.exitCode);
  }
  assert.equal(routed, 0);
});

test("rsp runs reads concurrently and serializes mutating commands", async (context) => {
  const workspace = await createWorkspace(context);
  const token = randomBytes(32);
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  let activeReads = 0;
  let maxReads = 0;
  let activeMutations = 0;
  let maxMutations = 0;
  const delay = () =>
    new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
  const server = await startRspDoctorServer({
    ...workspace,
    appPid: process.pid,
    enginePid: process.pid,
    expiresAt,
    token,
    getDoctorState: () =>
      doctorState({ workspaceId: workspace.workspaceId, expiresAt }),
    executeCommand: async (command) => {
      if (command.command === "context") {
        activeReads += 1;
        maxReads = Math.max(maxReads, activeReads);
        await delay();
        activeReads -= 1;
      } else {
        activeMutations += 1;
        maxMutations = Math.max(maxMutations, activeMutations);
        await delay();
        activeMutations -= 1;
      }
      return { command: command.command };
    },
  });
  context.after(() => server.close().catch(() => undefined));
  await Promise.all([
    runCli(
      ["context", "--project", "story-example"],
      workspace.moduleDirectory,
    ),
    runCli(
      ["context", "--project", "story-example"],
      workspace.moduleDirectory,
    ),
  ]);
  await Promise.all([
    runCli(
      ["delivery", "build", "--project", "story-example"],
      workspace.moduleDirectory,
    ),
    runCli(
      ["delivery", "build", "--project", "story-example"],
      workspace.moduleDirectory,
    ),
  ]);
  assert.equal(maxReads, 2);
  assert.equal(maxMutations, 1);
});

test("rsp authorizes a mutation before it waits behind the mutation queue", async (context) => {
  const workspace = await createWorkspace(context);
  const token = randomBytes(32);
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  let reserved = false;
  let markStarted!: () => void;
  let release!: () => void;
  const started = new Promise<void>((resolvePromise) => {
    markStarted = resolvePromise;
  });
  const released = new Promise<void>((resolvePromise) => {
    release = resolvePromise;
  });
  const server = await startRspDoctorServer({
    ...workspace,
    appPid: process.pid,
    enginePid: process.pid,
    expiresAt,
    token,
    getDoctorState: () =>
      doctorState({ workspaceId: workspace.workspaceId, expiresAt }),
    authorizeCommand: (command) => {
      if (command.command !== "delivery-build") return;
      if (reserved) {
        throw new RspCommandFailure("rsp-conflict", "Delivery is active.");
      }
      reserved = true;
    },
    executeCommand: async () => {
      markStarted();
      await released;
      reserved = false;
      return { status: "complete" };
    },
  });
  context.after(() => server.close().catch(() => undefined));

  const first = runCli(
    ["delivery", "build", "--project", "story-example"],
    workspace.moduleDirectory,
  );
  await started;
  let second: Awaited<ReturnType<typeof runCli>>;
  try {
    second = await runCli(
      ["delivery", "build", "--project", "story-example"],
      workspace.moduleDirectory,
    );
  } finally {
    release();
  }
  assert.equal(second.exitCode, RSP_CLI_FAILURES.conflict.exitCode);
  assert.equal((await first).exitCode, 0);
});

test("rsp keeps accepted continuation alive after client disconnect", async (context) => {
  const workspace = await createWorkspace(context);
  const token = randomBytes(32);
  const tokenText = token.toString("hex");
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  let started!: () => void;
  let finish!: () => void;
  let completed = false;
  const startedPromise = new Promise<void>((resolvePromise) => {
    started = resolvePromise;
  });
  const finishPromise = new Promise<void>((resolvePromise) => {
    finish = resolvePromise;
  });
  const server = await startRspDoctorServer({
    ...workspace,
    appPid: process.pid,
    enginePid: process.pid,
    expiresAt,
    token,
    getDoctorState: () =>
      doctorState({ workspaceId: workspace.workspaceId, expiresAt }),
    executeCommand: async (command) => {
      assert.equal(command.command, "continue");
      started();
      await finishPromise;
      completed = true;
      return { status: "source-current" };
    },
  });
  context.after(() => server.close().catch(() => undefined));
  const body = Buffer.from(
    JSON.stringify({
      protocolVersion: RSP_PROTOCOL_VERSION,
      requestId: randomUUID(),
      workspaceId: workspace.workspaceId,
      command: "continue",
      storyId: "story-example",
      revisionId,
      attemptId: randomUUID(),
      deliveryPolicy: "manual",
    }),
  );
  const outgoing = request({
    socketPath: server.record.socketPath,
    path: "/v2/command",
    method: "POST",
    headers: {
      authorization: `Bearer ${tokenText}`,
      "content-length": body.length,
      "content-type": "application/json",
      "x-rsp-protocol-version": RSP_PROTOCOL_VERSION,
    },
  });
  outgoing.on("error", () => undefined);
  outgoing.end(body);
  await startedPromise;
  outgoing.destroy();
  finish();
  await new Promise((resolvePromise) => setImmediate(resolvePromise));
  assert.equal(completed, true);
});

test("rsp maps protocol, auth, request, command, and conflict failures to fixed exits", async (context) => {
  const workspace = await createWorkspace(context);
  const unknownOffline = await runCli(["unknown"], workspace.moduleDirectory);
  assert.equal(unknownOffline.exitCode, 5);
  const offline = await runCli(["doctor"], workspace.moduleDirectory);
  assert.equal(offline.exitCode, 1);

  const token = randomBytes(32);
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  const server = await startRspDoctorServer({
    ...workspace,
    appPid: process.pid,
    enginePid: process.pid,
    expiresAt,
    token,
    getDoctorState: () =>
      doctorState({ workspaceId: workspace.workspaceId, expiresAt }),
    executeCommand: async (command) => {
      if (command.command === "delivery-build") {
        throw new RspCommandFailure("rsp-conflict", "Delivery is active.");
      }
      if (command.command === "context") {
        throw new RspCommandFailure(
          "rsp-command-failed",
          "Context is not ready.",
          [
            {
              path: "$.visualStyle.styleProfileId",
              code: "rsp-project-style-profile-unavailable",
              message: "The requested style profile is not available.",
              ownerAction: "Choose a styleProfileId returned by project create-context.",
            },
          ],
        );
      }
      throw new Error("private /absolute/path must not escape");
    },
  });
  context.after(() => server.close().catch(() => undefined));
  const invalid = await runCli(["unknown"], workspace.moduleDirectory);
  assert.equal(invalid.exitCode, 5);
  const commandFailed = await runCli(
    ["context", "--project", "story-example"],
    workspace.moduleDirectory,
  );
  assert.equal(commandFailed.exitCode, 6);
  const structured = JSON.parse(commandFailed.stderr) as {
    issues: readonly { path: string; code: string; ownerAction?: string }[];
  };
  assert.equal(structured.issues[0]?.path, "$.visualStyle.styleProfileId");
  assert.equal(
    structured.issues[0]?.code,
    "rsp-project-style-profile-unavailable",
  );
  assert.match(structured.issues[0]?.ownerAction ?? "", /create-context/u);
  const privateFailure = await runCli(
    ["prepare", "--project", "story-example"],
    workspace.moduleDirectory,
  );
  assert.equal(privateFailure.exitCode, 6);
  assert.doesNotMatch(privateFailure.stderr, /absolute|private/iu);
  const conflict = await runCli(
    ["delivery", "build", "--project", "story-example"],
    workspace.moduleDirectory,
  );
  assert.equal(conflict.exitCode, 7);

  const tokenPath = join(workspace.workspaceRoot, ".rsp/session/token");
  await writeFile(tokenPath, `${randomBytes(32).toString("hex")}\n`);
  await chmod(tokenPath, 0o600);
  const unauthorized = await runCli(["doctor"], workspace.moduleDirectory);
  assert.equal(unauthorized.exitCode, 4);
  assert.doesNotMatch(unauthorized.stderr, /[a-f0-9]{64}/u);

  const sessionPath = join(
    workspace.workspaceRoot,
    ".rsp/session/session.json",
  );
  const session = JSON.parse(await readFile(sessionPath, "utf8")) as Record<
    string,
    unknown
  >;
  await writeFile(
    sessionPath,
    `${JSON.stringify({ ...session, protocolVersion: "rsp-local-v3" })}\n`,
  );
  await chmod(sessionPath, 0o600);
  const incompatible = await runCli(["doctor"], workspace.moduleDirectory);
  assert.equal(incompatible.exitCode, 2);

  await writeFile(
    sessionPath,
    `${JSON.stringify({
      ...session,
      expiresAt: "2026-01-01T00:00:00.000Z",
    })}\n`,
  );
  await chmod(sessionPath, 0o600);
  const stale = await runCli(["doctor"], workspace.moduleDirectory);
  assert.equal(stale.exitCode, 1);
});

test("rsp rejects oversized, wrong-version, and cross-Workspace requests before routing", async (context) => {
  const workspace = await createWorkspace(context);
  const token = randomBytes(32);
  const tokenText = token.toString("hex");
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  let routed = 0;
  const server = await startRspDoctorServer({
    ...workspace,
    appPid: process.pid,
    enginePid: process.pid,
    expiresAt,
    token,
    getDoctorState: () =>
      doctorState({ workspaceId: workspace.workspaceId, expiresAt }),
    executeCommand: async () => {
      routed += 1;
      return {};
    },
  });
  context.after(() => server.close().catch(() => undefined));
  const oversized = await rawCommand({
    socketPath: server.record.socketPath,
    token: tokenText,
    body: Buffer.alloc(RSP_MAX_REQUEST_BYTES + 1, "x"),
  });
  assert.equal(oversized.statusCode, 413);
  const wrongVersion = await rawCommand({
    socketPath: server.record.socketPath,
    token: tokenText,
    protocolVersion: "rsp-local-v3",
    body: Buffer.from("{}"),
  });
  assert.equal(wrongVersion.statusCode, 426);
  const crossWorkspace = await rawCommand({
    socketPath: server.record.socketPath,
    token: tokenText,
    body: Buffer.from(
      JSON.stringify({
        protocolVersion: RSP_PROTOCOL_VERSION,
        requestId: randomUUID(),
        workspaceId: randomUUID(),
        command: "context",
        storyId: "story-example",
      }),
    ),
  });
  assert.equal(crossWorkspace.statusCode, 403);
  assert.equal(routed, 0);
});

test("rsp rejects symlinked session control paths", async (context) => {
  const workspace = await createWorkspace(context);
  const realSession = join(workspace.workspaceRoot, ".rsp/real-session");
  const sessionDirectory = join(workspace.workspaceRoot, ".rsp/session");
  await rm(sessionDirectory, { recursive: true });
  await mkdir(realSession, { mode: 0o700 });
  await symlink(realSession, sessionDirectory);
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  await assert.rejects(
    startRspDoctorServer({
      ...workspace,
      appPid: process.pid,
      enginePid: process.pid,
      expiresAt,
      token: randomBytes(32),
      getDoctorState: () =>
        doctorState({ workspaceId: workspace.workspaceId, expiresAt }),
    }),
    /rsp-session-path-untrusted/u,
  );
});

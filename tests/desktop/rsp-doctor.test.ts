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
import { tmpdir } from "node:os";
import { createServer as createNetServer } from "node:net";
import { join } from "node:path";
import test, { type TestContext } from "node:test";

import { startRspDoctorServer } from "../../desktop/adapters/rsp-socket";
import {
  RSP_PROTOCOL_VERSION,
  type DoctorResponse,
} from "../../desktop/contracts/protocol";
import {
  DESKTOP_MANAGED_FILE_PATHS,
  createWorkspaceManifest,
} from "../../desktop/contracts/workspace";
import { executeRspCli } from "../../desktop/rsp/client";

const createWorkspace = async (context: TestContext) => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "axmorf-rsp-"));
  context.after(() => rm(workspaceRoot, { recursive: true, force: true }));
  await mkdir(join(workspaceRoot, ".rsp/session"), { recursive: true });
  await mkdir(join(workspaceRoot, ".rsp/lib"), { recursive: true });
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
      schemaVersion: 1,
      contractVersion: "desktop-managed-files-v1",
      integrationVersion: 1,
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
    moduleDirectory: join(workspaceRoot, ".rsp/lib"),
  };
};

const doctorState = ({
  workspaceId,
  expiresAt,
}: {
  readonly workspaceId: string;
  readonly expiresAt: string;
}): DoctorResponse => ({
  schemaVersion: 1,
  protocolVersion: RSP_PROTOCOL_VERSION,
  workspaceId,
  adapterMode: "repository",
  repositoryMode: "build-time-checkout",
  runtimePackMode: "host-node-prototype",
  previewCatalog: {
    state: "ready",
    entryCount: 2,
    unavailableCount: 1,
    failureCode: null,
  },
  desktopTcpListeners: false,
  productionAvailable: false,
  deliveryAvailable: false,
  distributionReady: false,
  runtimePackAvailable: false,
  activeWork: false,
  process: { appPid: process.pid, enginePid: process.pid },
  session: { active: true, expiresAt },
});

const runCli = async (args: readonly string[], moduleDirectory: string) => {
  let stdout = "";
  let stderr = "";
  const exitCode = await executeRspCli(args, moduleDirectory, {
    stdout: (value) => {
      stdout += value;
    },
    stderr: (value) => {
      stderr += value;
    },
  });
  return { exitCode, stdout, stderr };
};

const createStaleSocket = async (socketPath: string) => {
  const server = createNetServer();
  await new Promise<void>((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(socketPath, resolvePromise);
  });
  await new Promise<void>((resolvePromise, reject) => {
    server.close((error) =>
      error === undefined ? resolvePromise() : reject(error),
    );
  });
};

test("authenticated rsp doctor serves concurrent read-only calls and cleans up", async (context) => {
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
    assert.equal(parsed.adapterMode, "repository");
    assert.equal(parsed.repositoryMode, "build-time-checkout");
    assert.equal(parsed.runtimePackMode, "host-node-prototype");
    assert.deepEqual(parsed.previewCatalog, {
      state: "ready",
      entryCount: 2,
      unavailableCount: 1,
      failureCode: null,
    });
    assert.equal(parsed.desktopTcpListeners, false);
    assert.equal(parsed.productionAvailable, false);
    assert.equal("settings" in parsed, false);
    assert.equal("studio" in parsed, false);
  }
  const sessionText = await readFile(
    join(workspace.workspaceRoot, ".rsp/session/session.json"),
    "utf8",
  );
  assert.doesNotMatch(sessionText, /token|secret/iu);
  assert.equal(
    results[0].stdout.includes(Buffer.from(token).toString("hex")),
    false,
  );
  await server.close();
  await assert.rejects(
    readFile(join(workspace.workspaceRoot, ".rsp/session/session.json")),
    { code: "ENOENT" },
  );
});

test("rsp doctor uses fixed offline, protocol, Workspace, and authorization failures", async (context) => {
  const workspace = await createWorkspace(context);
  const offline = await runCli(["doctor"], workspace.moduleDirectory);
  assert.equal(offline.exitCode, 1);
  assert.match(offline.stderr, /rsp-app-unavailable/u);

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
  const tokenPath = join(workspace.workspaceRoot, ".rsp/session/token");
  await writeFile(tokenPath, `${randomBytes(32).toString("hex")}\n`);
  await chmod(tokenPath, 0o600);
  const unauthorized = await runCli(["doctor"], workspace.moduleDirectory);
  assert.equal(unauthorized.exitCode, 4);
  assert.match(unauthorized.stderr, /rsp-unauthorized/u);
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
    `${JSON.stringify({ ...session, protocolVersion: "future" })}\n`,
  );
  await chmod(sessionPath, 0o600);
  const incompatible = await runCli(["doctor"], workspace.moduleDirectory);
  assert.equal(incompatible.exitCode, 2);
  assert.match(incompatible.stderr, /rsp-protocol-incompatible/u);

  await writeFile(
    sessionPath,
    `${JSON.stringify({ ...session, expiresAt: "2026-01-01T00:00:00.000Z" })}\n`,
  );
  await chmod(sessionPath, 0o600);
  const stale = await runCli(["doctor"], workspace.moduleDirectory);
  assert.equal(stale.exitCode, 1);
  assert.match(stale.stderr, /rsp-app-unavailable/u);

  await writeFile(
    sessionPath,
    `${JSON.stringify({ ...session, socketPath: "/tmp/rsp-escape.sock" })}\n`,
  );
  await chmod(sessionPath, 0o600);
  const escaped = await runCli(["doctor"], workspace.moduleDirectory);
  assert.equal(escaped.exitCode, 3);
  assert.match(escaped.stderr, /rsp-workspace-invalid/u);
  await server.close();
  assert.equal(
    (JSON.parse(await readFile(sessionPath, "utf8")) as { socketPath: string })
      .socketPath,
    "/tmp/rsp-escape.sock",
  );
});

test("rsp rejects a symlinked private session directory", async (context) => {
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
  const result = await runCli(["doctor"], workspace.moduleDirectory);
  assert.equal(result.exitCode, 3);
  assert.match(result.stderr, /rsp-workspace-invalid/u);
});

test("rsp never sends its bearer token through a symlinked socket", async (context) => {
  const workspace = await createWorkspace(context);
  const sessionDirectory = join(workspace.workspaceRoot, ".rsp/session");
  const socketPath = join(sessionDirectory, "rsp.sock");
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  const outside = join(workspace.workspaceRoot, "outside.sock");
  await writeFile(outside, "not-a-socket");
  await symlink(outside, socketPath);
  await writeFile(join(sessionDirectory, "token"), `${token}\n`, {
    mode: 0o600,
  });
  await chmod(join(sessionDirectory, "token"), 0o600);
  await writeFile(
    join(sessionDirectory, "session.json"),
    `${JSON.stringify({
      schemaVersion: 1,
      protocolVersion: RSP_PROTOCOL_VERSION,
      workspaceId: workspace.workspaceId,
      socketPath,
      appPid: process.pid,
      enginePid: process.pid,
      expiresAt,
    })}\n`,
    { mode: 0o600 },
  );
  await chmod(join(sessionDirectory, "session.json"), 0o600);

  const result = await runCli(["doctor"], workspace.moduleDirectory);
  assert.equal(result.exitCode, 3);
  assert.match(result.stderr, /rsp-workspace-invalid/u);
  assert.equal(result.stderr.includes(token), false);
});

test("rsp server rejects short tokens and unowned stale socket paths", async (context) => {
  const workspace = await createWorkspace(context);
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  await assert.rejects(
    startRspDoctorServer({
      ...workspace,
      appPid: process.pid,
      enginePid: process.pid,
      expiresAt,
      token: randomBytes(16),
      getDoctorState: () =>
        doctorState({ workspaceId: workspace.workspaceId, expiresAt }),
    }),
    /rsp-token-too-short/u,
  );
  const socketPath = join(workspace.workspaceRoot, ".rsp/session/rsp.sock");
  await writeFile(socketPath, "not-a-socket");
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
    /rsp-socket-path-untrusted/u,
  );
  assert.equal(await readFile(socketPath, "utf8"), "not-a-socket");
});

test("rsp server replaces only checksum-independent stale state with exact ownership", async (context) => {
  const workspace = await createWorkspace(context);
  const socketPath = join(workspace.workspaceRoot, ".rsp/session/rsp.sock");
  const sessionPath = join(
    workspace.workspaceRoot,
    ".rsp/session/session.json",
  );
  const tokenPath = join(workspace.workspaceRoot, ".rsp/session/token");
  await createStaleSocket(socketPath);
  await writeFile(
    sessionPath,
    `${JSON.stringify({
      schemaVersion: 1,
      protocolVersion: RSP_PROTOCOL_VERSION,
      workspaceId: workspace.workspaceId,
      socketPath,
      appPid: process.pid,
      enginePid: 2_147_483_000,
      expiresAt: "2026-01-01T00:00:00.000Z",
    })}\n`,
    { mode: 0o600 },
  );
  await chmod(sessionPath, 0o600);
  await writeFile(tokenPath, `${randomBytes(32).toString("hex")}\n`, {
    mode: 0o600,
  });
  await chmod(tokenPath, 0o600);
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  const server = await startRspDoctorServer({
    ...workspace,
    appPid: process.pid,
    enginePid: process.pid,
    expiresAt,
    token: randomBytes(32),
    getDoctorState: () =>
      doctorState({ workspaceId: workspace.workspaceId, expiresAt }),
    isPidRunning: () => false,
  });
  context.after(() => server.close().catch(() => undefined));
  assert.equal(
    (await runCli(["doctor"], workspace.moduleDirectory)).exitCode,
    0,
  );
  await server.close();
});

test("rsp server preserves an orphan credential it cannot prove it owns", async (context) => {
  const workspace = await createWorkspace(context);
  const tokenPath = join(workspace.workspaceRoot, ".rsp/session/token");
  await writeFile(tokenPath, "user-owned\n", { mode: 0o600 });
  await chmod(tokenPath, 0o600);
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
    /rsp-orphan-token-untrusted/u,
  );
  assert.equal(await readFile(tokenPath, "utf8"), "user-owned\n");
});

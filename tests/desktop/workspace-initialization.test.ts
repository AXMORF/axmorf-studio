import assert from "node:assert/strict";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

import {
  MANAGED_FILES_LEDGER_PATH,
  assertWorkspaceManagedPath,
  checksumWorkspaceBytes,
  writeWorkspaceFileAtomic,
} from "../../desktop/adapters/workspace-filesystem";
import { initializeWorkspace } from "../../desktop/application/initialize-workspace";
import {
  DESKTOP_MANAGED_FILE_PATHS,
  DESKTOP_WORKSPACE_DIRECTORIES,
  ManagedFilesLedgerSchema,
  WorkspaceManifestSchema,
} from "../../desktop/contracts/workspace";

const integrationResourcesRoot = resolve(
  "desktop/resources/workspace-integration",
);

const createFixture = async () => {
  const root = await mkdtemp(join(tmpdir(), "axmorf-workspace-init-"));
  const homeDirectory = join(root, "home");
  const repositoryRoot = join(root, "repository");
  const rspPath = join(root, "runtime-rsp");
  await mkdir(join(homeDirectory, "Movies"), { recursive: true });
  await mkdir(repositoryRoot);
  const rspBytes = Buffer.from("test runtime rsp\n", "utf8");
  await writeFile(rspPath, rspBytes, { mode: 0o755 });
  await chmod(rspPath, 0o755);
  return {
    root,
    homeDirectory,
    repositoryRoot,
    rspExecutable: {
      path: rspPath,
      sha256: checksumWorkspaceBytes(rspBytes),
    },
    workspaceRoot: join(homeDirectory, "Movies", "AXMORF Studio"),
  };
};

const initialize = (fixture: Awaited<ReturnType<typeof createFixture>>) =>
  initializeWorkspace({
    workspaceRoot: fixture.workspaceRoot,
    homeDirectory: fixture.homeDirectory,
    integrationResourcesRoot,
    rspExecutable: fixture.rspExecutable,
    forbiddenRoots: [],
    activeWork: async () => false,
  });

const readJson = async (path: string) =>
  JSON.parse(await readFile(path, "utf8")) as unknown;

test("fresh initialization creates exact managed layout, checksums, and permissions", async (context) => {
  const fixture = await createFixture();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));

  const first = await initialize(fixture);
  assert.equal(first.initialized, true);
  assert.equal(first.workspaceRoot, fixture.workspaceRoot);
  assert.equal(
    WorkspaceManifestSchema.parse(
      await readJson(join(fixture.workspaceRoot, ".rsp/workspace.json")),
    ).workspaceId,
    first.manifest.workspaceId,
  );
  const ledger = ManagedFilesLedgerSchema.parse(
    await readJson(join(fixture.workspaceRoot, MANAGED_FILES_LEDGER_PATH)),
  );
  assert.equal(ledger.state, "ready");
  assert.deepEqual(
    ledger.files.map((file) => file.path),
    DESKTOP_MANAGED_FILE_PATHS,
  );
  for (const record of ledger.files) {
    const destination = join(fixture.workspaceRoot, record.path);
    const metadata = await lstat(destination);
    assert.equal(metadata.isFile(), true);
    assert.equal(metadata.isSymbolicLink(), false);
    assert.equal(metadata.mode & 0o777, record.mode);
    assert.equal(
      checksumWorkspaceBytes(await readFile(destination)),
      record.sha256,
    );
  }
  assert.equal(
    await readFile(join(fixture.workspaceRoot, ".rsp/bin/rsp"), "utf8"),
    "test runtime rsp\n",
  );
  assert.equal(
    (await lstat(join(fixture.workspaceRoot, ".rsp/workspace.json"))).mode &
      0o777,
    0o600,
  );
  assert.equal(
    (await lstat(join(fixture.workspaceRoot, MANAGED_FILES_LEDGER_PATH))).mode &
      0o777,
    0o600,
  );
  for (const directory of DESKTOP_WORKSPACE_DIRECTORIES) {
    const expectedMode = directory.startsWith(".rsp") ? 0o700 : 0o755;
    assert.equal(
      (await lstat(join(fixture.workspaceRoot, directory))).mode & 0o777,
      expectedMode,
    );
  }
  assert.deepEqual(
    (await readdir(join(fixture.homeDirectory, "Movies"))).filter((entry) =>
      entry.startsWith(".axmorf-workspace-staging-"),
    ),
    [],
  );

  const second = await initialize(fixture);
  assert.equal(second.initialized, false);
  assert.equal(second.manifest.workspaceId, first.manifest.workspaceId);
});

test("partial initialization recovers exactly and preserves unknown files", async (context) => {
  const fixture = await createFixture();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  const first = await initialize(fixture);
  const unknownPath = join(fixture.workspaceRoot, "notes.txt");
  await writeFile(unknownPath, "user-owned\n", "utf8");
  await rm(join(fixture.workspaceRoot, "CLAUDE.md"));
  const ledgerPath = join(fixture.workspaceRoot, MANAGED_FILES_LEDGER_PATH);
  const ledger = ManagedFilesLedgerSchema.parse(await readJson(ledgerPath));
  await writeFile(
    ledgerPath,
    `${JSON.stringify({ ...ledger, state: "initializing" }, null, 2)}\n`,
    { mode: 0o600 },
  );
  await chmod(ledgerPath, 0o600);

  const recovered = await initialize(fixture);
  assert.equal(recovered.initialized, true);
  assert.equal(recovered.manifest.workspaceId, first.manifest.workspaceId);
  assert.equal(await readFile(unknownPath, "utf8"), "user-owned\n");
  assert.equal(
    ManagedFilesLedgerSchema.parse(await readJson(ledgerPath)).state,
    "ready",
  );
});

test("managed drift and completed-state loss fail closed without overwriting", async (context) => {
  const fixture = await createFixture();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  await initialize(fixture);
  await chmod(join(fixture.workspaceRoot, "projects"), 0o700);
  await assert.rejects(initialize(fixture), /directory mode drifted/iu);
  await chmod(join(fixture.workspaceRoot, "projects"), 0o755);
  const agentsPath = join(fixture.workspaceRoot, "AGENTS.md");
  await writeFile(agentsPath, "user drift\n", "utf8");
  await assert.rejects(initialize(fixture), /Managed Workspace file drifted/iu);
  assert.equal(await readFile(agentsPath, "utf8"), "user drift\n");

  await rm(fixture.workspaceRoot, { recursive: true, force: true });
  await initialize(fixture);
  await rm(join(fixture.workspaceRoot, "deliveries"), {
    recursive: true,
    force: true,
  });
  await assert.rejects(
    initialize(fixture),
    /Ready Workspace managed state is incomplete/iu,
  );
  await mkdir(join(fixture.workspaceRoot, "deliveries"), { mode: 0o755 });
  await chmod(join(fixture.workspaceRoot, "deliveries"), 0o755);
  await rm(join(fixture.workspaceRoot, "GEMINI.md"));
  await assert.rejects(
    initialize(fixture),
    /Ready Workspace managed state is incomplete/iu,
  );
});

test("an unmanaged file at a fixed managed path is never claimed", async (context) => {
  const fixture = await createFixture();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  await mkdir(fixture.workspaceRoot);
  const expectedAgents = await readFile(
    join(integrationResourcesRoot, "AGENTS.md"),
  );
  await writeFile(join(fixture.workspaceRoot, "AGENTS.md"), expectedAgents, {
    mode: 0o644,
  });
  await chmod(join(fixture.workspaceRoot, "AGENTS.md"), 0o644);
  await assert.rejects(
    initialize(fixture),
    /do not belong to an initialized Workspace/iu,
  );
});

test("Workspace validation rejects symlinks, path escape, and forbidden ownership roots", async (context) => {
  const fixture = await createFixture();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));

  const symlinkTarget = join(fixture.homeDirectory, "Movies", "real-workspace");
  await mkdir(symlinkTarget);
  await symlink(symlinkTarget, fixture.workspaceRoot);
  await assert.rejects(initialize(fixture), /real directory/iu);
  await rm(fixture.workspaceRoot);

  await mkdir(fixture.workspaceRoot);
  await symlink(
    join(fixture.root, "escape"),
    join(fixture.workspaceRoot, ".rsp"),
  );
  await assert.rejects(initialize(fixture), /unsafe/iu);
  await assert.rejects(
    assertWorkspaceManagedPath({
      workspaceRoot: fixture.workspaceRoot,
      relativePath: "../escape",
      kind: "file",
    }),
    /not normalized|escapes/iu,
  );

  await assert.rejects(
    initializeWorkspace({
      workspaceRoot: fixture.repositoryRoot,
      homeDirectory: fixture.homeDirectory,
      integrationResourcesRoot,
      rspExecutable: fixture.rspExecutable,
      forbiddenRoots: [fixture.repositoryRoot],
      activeWork: async () => false,
    }),
    /forbidden ownership root/iu,
  );
  await assert.rejects(
    initializeWorkspace({
      workspaceRoot: fixture.homeDirectory,
      homeDirectory: fixture.homeDirectory,
      integrationResourcesRoot,
      rspExecutable: fixture.rspExecutable,
      forbiddenRoots: [],
      activeWork: async () => false,
    }),
    /home directory itself/iu,
  );
  await assert.rejects(
    initializeWorkspace({
      workspaceRoot: "/",
      homeDirectory: fixture.homeDirectory,
      integrationResourcesRoot,
      rspExecutable: fixture.rspExecutable,
      forbiddenRoots: [],
      activeWork: async () => false,
    }),
    /Filesystem root/iu,
  );
  const appBundleRoot = join(fixture.root, "AXMORF Studio.app");
  await mkdir(appBundleRoot);
  await assert.rejects(
    initializeWorkspace({
      workspaceRoot: join(appBundleRoot, "Workspace"),
      homeDirectory: fixture.homeDirectory,
      integrationResourcesRoot,
      rspExecutable: fixture.rspExecutable,
      forbiddenRoots: [],
      activeWork: async () => false,
    }),
    /App bundle/iu,
  );
});

test("fresh directory modes are exact even under a restrictive umask", async (context) => {
  const fixture = await createFixture();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  const previousUmask = process.umask(0o077);
  try {
    await initialize(fixture);
  } finally {
    process.umask(previousUmask);
  }
  assert.equal(
    (await lstat(join(fixture.workspaceRoot, "projects"))).mode & 0o777,
    0o755,
  );
  assert.equal(
    (await lstat(join(fixture.workspaceRoot, ".rsp/session"))).mode & 0o777,
    0o700,
  );
});

test("atomic managed writes do not clobber and remove temporary files on failure", async (context) => {
  const fixture = await createFixture();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  const destination = join(fixture.root, "owned.txt");
  await writeFile(destination, "original\n", "utf8");
  await assert.rejects(
    writeWorkspaceFileAtomic({
      destination,
      bytes: Buffer.from("replacement\n"),
      mode: 0o600,
      replace: false,
    }),
    /already exists/iu,
  );
  assert.equal(await readFile(destination, "utf8"), "original\n");
  assert.deepEqual(
    (await readdir(fixture.root)).filter((entry) => entry.includes(".tmp")),
    [],
  );
});

test("Workspace initialization requires the exact verified Runtime Pack rsp executable", async (context) => {
  const fixture = await createFixture();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  await assert.rejects(
    initializeWorkspace({
      workspaceRoot: fixture.workspaceRoot,
      homeDirectory: fixture.homeDirectory,
      integrationResourcesRoot,
      rspExecutable: {
        ...fixture.rspExecutable,
        sha256: "0".repeat(64),
      },
      forbiddenRoots: [],
      activeWork: async () => false,
    }),
    /verified Runtime Pack/iu,
  );
  await chmod(fixture.rspExecutable.path, 0o644);
  await assert.rejects(
    initializeWorkspace({
      workspaceRoot: fixture.workspaceRoot,
      homeDirectory: fixture.homeDirectory,
      integrationResourcesRoot,
      rspExecutable: fixture.rspExecutable,
      forbiddenRoots: [],
      activeWork: async () => false,
    }),
    /Runtime Pack executable/iu,
  );
});

test("managed integration update is atomic, inactive-only, and rejects user drift", async (context) => {
  const fixture = await createFixture();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  await initialize(fixture);
  const nextRspPath = join(fixture.root, "next-runtime-rsp");
  const nextRspBytes = Buffer.from("next runtime rsp\n", "utf8");
  await writeFile(nextRspPath, nextRspBytes, { mode: 0o755 });
  await chmod(nextRspPath, 0o755);
  const nextRsp = {
    path: nextRspPath,
    sha256: checksumWorkspaceBytes(nextRspBytes),
  };
  await assert.rejects(
    initializeWorkspace({
      workspaceRoot: fixture.workspaceRoot,
      homeDirectory: fixture.homeDirectory,
      integrationResourcesRoot,
      rspExecutable: nextRsp,
      forbiddenRoots: [],
      activeWork: async () => true,
    }),
    /active work/iu,
  );
  assert.equal(
    await readFile(join(fixture.workspaceRoot, ".rsp/bin/rsp"), "utf8"),
    "test runtime rsp\n",
  );

  const updated = await initializeWorkspace({
    workspaceRoot: fixture.workspaceRoot,
    homeDirectory: fixture.homeDirectory,
    integrationResourcesRoot,
    rspExecutable: nextRsp,
    forbiddenRoots: [],
    activeWork: async () => false,
  });
  assert.equal(updated.initialized, true);
  assert.equal(
    await readFile(join(fixture.workspaceRoot, ".rsp/bin/rsp"), "utf8"),
    "next runtime rsp\n",
  );
  assert.equal(
    (await readdir(dirname(fixture.workspaceRoot))).filter((entry) =>
      entry.startsWith(".axmorf-workspace-preserved-"),
    ).length,
    1,
  );

  const thirdRspPath = join(fixture.root, "third-runtime-rsp");
  const thirdRspBytes = Buffer.from("third runtime rsp\n", "utf8");
  await writeFile(thirdRspPath, thirdRspBytes, { mode: 0o755 });
  await chmod(thirdRspPath, 0o755);
  await writeFile(join(fixture.workspaceRoot, "AGENTS.md"), "user drift\n");
  await assert.rejects(
    initializeWorkspace({
      workspaceRoot: fixture.workspaceRoot,
      homeDirectory: fixture.homeDirectory,
      integrationResourcesRoot,
      rspExecutable: {
        path: thirdRspPath,
        sha256: checksumWorkspaceBytes(thirdRspBytes),
      },
      forbiddenRoots: [],
      activeWork: async () => false,
    }),
    /Managed Workspace file drifted/iu,
  );
  assert.equal(
    await readFile(join(fixture.workspaceRoot, "AGENTS.md"), "utf8"),
    "user drift\n",
  );
});

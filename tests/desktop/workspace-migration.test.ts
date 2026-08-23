import assert from "node:assert/strict";
import { createServer } from "node:net";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  rmdir,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import test from "node:test";

import { acquireRepositoryOperationLock } from "../../scripts/shared/repository-operation-lock";

import {
  createWorkspaceMigrationJournal,
  readWorkspaceActiveProduction,
  workspaceHasActiveProduction,
  writeWorkspaceMigrationJournal,
} from "../../desktop/adapters/workspace-migration-filesystem";
import {
  loadWorkspaceMigrationRecoveryPointer,
  removeWorkspaceMigrationRecoveryPointer,
  writeWorkspaceMigrationRecoveryPointer,
} from "../../desktop/adapters/workspace-migration-recovery";
import {
  checksumWorkspaceBytes,
  copyWorkspaceTree,
  inspectWorkspaceTree,
  renameWorkspaceRoot,
} from "../../desktop/adapters/workspace-filesystem";
import { initializeWorkspace } from "../../desktop/application/initialize-workspace";
import {
  completeWorkspaceRootMigration,
  migrateLegacyWorkspaceV1,
  migrateWorkspaceRoot,
  recoverWorkspaceMigration,
  rollbackWorkspaceRootMigration,
} from "../../desktop/application/migrate-workspace";
import {
  LEGACY_DESKTOP_MANAGED_FILE_PATHS,
  ManagedFilesLedgerSchema,
  WorkspaceManifestSchema,
  WorkspaceMigrationRecordSchema,
} from "../../desktop/contracts/workspace";

const integrationResourcesRoot = resolve(
  "desktop/resources/workspace-integration",
);

const legacyDirectories = [
  "projects",
  "media",
  "deliveries",
  ".agents",
  ".agents/skills",
  ".agents/skills/remotion-story-producer-video",
  ".rsp",
  ".rsp/bin",
  ".rsp/lib",
  ".rsp/hermes",
  ".rsp/work",
  ".rsp/artifacts",
  ".rsp/attempts",
  ".rsp/session",
] as const;

const createFixture = async () => {
  const root = await mkdtemp(join(tmpdir(), "axmorf-workspace-migration-"));
  const homeDirectory = join(root, "home");
  const repositoryRoot = join(root, "repository");
  const sourceWorkspaceRoot = join(root, "source-workspace");
  const targetParent = join(root, "target-parent");
  const targetWorkspaceRoot = join(targetParent, "target-workspace");
  const rspPath = join(root, "runtime-rsp");
  await mkdir(homeDirectory);
  await mkdir(repositoryRoot);
  await mkdir(targetParent);
  const rspBytes = Buffer.from("test runtime rsp\n", "utf8");
  await writeFile(rspPath, rspBytes, { mode: 0o755 });
  await chmod(rspPath, 0o755);
  return {
    root,
    homeDirectory,
    repositoryRoot,
    sourceWorkspaceRoot,
    targetParent,
    targetWorkspaceRoot,
    rspExecutable: {
      path: rspPath,
      sha256: checksumWorkspaceBytes(rspBytes),
    },
  };
};

const modeForLegacyPath = (relativePath: string) =>
  relativePath === ".rsp/bin/rsp"
    ? 0o755
    : relativePath === ".rsp/hermes/INSTALL_PROMPT.md" ||
        relativePath === ".rsp/lib/rsp-client.cjs"
      ? 0o600
      : 0o644;

const createLegacyWorkspace = async ({
  workspaceRoot,
  workspaceId = "9f8260e8-78c6-4bee-a6a4-bba96bb22038",
}: {
  readonly workspaceRoot: string;
  readonly workspaceId?: string;
}) => {
  await mkdir(workspaceRoot, { mode: 0o755 });
  for (const relativePath of legacyDirectories) {
    const mode = relativePath.startsWith(".rsp") ? 0o700 : 0o755;
    await mkdir(join(workspaceRoot, relativePath), { mode });
    await chmod(join(workspaceRoot, relativePath), mode);
  }
  const files = [];
  for (const relativePath of LEGACY_DESKTOP_MANAGED_FILE_PATHS) {
    const bytes = Buffer.from(`legacy:${relativePath}\n`, "utf8");
    const mode = modeForLegacyPath(relativePath);
    await writeFile(join(workspaceRoot, relativePath), bytes, { mode });
    await chmod(join(workspaceRoot, relativePath), mode);
    files.push({
      path: relativePath,
      mode,
      sha256: checksumWorkspaceBytes(bytes),
    });
  }
  await writeFile(
    join(workspaceRoot, ".rsp/workspace.json"),
    `${JSON.stringify({
      schemaVersion: 1,
      contractVersion: "desktop-workspace-v1",
      productId: "com.axmorf.studio",
      workspaceId,
      layoutVersion: 1,
      integrationVersion: 1,
      createdBy: "AXMORF Studio",
    })}\n`,
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
      files,
    })}\n`,
    { mode: 0o600 },
  );
  await chmod(join(workspaceRoot, ".rsp/managed-files.json"), 0o600);
};

const initialize = (
  fixture: Awaited<ReturnType<typeof createFixture>>,
  activeWork = async () => false,
) =>
  initializeWorkspace({
    workspaceRoot: fixture.sourceWorkspaceRoot,
    homeDirectory: fixture.homeDirectory,
    integrationResourcesRoot,
    rspExecutable: fixture.rspExecutable,
    forbiddenRoots: [],
    activeWork,
  });

test("v1 upgrades once through same-parent staging, preserves unknown data and the old root", async (context) => {
  const fixture = await createFixture();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  await createLegacyWorkspace({ workspaceRoot: fixture.sourceWorkspaceRoot });
  await mkdir(join(fixture.sourceWorkspaceRoot, "future"));
  await writeFile(
    join(fixture.sourceWorkspaceRoot, "future/user-owned.txt"),
    "preserve me\n",
  );

  const migrated = await initialize(fixture);
  assert.equal(migrated.initialized, true);
  assert.equal(migrated.manifest.schemaVersion, 2);
  assert.equal(
    await readFile(
      join(fixture.sourceWorkspaceRoot, "future/user-owned.txt"),
      "utf8",
    ),
    "preserve me\n",
  );
  await assert.rejects(
    lstat(join(fixture.sourceWorkspaceRoot, ".rsp/lib/rsp-client.cjs")),
    /ENOENT/u,
  );
  const siblings = await readdir(dirname(fixture.sourceWorkspaceRoot));
  const preserved = siblings.filter((entry) =>
    entry.startsWith(".axmorf-workspace-preserved-"),
  );
  assert.equal(preserved.length, 1);
  assert.equal(
    await readFile(
      join(
        dirname(fixture.sourceWorkspaceRoot),
        preserved[0]!,
        "future/user-owned.txt",
      ),
      "utf8",
    ),
    "preserve me\n",
  );
  assert.equal(
    WorkspaceManifestSchema.parse(
      JSON.parse(
        await readFile(
          join(fixture.sourceWorkspaceRoot, ".rsp/workspace.json"),
          "utf8",
        ),
      ),
    ).workspaceId,
    migrated.manifest.workspaceId,
  );
  assert.equal(
    ManagedFilesLedgerSchema.parse(
      JSON.parse(
        await readFile(
          join(fixture.sourceWorkspaceRoot, ".rsp/managed-files.json"),
          "utf8",
        ),
      ),
    ).state,
    "ready",
  );

  const sameVersion = await initialize(fixture);
  assert.equal(sameVersion.initialized, false);
  assert.equal(sameVersion.manifest.workspaceId, migrated.manifest.workspaceId);
});

test("v1 migration fails closed for active work, managed drift, symlink and special files", async (context) => {
  const fixture = await createFixture();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  await createLegacyWorkspace({ workspaceRoot: fixture.sourceWorkspaceRoot });
  await assert.rejects(
    initialize(fixture, async () => true),
    /active work/iu,
  );
  assert.equal(
    JSON.parse(
      await readFile(
        join(fixture.sourceWorkspaceRoot, ".rsp/workspace.json"),
        "utf8",
      ),
    ).schemaVersion,
    1,
  );

  await writeFile(join(fixture.sourceWorkspaceRoot, "AGENTS.md"), "drift\n");
  await assert.rejects(initialize(fixture), /managed Workspace file drifted/iu);
  await rm(fixture.sourceWorkspaceRoot, { recursive: true, force: true });
  await createLegacyWorkspace({ workspaceRoot: fixture.sourceWorkspaceRoot });
  await symlink(
    join(fixture.root, "outside"),
    join(fixture.sourceWorkspaceRoot, "unknown-link"),
  );
  await assert.rejects(initialize(fixture), /rejects symlink/iu);

  await rm(join(fixture.sourceWorkspaceRoot, "unknown-link"));
  const socketPath = join(fixture.sourceWorkspaceRoot, "unknown.sock");
  const server = createServer();
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(socketPath, resolveListen);
  });
  try {
    await assert.rejects(initialize(fixture), /rejects special file/iu);
  } finally {
    await new Promise<void>((resolveClose) =>
      server.close(() => resolveClose()),
    );
  }
});

test("v1 copy failure, checksum drift and insufficient space roll back without a second authority", async (context) => {
  const fixture = await createFixture();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  await createLegacyWorkspace({ workspaceRoot: fixture.sourceWorkspaceRoot });

  await assert.rejects(
    migrateLegacyWorkspaceV1({
      workspaceRoot: fixture.sourceWorkspaceRoot,
      integrationResourcesRoot,
      rspExecutable: fixture.rspExecutable,
      activeWork: async () => false,
      fileSystem: { availableBytes: async () => 0 },
    }),
    /insufficient free space/iu,
  );
  assert.equal(
    JSON.parse(
      await readFile(
        join(fixture.sourceWorkspaceRoot, ".rsp/workspace.json"),
        "utf8",
      ),
    ).schemaVersion,
    1,
  );

  await assert.rejects(
    migrateLegacyWorkspaceV1({
      workspaceRoot: fixture.sourceWorkspaceRoot,
      integrationResourcesRoot,
      rspExecutable: fixture.rspExecutable,
      activeWork: async () => false,
      fileSystem: {
        availableBytes: async () => Number.MAX_SAFE_INTEGER,
        copyFile: async () => {
          throw new Error("injected copy failure");
        },
      },
    }),
    /injected copy failure/iu,
  );
  await assert.rejects(
    migrateLegacyWorkspaceV1({
      workspaceRoot: fixture.sourceWorkspaceRoot,
      integrationResourcesRoot,
      rspExecutable: fixture.rspExecutable,
      activeWork: async () => false,
      fileSystem: {
        availableBytes: async () => Number.MAX_SAFE_INTEGER,
        copyFile: async ({ destination, entry }) => {
          await writeFile(destination, "corrupt", { mode: entry.mode });
        },
      },
    }),
    /checksum verification failed/iu,
  );
  assert.equal(
    (await readdir(fixture.root)).filter((entry) =>
      entry.startsWith(".axmorf-workspace-staging-"),
    ).length,
    0,
  );
  assert.equal(
    (await readdir(fixture.root)).filter((entry) =>
      entry.startsWith(".axmorf-workspace-migration-"),
    ).length,
    0,
  );
});

test("root migration copies exact bytes, atomically switches preference and preserves the old root", async (context) => {
  const fixture = await createFixture();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  await initialize(fixture);
  await writeFile(
    join(fixture.sourceWorkspaceRoot, "user-note.txt"),
    "owned\n",
  );
  await mkdir(join(fixture.sourceWorkspaceRoot, ".producer-runs"));
  await writeFile(
    join(fixture.sourceWorkspaceRoot, ".producer-runs/historical.json"),
    "historical\n",
  );
  let preference = fixture.sourceWorkspaceRoot;
  let switchCount = 0;
  const switchPreference = async ({
    expectedWorkspaceRoot,
    nextWorkspaceRoot,
  }: {
    readonly expectedWorkspaceRoot: string;
    readonly nextWorkspaceRoot: string;
  }) => {
    assert.equal(preference, expectedWorkspaceRoot);
    preference = nextWorkspaceRoot;
    switchCount += 1;
  };

  const migrated = await migrateWorkspaceRoot({
    sourceWorkspaceRoot: fixture.sourceWorkspaceRoot,
    targetWorkspaceRoot: fixture.targetWorkspaceRoot,
    integrationResourcesRoot,
    rspExecutable: fixture.rspExecutable,
    activeWork: async () => false,
    homeDirectory: fixture.homeDirectory,
    forbiddenRoots: [],
    readPreference: async () => preference,
    switchPreference,
    writeRecovery: async () => undefined,
    removeRecovery: async () => undefined,
  });
  assert.equal(preference, fixture.targetWorkspaceRoot);
  assert.equal(switchCount, 1);
  assert.equal(
    await readFile(join(fixture.targetWorkspaceRoot, "user-note.txt"), "utf8"),
    "owned\n",
  );
  assert.equal(
    await readFile(join(fixture.sourceWorkspaceRoot, "user-note.txt"), "utf8"),
    "owned\n",
  );
  await assert.rejects(
    lstat(join(fixture.targetWorkspaceRoot, ".producer-runs")),
    /ENOENT/u,
  );
  assert.equal(
    await readFile(
      join(fixture.sourceWorkspaceRoot, ".producer-runs/historical.json"),
      "utf8",
    ),
    "historical\n",
  );
  assert.equal(
    WorkspaceManifestSchema.parse(
      JSON.parse(
        await readFile(
          join(fixture.targetWorkspaceRoot, ".rsp/workspace.json"),
          "utf8",
        ),
      ),
    ).workspaceId,
    migrated.manifest.workspaceId,
  );
  assert.notEqual(migrated.pending, null);
  await completeWorkspaceRootMigration({
    pending: migrated.pending!,
    removeRecovery: async () => undefined,
  });

  await migrateWorkspaceRoot({
    sourceWorkspaceRoot: fixture.targetWorkspaceRoot,
    targetWorkspaceRoot: fixture.targetWorkspaceRoot,
    integrationResourcesRoot,
    rspExecutable: fixture.rspExecutable,
    activeWork: async () => {
      throw new Error("same-version no-op must not probe active work");
    },
    homeDirectory: fixture.homeDirectory,
    forbiddenRoots: [],
    readPreference: async () => preference,
    switchPreference,
    writeRecovery: async () => undefined,
    removeRecovery: async () => undefined,
  });
  assert.equal(switchCount, 1);
});

test("root migration blockers and failures preserve the original preference and remove staging", async (context) => {
  const fixture = await createFixture();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  await initialize(fixture);
  const preference = fixture.sourceWorkspaceRoot;

  await assert.rejects(
    migrateWorkspaceRoot({
      sourceWorkspaceRoot: fixture.sourceWorkspaceRoot,
      targetWorkspaceRoot: fixture.targetWorkspaceRoot,
      integrationResourcesRoot,
      rspExecutable: fixture.rspExecutable,
      activeWork: async () => true,
      homeDirectory: fixture.homeDirectory,
      forbiddenRoots: [],
      readPreference: async () => preference,
      switchPreference: async () => {
        throw new Error("must not switch");
      },
      writeRecovery: async () => undefined,
      removeRecovery: async () => undefined,
    }),
    /active work/iu,
  );
  await mkdir(fixture.targetWorkspaceRoot);
  await assert.rejects(
    migrateWorkspaceRoot({
      sourceWorkspaceRoot: fixture.sourceWorkspaceRoot,
      targetWorkspaceRoot: fixture.targetWorkspaceRoot,
      integrationResourcesRoot,
      rspExecutable: fixture.rspExecutable,
      activeWork: async () => false,
      homeDirectory: fixture.homeDirectory,
      forbiddenRoots: [],
      readPreference: async () => preference,
      switchPreference: async () => {
        throw new Error("must not switch");
      },
      writeRecovery: async () => undefined,
      removeRecovery: async () => undefined,
    }),
    /target already exists/iu,
  );
  await rmdir(fixture.targetWorkspaceRoot);
  await assert.rejects(
    migrateWorkspaceRoot({
      sourceWorkspaceRoot: fixture.sourceWorkspaceRoot,
      targetWorkspaceRoot: fixture.targetWorkspaceRoot,
      integrationResourcesRoot,
      rspExecutable: fixture.rspExecutable,
      activeWork: async () => false,
      homeDirectory: fixture.homeDirectory,
      forbiddenRoots: [],
      readPreference: async () => preference,
      switchPreference: async () => {
        throw new Error("preference write failed");
      },
      writeRecovery: async () => undefined,
      removeRecovery: async () => undefined,
    }),
    /preference write failed/iu,
  );
  assert.equal(preference, fixture.sourceWorkspaceRoot);
  await assert.rejects(lstat(fixture.targetWorkspaceRoot), /ENOENT/u);
  assert.deepEqual(
    (await readdir(fixture.targetParent)).filter((entry) =>
      entry.startsWith(".axmorf-workspace-"),
    ),
    [],
  );
});

test("root migration treats a post-commit preference cleanup failure as committed", async (context) => {
  const fixture = await createFixture();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  await initialize(fixture);
  let preference = fixture.sourceWorkspaceRoot;
  const migrated = await migrateWorkspaceRoot({
    sourceWorkspaceRoot: fixture.sourceWorkspaceRoot,
    targetWorkspaceRoot: fixture.targetWorkspaceRoot,
    integrationResourcesRoot,
    rspExecutable: fixture.rspExecutable,
    activeWork: async () => false,
    homeDirectory: fixture.homeDirectory,
    forbiddenRoots: [],
    readPreference: async () => preference,
    switchPreference: async ({ expectedWorkspaceRoot, nextWorkspaceRoot }) => {
      assert.equal(preference, expectedWorkspaceRoot);
      preference = nextWorkspaceRoot;
      throw new Error("injected lock cleanup failure");
    },
    writeRecovery: async () => undefined,
    removeRecovery: async () => undefined,
  });
  assert.equal(preference, fixture.targetWorkspaceRoot);
  assert.notEqual(migrated.pending, null);
  await lstat(fixture.targetWorkspaceRoot);
  await lstat(fixture.sourceWorkspaceRoot);
  await completeWorkspaceRootMigration({
    pending: migrated.pending!,
    removeRecovery: async () => undefined,
  });
});

test("root migration rollback restores the old preference and removes only its exact target", async (context) => {
  const fixture = await createFixture();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  await initialize(fixture);
  let preference = fixture.sourceWorkspaceRoot;
  const switchPreference = async ({
    expectedWorkspaceRoot,
    nextWorkspaceRoot,
  }: {
    readonly expectedWorkspaceRoot: string;
    readonly nextWorkspaceRoot: string;
  }) => {
    assert.equal(preference, expectedWorkspaceRoot);
    preference = nextWorkspaceRoot;
  };
  const migrated = await migrateWorkspaceRoot({
    sourceWorkspaceRoot: fixture.sourceWorkspaceRoot,
    targetWorkspaceRoot: fixture.targetWorkspaceRoot,
    integrationResourcesRoot,
    rspExecutable: fixture.rspExecutable,
    activeWork: async () => false,
    homeDirectory: fixture.homeDirectory,
    forbiddenRoots: [],
    readPreference: async () => preference,
    switchPreference,
    writeRecovery: async () => undefined,
    removeRecovery: async () => undefined,
  });
  assert.notEqual(migrated.pending, null);
  await rollbackWorkspaceRootMigration({
    pending: migrated.pending!,
    readPreference: async () => preference,
    switchPreference,
    removeRecovery: async () => undefined,
  });
  assert.equal(preference, fixture.sourceWorkspaceRoot);
  await assert.rejects(lstat(fixture.targetWorkspaceRoot), /ENOENT/u);
  await lstat(fixture.sourceWorkspaceRoot);
});

test("root migration validates forbidden target ownership before copying", async (context) => {
  const fixture = await createFixture();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  await initialize(fixture);
  await assert.rejects(
    migrateWorkspaceRoot({
      sourceWorkspaceRoot: fixture.sourceWorkspaceRoot,
      targetWorkspaceRoot: fixture.targetWorkspaceRoot,
      integrationResourcesRoot,
      rspExecutable: fixture.rspExecutable,
      activeWork: async () => false,
      homeDirectory: fixture.homeDirectory,
      forbiddenRoots: [fixture.targetParent],
      readPreference: async () => fixture.sourceWorkspaceRoot,
      switchPreference: async () => {
        throw new Error("must not switch");
      },
      writeRecovery: async () => {
        throw new Error("must not write recovery");
      },
      removeRecovery: async () => undefined,
    }),
    /forbidden ownership root/iu,
  );
  assert.deepEqual(await readdir(fixture.targetParent), []);
});

test("restart recovery finishes target-ready preference switch and cleans partial staging", async (context) => {
  const fixture = await createFixture();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  const initialized = await initialize(fixture);
  const sourceEntries = await inspectWorkspaceTree(fixture.sourceWorkspaceRoot);
  const migrationId = "853426bc-a6c5-43d6-969a-b92cb093637c";
  const stagingRoot = join(
    fixture.targetParent,
    `.axmorf-workspace-staging-${migrationId}`,
  );
  await copyWorkspaceTree({
    sourceRoot: fixture.sourceWorkspaceRoot,
    destinationRoot: stagingRoot,
    sourceEntries,
  });
  await renameWorkspaceRoot({
    sourceRoot: stagingRoot,
    destinationRoot: fixture.targetWorkspaceRoot,
  });
  const journal = await createWorkspaceMigrationJournal({
    parentRoot: fixture.targetParent,
    migrationId,
  });
  await writeWorkspaceMigrationJournal({
    parentRoot: fixture.targetParent,
    migrationRoot: journal.migrationRoot,
    record: WorkspaceMigrationRecordSchema.parse({
      schemaVersion: 1,
      contractVersion: "desktop-workspace-migration-v1",
      migrationId,
      kind: "workspace-root-move",
      workspaceId: initialized.manifest.workspaceId,
      sourceLeafName: basename(fixture.sourceWorkspaceRoot),
      targetLeafName: basename(fixture.targetWorkspaceRoot),
      stagingLeafName: basename(stagingRoot),
      preservedLeafName: null,
      state: "target-ready",
    }),
  });
  let preference = fixture.sourceWorkspaceRoot;
  assert.equal(
    await recoverWorkspaceMigration({
      parentRoot: fixture.targetParent,
      migrationRoot: journal.migrationRoot,
      sourceWorkspaceRoot: fixture.sourceWorkspaceRoot,
      targetWorkspaceRoot: fixture.targetWorkspaceRoot,
      integrationResourcesRoot,
      rspExecutable: fixture.rspExecutable,
      readPreference: async () => preference,
      switchPreference: async ({
        expectedWorkspaceRoot,
        nextWorkspaceRoot,
      }) => {
        assert.equal(preference, expectedWorkspaceRoot);
        preference = nextWorkspaceRoot;
      },
      clearRecovery: async () => undefined,
    }),
    "completed",
  );
  assert.equal(preference, fixture.targetWorkspaceRoot);
  await assert.rejects(lstat(journal.migrationRoot), /ENOENT/u);

  const partialId = "430fdfbc-a004-4ae7-9d5a-a55222daf2a4";
  const partialStaging = join(
    fixture.targetParent,
    `.axmorf-workspace-staging-${partialId}`,
  );
  await mkdir(partialStaging);
  const partialJournal = await createWorkspaceMigrationJournal({
    parentRoot: fixture.targetParent,
    migrationId: partialId,
  });
  await writeWorkspaceMigrationJournal({
    parentRoot: fixture.targetParent,
    migrationRoot: partialJournal.migrationRoot,
    record: WorkspaceMigrationRecordSchema.parse({
      schemaVersion: 1,
      contractVersion: "desktop-workspace-migration-v1",
      migrationId: partialId,
      kind: "workspace-root-move",
      workspaceId: initialized.manifest.workspaceId,
      sourceLeafName: basename(fixture.targetWorkspaceRoot),
      targetLeafName: "unused-target",
      stagingLeafName: basename(partialStaging),
      preservedLeafName: null,
      state: "copying",
    }),
  });
  assert.equal(
    await recoverWorkspaceMigration({
      parentRoot: fixture.targetParent,
      migrationRoot: partialJournal.migrationRoot,
      sourceWorkspaceRoot: fixture.targetWorkspaceRoot,
      targetWorkspaceRoot: join(fixture.targetParent, "unused-target"),
      integrationResourcesRoot,
      rspExecutable: fixture.rspExecutable,
      readPreference: async () => preference,
      switchPreference: async () => {
        throw new Error("partial recovery must not switch");
      },
      clearRecovery: async () => undefined,
    }),
    "rolled-back",
  );
  await assert.rejects(lstat(partialStaging), /ENOENT/u);
});

test("Application Support recovery pointer is strict, owner-only and exact-id cleared", async (context) => {
  const fixture = await createFixture();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  const applicationSupportRoot = join(fixture.root, "Application Support");
  await mkdir(applicationSupportRoot, { mode: 0o700 });
  const migrationId = "cf504ba9-06c5-4520-a353-e42796f66433";
  const pointer = {
    schemaVersion: 1 as const,
    contractVersion: "desktop-workspace-migration-recovery-v1" as const,
    migrationId,
    parentRoot: fixture.targetParent,
    migrationRoot: join(
      fixture.targetParent,
      `.axmorf-workspace-migration-${migrationId}`,
    ),
    sourceWorkspaceRoot: fixture.sourceWorkspaceRoot,
    targetWorkspaceRoot: fixture.targetWorkspaceRoot,
  };
  await writeWorkspaceMigrationRecoveryPointer({
    applicationSupportRoot,
    pointer,
  });
  assert.deepEqual(
    await loadWorkspaceMigrationRecoveryPointer({ applicationSupportRoot }),
    pointer,
  );
  await assert.rejects(
    removeWorkspaceMigrationRecoveryPointer({
      applicationSupportRoot,
      migrationId: "449b82aa-b868-4d52-a0ec-c60906b9bcde",
    }),
    /ownership changed/iu,
  );
  assert.deepEqual(
    await loadWorkspaceMigrationRecoveryPointer({ applicationSupportRoot }),
    pointer,
  );
  await removeWorkspaceMigrationRecoveryPointer({
    applicationSupportRoot,
    migrationId,
  });
  assert.equal(
    await loadWorkspaceMigrationRecoveryPointer({ applicationSupportRoot }),
    null,
  );

  const outside = join(fixture.root, "outside-pointer.json");
  await writeFile(outside, "outside\n");
  await symlink(
    outside,
    join(applicationSupportRoot, "workspace-migration-recovery.json"),
  );
  await assert.rejects(
    loadWorkspaceMigrationRecoveryPointer({ applicationSupportRoot }),
    /owner-only regular file/iu,
  );
  assert.equal(await readFile(outside, "utf8"), "outside\n");
});

test("journal records cannot claim another migration staging path", async (context) => {
  const fixture = await createFixture();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  const migrationId = "806757ef-25ca-4350-bdda-459d0fa44e39";
  const journal = await createWorkspaceMigrationJournal({
    parentRoot: fixture.targetParent,
    migrationId,
  });
  await assert.rejects(
    writeWorkspaceMigrationJournal({
      parentRoot: fixture.targetParent,
      migrationRoot: journal.migrationRoot,
      record: WorkspaceMigrationRecordSchema.parse({
        schemaVersion: 1,
        contractVersion: "desktop-workspace-migration-v1",
        migrationId,
        kind: "workspace-root-move",
        workspaceId: "9f8260e8-78c6-4bee-a6a4-bba96bb22038",
        sourceLeafName: "source",
        targetLeafName: "target",
        stagingLeafName:
          ".axmorf-workspace-staging-430fdfbc-a004-4ae7-9d5a-a55222daf2a4",
        preservedLeafName: null,
        state: "copying",
      }),
    }),
    /journal identity is inconsistent/iu,
  );
  await lstat(journal.migrationRoot);
});

test("restart active-work probe returns the exact non-terminal attempt and rejects ambiguity", async (context) => {
  const fixture = await createFixture();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  await initialize(fixture);
  assert.equal(
    await readWorkspaceActiveProduction(fixture.sourceWorkspaceRoot),
    null,
  );

  const writeAttempt = async (attemptId: string) => {
    const attemptRoot = join(
      fixture.sourceWorkspaceRoot,
      ".rsp/attempts/story-example",
      attemptId,
    );
    await mkdir(join(attemptRoot, "events"), { recursive: true });
    await writeFile(
      join(attemptRoot, "attempt.json"),
      `${JSON.stringify({
        schemaVersion: 4,
        contractVersion: "execution-attempt-v4",
        attemptId,
        storyId: "story-example",
        revisionId: `revision-${"1".repeat(64)}`,
        planFingerprint: `sha256:${"2".repeat(64)}`,
        artifactSetFingerprint: `sha256:${"3".repeat(64)}`,
        taskExplanations: [],
        taskSnapshots: [],
        estimatedCost: {
          providerRequests: 0,
          providerCacheHits: 0,
          agentTasks: 0,
          deliveryMedia: [],
        },
        actualCost: {
          providerRequests: 0,
          providerCacheHits: 0,
          agentTasks: 0,
          deliveryMedia: [],
        },
        state: "waiting-for-agent",
        createdAt: "2026-08-23T00:00:00.000Z",
        updatedAt: "2026-08-23T00:00:00.000Z",
        dirtyTaskRevisions: [],
        taskSummary: {
          reusedTaskCount: 0,
          dirtyAgentTaskCount: 0,
          dirtyFixedTaskCount: 0,
          blockedTaskCount: 0,
        },
        diagnosticCode: null,
      })}\n`,
    );
    return attemptRoot;
  };

  const attemptId = "f1a12320-0414-4964-87bd-5aefba473c69";
  const attemptRoot = await writeAttempt(attemptId);
  assert.deepEqual(
    await readWorkspaceActiveProduction(fixture.sourceWorkspaceRoot),
    {
      storyId: "story-example",
      kind: "production",
      attemptId,
      phase: "awaiting-task-terminals",
    },
  );
  assert.equal(
    await workspaceHasActiveProduction(fixture.sourceWorkspaceRoot),
    true,
  );

  await writeAttempt("38fd605f-3af8-4914-ae63-27473a80a50d");
  await assert.rejects(
    readWorkspaceActiveProduction(fixture.sourceWorkspaceRoot),
    /multiple active production attempts/iu,
  );
  await rm(
    join(
      fixture.sourceWorkspaceRoot,
      ".rsp/attempts/story-example/38fd605f-3af8-4914-ae63-27473a80a50d",
    ),
    { recursive: true },
  );
  await writeFile(
    join(attemptRoot, "events/000001-attempt-terminal.json"),
    `${JSON.stringify({
      schemaVersion: 4,
      contractVersion: "execution-attempt-event-v4",
      eventId: "09024fc1-6402-4fe0-a629-2528835907ce",
      eventKind: "attempt-terminal",
      recordedAt: "2026-08-23T00:01:00.000Z",
      attemptId,
      storyId: "story-example",
      revisionId: `revision-${"1".repeat(64)}`,
      taskOutcome: null,
      terminalResult: {
        status: "failed",
        sourceCurrentId: null,
        deliveryBuildId: null,
        diagnosticCode: "fixture-failure",
        deliveryMedia: [],
      },
    })}\n`,
  );
  assert.equal(
    await readWorkspaceActiveProduction(fixture.sourceWorkspaceRoot),
    null,
  );
});

test("Workspace migration gate detects delivery lock and build staging", async (context) => {
  const fixture = await createFixture();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  await initialize(fixture);
  const lockPath = join(
    fixture.sourceWorkspaceRoot,
    ".rsp/locks/.project-operation.lock",
  );
  await writeFile(lockPath, "{}\n", { mode: 0o600 });
  await chmod(lockPath, 0o600);
  assert.equal(
    await workspaceHasActiveProduction(fixture.sourceWorkspaceRoot),
    true,
  );
  await rm(lockPath);
  const buildRoot = join(
    fixture.sourceWorkspaceRoot,
    "deliveries/.staging/project-production/story-example/build-one",
  );
  await mkdir(buildRoot, { recursive: true });
  assert.equal(
    await workspaceHasActiveProduction(fixture.sourceWorkspaceRoot),
    true,
  );
});

test("Workspace operation lock roots reject symlink traversal without touching outside data", async (context) => {
  const fixture = await createFixture();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  await initialize(fixture);
  const outsideLocks = join(fixture.root, "outside-locks");
  await mkdir(outsideLocks);
  const sentinel = join(outsideLocks, "sentinel.txt");
  await writeFile(sentinel, "outside\n");
  const locksRoot = join(fixture.sourceWorkspaceRoot, ".rsp/locks");
  await rm(locksRoot, { recursive: true });
  await symlink(outsideLocks, locksRoot);
  await assert.rejects(
    workspaceHasActiveProduction(fixture.sourceWorkspaceRoot),
    /real directory/iu,
  );
  await assert.rejects(
    acquireRepositoryOperationLock({
      rootDir: locksRoot,
      ownerId: "workspace-migration-test",
    }),
    /canonical/iu,
  );
  assert.equal(await readFile(sentinel, "utf8"), "outside\n");
  await assert.rejects(
    lstat(join(outsideLocks, ".project-operation.lock")),
    /ENOENT/u,
  );
});

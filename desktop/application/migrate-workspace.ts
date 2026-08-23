import { randomUUID } from "node:crypto";
import { chmod, lstat, readFile, realpath } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

import {
  createWorkspaceMigrationJournal,
  moveWorkspaceMigrationPath,
  readWorkspaceMigrationJournal,
  removeWorkspaceMigrationJournal,
  writeWorkspaceMigrationJournal,
} from "../adapters/workspace-migration-filesystem";
import {
  MANAGED_FILES_LEDGER_PATH,
  WORKSPACE_MANIFEST_PATH,
  assertWorkspaceManagedPath,
  availableWorkspaceBytes,
  checksumWorkspaceBytes,
  copyWorkspaceTree,
  createWorkspaceDirectories,
  inspectManagedFile,
  inspectWorkspaceDirectories,
  inspectWorkspaceTree,
  loadManagedIntegration,
  removeLegacyManagedFile,
  removeWorkspaceMigrationPath,
  replaceManagedFile,
  serializeWorkspaceJson,
  validateWorkspaceRoot,
  workspaceTreeSizeBytes,
  writeWorkspaceFileAtomic,
  type ManagedIntegrationFile,
  type ManagedRspExecutable,
  type WorkspaceTreeFileCopier,
} from "../adapters/workspace-filesystem";
import {
  DESKTOP_INTEGRATION_VERSION,
  DESKTOP_MANAGED_FILES_CONTRACT_VERSION,
  LEGACY_DESKTOP_MANAGED_FILE_PATHS,
  LegacyManagedFilesLedgerSchema,
  LegacyWorkspaceV1ManifestSchema,
  ManagedFilesLedgerSchema,
  WorkspaceManifestSchema,
  WorkspaceMigrationRecordSchema,
  createWorkspaceManifest,
  type LegacyManagedFilesLedger,
  type LegacyWorkspaceV1Manifest,
  type ManagedFilesLedger,
  type WorkspaceManifest,
  type WorkspaceMigrationRecord,
} from "../contracts/workspace";

export type WorkspaceActiveWorkProbe = (
  workspaceRoot: string,
) => Promise<boolean>;

export type WorkspacePreferenceSwitcher = (request: {
  readonly expectedWorkspaceRoot: string;
  readonly nextWorkspaceRoot: string;
}) => Promise<void>;

export type WorkspacePreferenceReader = () => Promise<string>;

export type WorkspaceMigrationRecoveryWriter = (request: {
  readonly migrationId: string;
  readonly parentRoot: string;
  readonly migrationRoot: string;
  readonly sourceWorkspaceRoot: string;
  readonly targetWorkspaceRoot: string;
}) => Promise<void>;

export type WorkspaceMigrationRecoveryRemover = (
  migrationId: string,
) => Promise<void>;

export type PendingWorkspaceRootMigration = Readonly<{
  migrationId: string;
  parentRoot: string;
  migrationRoot: string;
  sourceWorkspaceRoot: string;
  targetWorkspaceRoot: string;
  manifest: WorkspaceManifest;
}>;

export class WorkspaceMigrationAuthorityError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "WorkspaceMigrationAuthorityError";
  }
}

const MIGRATION_COPY_EXCLUDED_TOP_LEVEL_PATHS = [".producer-runs"] as const;

type MigrationFileSystemOverrides = Readonly<{
  availableBytes?: (parentRoot: string) => Promise<number>;
  copyFile?: WorkspaceTreeFileCopier;
}>;

const readOwnerOnlyJson = async ({
  workspaceRoot,
  relativePath,
  label,
}: {
  readonly workspaceRoot: string;
  readonly relativePath: string;
  readonly label: string;
}) => {
  const path = await assertWorkspaceManagedPath({
    workspaceRoot,
    relativePath,
    kind: "file",
    allowMissing: false,
  });
  const metadata = await lstat(path);
  if (
    metadata.isSymbolicLink() ||
    !metadata.isFile() ||
    (metadata.mode & 0o777) !== 0o600
  ) {
    throw new Error(`${label} must be an owner-only regular file.`);
  }
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    throw new Error(`${label} is malformed.`, { cause: error });
  }
};

const createV2Ledger = ({
  workspaceId,
  files,
  state = "ready",
}: {
  readonly workspaceId: string;
  readonly files: readonly ManagedIntegrationFile[];
  readonly state?: ManagedFilesLedger["state"];
}) =>
  ManagedFilesLedgerSchema.parse({
    schemaVersion: 2,
    contractVersion: DESKTOP_MANAGED_FILES_CONTRACT_VERSION,
    integrationVersion: DESKTOP_INTEGRATION_VERSION,
    workspaceId,
    state,
    files: files.map((file) => ({
      path: file.relativePath,
      mode: file.mode,
      sha256: file.sha256,
    })),
  });

const writeControlFile = async ({
  workspaceRoot,
  relativePath,
  value,
}: {
  readonly workspaceRoot: string;
  readonly relativePath:
    | typeof WORKSPACE_MANIFEST_PATH
    | typeof MANAGED_FILES_LEDGER_PATH;
  readonly value: unknown;
}) => {
  const destination = await assertWorkspaceManagedPath({
    workspaceRoot,
    relativePath,
    kind: "file",
  });
  await writeWorkspaceFileAtomic({
    destination,
    bytes: Buffer.from(serializeWorkspaceJson(value), "utf8"),
    mode: 0o600,
    replace: true,
  });
  await chmod(destination, 0o600);
};

const assertV2LedgerMatchesFiles = ({
  ledger,
  files,
}: {
  readonly ledger: ManagedFilesLedger;
  readonly files: readonly ManagedIntegrationFile[];
}) => {
  const expected = createV2Ledger({
    workspaceId: ledger.workspaceId,
    files,
    state: ledger.state,
  });
  if (serializeWorkspaceJson(ledger) !== serializeWorkspaceJson(expected)) {
    throw new Error("Managed files ledger does not match integration v2.");
  }
};

export const verifyWorkspaceV2 = async ({
  workspaceRoot,
  files,
}: {
  readonly workspaceRoot: string;
  readonly files: readonly ManagedIntegrationFile[];
}): Promise<WorkspaceManifest> => {
  const [manifest, ledger, directoriesCurrent] = await Promise.all([
    readOwnerOnlyJson({
      workspaceRoot,
      relativePath: WORKSPACE_MANIFEST_PATH,
      label: "Workspace manifest",
    }).then((value) => WorkspaceManifestSchema.parse(value)),
    readOwnerOnlyJson({
      workspaceRoot,
      relativePath: MANAGED_FILES_LEDGER_PATH,
      label: "Managed files ledger",
    }).then((value) => ManagedFilesLedgerSchema.parse(value)),
    inspectWorkspaceDirectories(workspaceRoot),
  ]);
  if (manifest.workspaceId !== ledger.workspaceId) {
    throw new Error("Workspace manifest and managed files ledger disagree.");
  }
  if (ledger.state !== "ready" || !directoriesCurrent) {
    throw new Error("Workspace v2 managed state is incomplete.");
  }
  assertV2LedgerMatchesFiles({ ledger, files });
  for (const file of files) {
    const inspection = await inspectManagedFile({ workspaceRoot, file });
    if (inspection.state !== "current") {
      throw new Error(
        `Managed Workspace file is missing: ${file.relativePath}.`,
      );
    }
  }
  return manifest;
};

const readAndVerifyLegacyWorkspace = async ({
  workspaceRoot,
}: {
  readonly workspaceRoot: string;
}): Promise<{
  readonly manifest: LegacyWorkspaceV1Manifest;
  readonly ledger: LegacyManagedFilesLedger;
}> => {
  const [manifest, ledger] = await Promise.all([
    readOwnerOnlyJson({
      workspaceRoot,
      relativePath: WORKSPACE_MANIFEST_PATH,
      label: "Legacy Workspace manifest",
    }).then((value) => LegacyWorkspaceV1ManifestSchema.parse(value)),
    readOwnerOnlyJson({
      workspaceRoot,
      relativePath: MANAGED_FILES_LEDGER_PATH,
      label: "Legacy managed files ledger",
    }).then((value) => LegacyManagedFilesLedgerSchema.parse(value)),
  ]);
  if (manifest.workspaceId !== ledger.workspaceId || ledger.state !== "ready") {
    throw new Error("Legacy Workspace managed state is incomplete.");
  }
  if (
    JSON.stringify(ledger.files.map((file) => file.path)) !==
    JSON.stringify(LEGACY_DESKTOP_MANAGED_FILE_PATHS)
  ) {
    throw new Error("Legacy managed files ledger has an invalid file set.");
  }
  for (const record of ledger.files) {
    const path = await assertWorkspaceManagedPath({
      workspaceRoot,
      relativePath: record.path,
      kind: "file",
      allowMissing: false,
    });
    const metadata = await lstat(path);
    if (
      metadata.isSymbolicLink() ||
      !metadata.isFile() ||
      (metadata.mode & 0o777) !== record.mode ||
      checksumWorkspaceBytes(await readFile(path)) !== record.sha256
    ) {
      throw new Error(`Legacy managed Workspace file drifted: ${record.path}.`);
    }
  }
  return { manifest, ledger };
};

export const inspectManagedIntegrationUpdate = async ({
  workspaceRoot,
  files,
}: {
  readonly workspaceRoot: string;
  readonly files: readonly ManagedIntegrationFile[];
}): Promise<{
  readonly manifest: WorkspaceManifest;
  readonly ledger: ManagedFilesLedger;
  readonly updateRequired: boolean;
}> => {
  const [manifest, ledger] = await Promise.all([
    readOwnerOnlyJson({
      workspaceRoot,
      relativePath: WORKSPACE_MANIFEST_PATH,
      label: "Workspace manifest",
    }).then((value) => WorkspaceManifestSchema.parse(value)),
    readOwnerOnlyJson({
      workspaceRoot,
      relativePath: MANAGED_FILES_LEDGER_PATH,
      label: "Managed files ledger",
    }).then((value) => ManagedFilesLedgerSchema.parse(value)),
  ]);
  if (manifest.workspaceId !== ledger.workspaceId) {
    throw new Error("Workspace manifest and managed files ledger disagree.");
  }
  if (
    JSON.stringify(ledger.files.map(({ path }) => path)) !==
    JSON.stringify(files.map(({ relativePath }) => relativePath))
  ) {
    throw new Error("Managed Workspace file set is invalid.");
  }
  if (ledger.state === "initializing") {
    return { manifest, ledger, updateRequired: false };
  }
  for (const record of ledger.files) {
    let destination: string;
    try {
      destination = await assertWorkspaceManagedPath({
        workspaceRoot,
        relativePath: record.path,
        kind: "file",
        allowMissing: false,
      });
    } catch (error) {
      throw new Error(
        "Ready Workspace managed state is incomplete or drifted.",
        {
          cause: error,
        },
      );
    }
    const metadata = await lstat(destination);
    if (
      metadata.isSymbolicLink() ||
      !metadata.isFile() ||
      (metadata.mode & 0o777) !== record.mode ||
      checksumWorkspaceBytes(await readFile(destination)) !== record.sha256
    ) {
      throw new Error(`Managed Workspace file drifted: ${record.path}.`);
    }
  }
  const expected = createV2Ledger({
    workspaceId: manifest.workspaceId,
    files,
    state: ledger.state,
  });
  return {
    manifest,
    ledger,
    updateRequired:
      serializeWorkspaceJson(expected) !== serializeWorkspaceJson(ledger),
  };
};

const assertInactive = async ({
  workspaceRoot,
  activeWork,
}: {
  readonly workspaceRoot: string;
  readonly activeWork: WorkspaceActiveWorkProbe;
}) => {
  if (await activeWork(workspaceRoot)) {
    throw new Error("Workspace migration is blocked by active work.");
  }
};

const assertCopySpace = async ({
  parentRoot,
  requiredBytes,
  availableBytes,
}: {
  readonly parentRoot: string;
  readonly requiredBytes: number;
  readonly availableBytes: (parentRoot: string) => Promise<number>;
}) => {
  if ((await availableBytes(parentRoot)) < requiredBytes) {
    throw new Error("Workspace migration has insufficient free space.");
  }
};

const isSameOrContained = (parent: string, candidate: string) => {
  const result = relative(parent, candidate);
  return result === "" || (!result.startsWith(`..${sep}`) && result !== "..");
};

const assertMigrationTargetAvailable = async ({
  sourceRoot,
  targetRoot,
}: {
  readonly sourceRoot: string;
  readonly targetRoot: string;
}) => {
  if (
    isSameOrContained(sourceRoot, targetRoot) ||
    isSameOrContained(targetRoot, sourceRoot)
  ) {
    throw new Error("Workspace migration roots must not overlap.");
  }
  const targetParent = dirname(targetRoot);
  const parentMetadata = await lstat(targetParent);
  if (
    parentMetadata.isSymbolicLink() ||
    !parentMetadata.isDirectory() ||
    (await realpath(targetParent)) !== targetParent
  ) {
    throw new Error("Workspace migration target parent must be canonical.");
  }
  const targetExists = await lstat(targetRoot).then(
    () => true,
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return false;
      throw error;
    },
  );
  if (targetExists) {
    throw new Error("Workspace migration target already exists.");
  }
};

const createRecord = ({
  migrationId,
  kind,
  workspaceId,
  sourceRoot,
  targetRoot,
  stagingRoot,
  preservedRoot,
  state,
}: {
  readonly migrationId: string;
  readonly kind: WorkspaceMigrationRecord["kind"];
  readonly workspaceId: string;
  readonly sourceRoot: string;
  readonly targetRoot: string;
  readonly stagingRoot: string;
  readonly preservedRoot: string | null;
  readonly state: WorkspaceMigrationRecord["state"];
}) =>
  WorkspaceMigrationRecordSchema.parse({
    schemaVersion: 1,
    contractVersion: "desktop-workspace-migration-v1",
    migrationId,
    kind,
    workspaceId,
    sourceLeafName: basename(sourceRoot),
    targetLeafName: basename(targetRoot),
    stagingLeafName: basename(stagingRoot),
    preservedLeafName: preservedRoot === null ? null : basename(preservedRoot),
    state,
  });

const prepareV2WorkspaceCopy = async ({
  workspaceRoot,
  manifest,
  files,
  removeLegacyClient = false,
}: {
  readonly workspaceRoot: string;
  readonly manifest: WorkspaceManifest;
  readonly files: readonly ManagedIntegrationFile[];
  readonly removeLegacyClient?: boolean;
}) => {
  if (removeLegacyClient) {
    await removeLegacyManagedFile({
      workspaceRoot,
      relativePath: ".rsp/lib/rsp-client.cjs",
    });
  }
  await createWorkspaceDirectories(workspaceRoot);
  await writeControlFile({
    workspaceRoot,
    relativePath: WORKSPACE_MANIFEST_PATH,
    value: manifest,
  });
  await writeControlFile({
    workspaceRoot,
    relativePath: MANAGED_FILES_LEDGER_PATH,
    value: createV2Ledger({
      workspaceId: manifest.workspaceId,
      files,
      state: "initializing",
    }),
  });
  for (const file of files) {
    await replaceManagedFile({ workspaceRoot, file });
  }
  await writeControlFile({
    workspaceRoot,
    relativePath: MANAGED_FILES_LEDGER_PATH,
    value: createV2Ledger({ workspaceId: manifest.workspaceId, files }),
  });
  await verifyWorkspaceV2({ workspaceRoot, files });
};

export const migrateLegacyWorkspaceV1 = async ({
  workspaceRoot: rawWorkspaceRoot,
  integrationResourcesRoot,
  rspExecutable,
  activeWork,
  fileSystem = {},
}: {
  readonly workspaceRoot: string;
  readonly integrationResourcesRoot: string;
  readonly rspExecutable: ManagedRspExecutable;
  readonly activeWork: WorkspaceActiveWorkProbe;
  readonly fileSystem?: MigrationFileSystemOverrides;
}): Promise<{
  readonly manifest: WorkspaceManifest;
  readonly preservedWorkspaceRoot: string;
}> => {
  const workspaceRoot = resolve(rawWorkspaceRoot);
  const parentRoot = dirname(workspaceRoot);
  await assertInactive({ workspaceRoot, activeWork });
  const [{ manifest: legacyManifest }, files, sourceEntries] =
    await Promise.all([
      readAndVerifyLegacyWorkspace({ workspaceRoot }),
      loadManagedIntegration({ integrationResourcesRoot, rspExecutable }),
      inspectWorkspaceTree(workspaceRoot, {
        excludedTopLevelPaths: MIGRATION_COPY_EXCLUDED_TOP_LEVEL_PATHS,
      }),
    ]);
  await assertCopySpace({
    parentRoot,
    requiredBytes: workspaceTreeSizeBytes(sourceEntries),
    availableBytes: fileSystem.availableBytes ?? availableWorkspaceBytes,
  });

  const migrationId = randomUUID();
  const stagingRoot = join(
    parentRoot,
    `.axmorf-workspace-staging-${migrationId}`,
  );
  const preservedWorkspaceRoot = join(
    parentRoot,
    `.axmorf-workspace-preserved-${migrationId}`,
  );
  const journal = await createWorkspaceMigrationJournal({
    parentRoot,
    migrationId,
  });
  let record = createRecord({
    migrationId,
    kind: "workspace-v1-to-v2",
    workspaceId: legacyManifest.workspaceId,
    sourceRoot: workspaceRoot,
    targetRoot: workspaceRoot,
    stagingRoot,
    preservedRoot: preservedWorkspaceRoot,
    state: "copying",
  });
  await writeWorkspaceMigrationJournal({
    parentRoot,
    migrationRoot: journal.migrationRoot,
    record,
  });

  let sourcePreserved = false;
  try {
    await copyWorkspaceTree({
      sourceRoot: workspaceRoot,
      destinationRoot: stagingRoot,
      sourceEntries,
      copyFile: fileSystem.copyFile,
    });
    const manifest = createWorkspaceManifest(legacyManifest.workspaceId);
    await prepareV2WorkspaceCopy({
      workspaceRoot: stagingRoot,
      manifest,
      files,
      removeLegacyClient: true,
    });
    record = { ...record, state: "validated" };
    await writeWorkspaceMigrationJournal({
      parentRoot,
      migrationRoot: journal.migrationRoot,
      record,
    });
    await moveWorkspaceMigrationPath({
      parentRoot,
      sourceRoot: workspaceRoot,
      destinationRoot: preservedWorkspaceRoot,
    });
    sourcePreserved = true;
    record = { ...record, state: "source-preserved" };
    await writeWorkspaceMigrationJournal({
      parentRoot,
      migrationRoot: journal.migrationRoot,
      record,
    });
    await moveWorkspaceMigrationPath({
      parentRoot,
      sourceRoot: stagingRoot,
      destinationRoot: workspaceRoot,
    });
    await verifyWorkspaceV2({ workspaceRoot, files });
    record = { ...record, state: "target-ready" };
    await writeWorkspaceMigrationJournal({
      parentRoot,
      migrationRoot: journal.migrationRoot,
      record,
    });
    await removeWorkspaceMigrationJournal({
      parentRoot,
      migrationRoot: journal.migrationRoot,
    });
    return { manifest, preservedWorkspaceRoot };
  } catch (error) {
    if (sourcePreserved) {
      const sourceExists = await lstat(workspaceRoot).then(
        () => true,
        (cause: NodeJS.ErrnoException) => {
          if (cause.code === "ENOENT") return false;
          throw cause;
        },
      );
      if (sourceExists) {
        await moveWorkspaceMigrationPath({
          parentRoot,
          sourceRoot: workspaceRoot,
          destinationRoot: stagingRoot,
        });
      }
      await moveWorkspaceMigrationPath({
        parentRoot,
        sourceRoot: preservedWorkspaceRoot,
        destinationRoot: workspaceRoot,
      });
      sourcePreserved = false;
    }
    await removeWorkspaceMigrationPath({
      parentRoot,
      migrationPath: stagingRoot,
      migrationId,
    });
    await removeWorkspaceMigrationJournal({
      parentRoot,
      migrationRoot: journal.migrationRoot,
    });
    throw error;
  }
};

export const updateManagedWorkspaceIntegration = async ({
  workspaceRoot: rawWorkspaceRoot,
  integrationResourcesRoot,
  rspExecutable,
  activeWork,
  fileSystem = {},
}: {
  readonly workspaceRoot: string;
  readonly integrationResourcesRoot: string;
  readonly rspExecutable: ManagedRspExecutable;
  readonly activeWork: WorkspaceActiveWorkProbe;
  readonly fileSystem?: MigrationFileSystemOverrides;
}): Promise<{
  readonly manifest: WorkspaceManifest;
  readonly updated: boolean;
  readonly preservedWorkspaceRoot: string | null;
}> => {
  const workspaceRoot = resolve(rawWorkspaceRoot);
  const parentRoot = dirname(workspaceRoot);
  const files = await loadManagedIntegration({
    integrationResourcesRoot,
    rspExecutable,
  });
  const inspected = await inspectManagedIntegrationUpdate({
    workspaceRoot,
    files,
  });
  if (!inspected.updateRequired) {
    return {
      manifest: inspected.manifest,
      updated: false,
      preservedWorkspaceRoot: null,
    };
  }
  await assertInactive({ workspaceRoot, activeWork });
  const sourceEntries = await inspectWorkspaceTree(workspaceRoot, {
    excludedTopLevelPaths: MIGRATION_COPY_EXCLUDED_TOP_LEVEL_PATHS,
  });
  await assertCopySpace({
    parentRoot,
    requiredBytes: workspaceTreeSizeBytes(sourceEntries),
    availableBytes: fileSystem.availableBytes ?? availableWorkspaceBytes,
  });
  const migrationId = randomUUID();
  const stagingRoot = join(
    parentRoot,
    `.axmorf-workspace-staging-${migrationId}`,
  );
  const preservedWorkspaceRoot = join(
    parentRoot,
    `.axmorf-workspace-preserved-${migrationId}`,
  );
  const journal = await createWorkspaceMigrationJournal({
    parentRoot,
    migrationId,
  });
  let record = createRecord({
    migrationId,
    kind: "managed-integration-update",
    workspaceId: inspected.manifest.workspaceId,
    sourceRoot: workspaceRoot,
    targetRoot: workspaceRoot,
    stagingRoot,
    preservedRoot: preservedWorkspaceRoot,
    state: "copying",
  });
  await writeWorkspaceMigrationJournal({
    parentRoot,
    migrationRoot: journal.migrationRoot,
    record,
  });
  let sourcePreserved = false;
  try {
    await copyWorkspaceTree({
      sourceRoot: workspaceRoot,
      destinationRoot: stagingRoot,
      sourceEntries,
      copyFile: fileSystem.copyFile,
    });
    await prepareV2WorkspaceCopy({
      workspaceRoot: stagingRoot,
      manifest: inspected.manifest,
      files,
    });
    record = { ...record, state: "validated" };
    await writeWorkspaceMigrationJournal({
      parentRoot,
      migrationRoot: journal.migrationRoot,
      record,
    });
    await moveWorkspaceMigrationPath({
      parentRoot,
      sourceRoot: workspaceRoot,
      destinationRoot: preservedWorkspaceRoot,
    });
    sourcePreserved = true;
    record = { ...record, state: "source-preserved" };
    await writeWorkspaceMigrationJournal({
      parentRoot,
      migrationRoot: journal.migrationRoot,
      record,
    });
    await moveWorkspaceMigrationPath({
      parentRoot,
      sourceRoot: stagingRoot,
      destinationRoot: workspaceRoot,
    });
    await verifyWorkspaceV2({ workspaceRoot, files });
    record = { ...record, state: "target-ready" };
    await writeWorkspaceMigrationJournal({
      parentRoot,
      migrationRoot: journal.migrationRoot,
      record,
    });
    await removeWorkspaceMigrationJournal({
      parentRoot,
      migrationRoot: journal.migrationRoot,
    });
    return {
      manifest: inspected.manifest,
      updated: true,
      preservedWorkspaceRoot,
    };
  } catch (error) {
    if (sourcePreserved) {
      const sourceExists = await lstat(workspaceRoot).then(
        () => true,
        (cause: NodeJS.ErrnoException) => {
          if (cause.code === "ENOENT") return false;
          throw cause;
        },
      );
      if (sourceExists) {
        await moveWorkspaceMigrationPath({
          parentRoot,
          sourceRoot: workspaceRoot,
          destinationRoot: stagingRoot,
        });
      }
      await moveWorkspaceMigrationPath({
        parentRoot,
        sourceRoot: preservedWorkspaceRoot,
        destinationRoot: workspaceRoot,
      });
    }
    await removeWorkspaceMigrationPath({
      parentRoot,
      migrationPath: stagingRoot,
      migrationId,
    });
    await removeWorkspaceMigrationJournal({
      parentRoot,
      migrationRoot: journal.migrationRoot,
    });
    throw error;
  }
};

export const migrateWorkspaceRoot = async ({
  sourceWorkspaceRoot: rawSourceRoot,
  targetWorkspaceRoot: rawTargetRoot,
  integrationResourcesRoot,
  rspExecutable,
  activeWork,
  homeDirectory,
  forbiddenRoots,
  readPreference,
  switchPreference,
  writeRecovery,
  removeRecovery,
  fileSystem = {},
}: {
  readonly sourceWorkspaceRoot: string;
  readonly targetWorkspaceRoot: string;
  readonly integrationResourcesRoot: string;
  readonly rspExecutable: ManagedRspExecutable;
  readonly activeWork: WorkspaceActiveWorkProbe;
  readonly homeDirectory: string;
  readonly forbiddenRoots: readonly string[];
  readonly readPreference: WorkspacePreferenceReader;
  readonly switchPreference: WorkspacePreferenceSwitcher;
  readonly writeRecovery: WorkspaceMigrationRecoveryWriter;
  readonly removeRecovery: WorkspaceMigrationRecoveryRemover;
  readonly fileSystem?: MigrationFileSystemOverrides;
}): Promise<{
  readonly manifest: WorkspaceManifest;
  readonly pending: PendingWorkspaceRootMigration | null;
}> => {
  const sourceWorkspaceRoot = resolve(rawSourceRoot);
  const targetWorkspaceRoot = resolve(rawTargetRoot);
  if (sourceWorkspaceRoot === targetWorkspaceRoot) {
    const files = await loadManagedIntegration({
      integrationResourcesRoot,
      rspExecutable,
    });
    return {
      manifest: await verifyWorkspaceV2({
        workspaceRoot: sourceWorkspaceRoot,
        files,
      }),
      pending: null,
    };
  }
  await assertInactive({ workspaceRoot: sourceWorkspaceRoot, activeWork });
  const validatedTarget = await validateWorkspaceRoot({
    workspaceRoot: targetWorkspaceRoot,
    homeDirectory,
    forbiddenRoots,
  });
  if (
    validatedTarget.exists ||
    validatedTarget.workspaceRoot !== targetWorkspaceRoot
  ) {
    throw new Error(
      "Workspace migration target already exists or is not canonical.",
    );
  }
  await assertMigrationTargetAvailable({
    sourceRoot: sourceWorkspaceRoot,
    targetRoot: targetWorkspaceRoot,
  });
  const files = await loadManagedIntegration({
    integrationResourcesRoot,
    rspExecutable,
  });
  const manifest = await verifyWorkspaceV2({
    workspaceRoot: sourceWorkspaceRoot,
    files,
  });
  const targetParent = dirname(targetWorkspaceRoot);
  const sourceEntries = await inspectWorkspaceTree(sourceWorkspaceRoot, {
    excludedTopLevelPaths: MIGRATION_COPY_EXCLUDED_TOP_LEVEL_PATHS,
  });
  await assertCopySpace({
    parentRoot: targetParent,
    requiredBytes: workspaceTreeSizeBytes(sourceEntries),
    availableBytes: fileSystem.availableBytes ?? availableWorkspaceBytes,
  });
  const migrationId = randomUUID();
  const stagingRoot = join(
    targetParent,
    `.axmorf-workspace-staging-${migrationId}`,
  );
  const journal = await createWorkspaceMigrationJournal({
    parentRoot: targetParent,
    migrationId,
  });
  let record = createRecord({
    migrationId,
    kind: "workspace-root-move",
    workspaceId: manifest.workspaceId,
    sourceRoot: sourceWorkspaceRoot,
    targetRoot: targetWorkspaceRoot,
    stagingRoot,
    preservedRoot: null,
    state: "copying",
  });
  await writeWorkspaceMigrationJournal({
    parentRoot: targetParent,
    migrationRoot: journal.migrationRoot,
    record,
  });
  let promoted = false;
  let recoveryWritten = false;
  try {
    await writeRecovery({
      migrationId,
      parentRoot: targetParent,
      migrationRoot: journal.migrationRoot,
      sourceWorkspaceRoot,
      targetWorkspaceRoot,
    });
    recoveryWritten = true;
    await copyWorkspaceTree({
      sourceRoot: sourceWorkspaceRoot,
      destinationRoot: stagingRoot,
      sourceEntries,
      copyFile: fileSystem.copyFile,
    });
    await verifyWorkspaceV2({ workspaceRoot: stagingRoot, files });
    record = { ...record, state: "validated" };
    await writeWorkspaceMigrationJournal({
      parentRoot: targetParent,
      migrationRoot: journal.migrationRoot,
      record,
    });
    await moveWorkspaceMigrationPath({
      parentRoot: targetParent,
      sourceRoot: stagingRoot,
      destinationRoot: targetWorkspaceRoot,
    });
    promoted = true;
    record = { ...record, state: "target-ready" };
    await writeWorkspaceMigrationJournal({
      parentRoot: targetParent,
      migrationRoot: journal.migrationRoot,
      record,
    });
    await switchPreference({
      expectedWorkspaceRoot: sourceWorkspaceRoot,
      nextWorkspaceRoot: targetWorkspaceRoot,
    });
    record = { ...record, state: "preference-switched" };
    await writeWorkspaceMigrationJournal({
      parentRoot: targetParent,
      migrationRoot: journal.migrationRoot,
      record,
    });
    return {
      manifest,
      pending: {
        migrationId,
        parentRoot: targetParent,
        migrationRoot: journal.migrationRoot,
        sourceWorkspaceRoot,
        targetWorkspaceRoot,
        manifest,
      },
    };
  } catch (error) {
    let currentPreference: string;
    try {
      currentPreference = resolve(await readPreference());
    } catch (preferenceError) {
      throw new WorkspaceMigrationAuthorityError(
        "Workspace migration authority could not be revalidated.",
        { cause: preferenceError },
      );
    }
    if (currentPreference === targetWorkspaceRoot) {
      return {
        manifest,
        pending: {
          migrationId,
          parentRoot: targetParent,
          migrationRoot: journal.migrationRoot,
          sourceWorkspaceRoot,
          targetWorkspaceRoot,
          manifest,
        },
      };
    }
    if (currentPreference !== sourceWorkspaceRoot) {
      throw new WorkspaceMigrationAuthorityError(
        "Workspace migration preference authority is ambiguous.",
        { cause: error },
      );
    }
    if (promoted) {
      await moveWorkspaceMigrationPath({
        parentRoot: targetParent,
        sourceRoot: targetWorkspaceRoot,
        destinationRoot: stagingRoot,
      });
    }
    await removeWorkspaceMigrationPath({
      parentRoot: targetParent,
      migrationPath: stagingRoot,
      migrationId,
    });
    if (recoveryWritten) await removeRecovery(migrationId);
    await removeWorkspaceMigrationJournal({
      parentRoot: targetParent,
      migrationRoot: journal.migrationRoot,
    });
    throw error;
  }
};

export const completeWorkspaceRootMigration = async ({
  pending,
  removeRecovery,
}: {
  readonly pending: PendingWorkspaceRootMigration;
  readonly removeRecovery: WorkspaceMigrationRecoveryRemover;
}) => {
  await removeRecovery(pending.migrationId);
  await removeWorkspaceMigrationJournal({
    parentRoot: pending.parentRoot,
    migrationRoot: pending.migrationRoot,
  });
};

export const rollbackWorkspaceRootMigration = async ({
  pending,
  readPreference,
  switchPreference,
  removeRecovery,
}: {
  readonly pending: PendingWorkspaceRootMigration;
  readonly readPreference: WorkspacePreferenceReader;
  readonly switchPreference: WorkspacePreferenceSwitcher;
  readonly removeRecovery: WorkspaceMigrationRecoveryRemover;
}) => {
  const record = await readWorkspaceMigrationJournal({
    parentRoot: pending.parentRoot,
    migrationRoot: pending.migrationRoot,
  });
  if (
    record.kind !== "workspace-root-move" ||
    record.migrationId !== pending.migrationId ||
    record.sourceLeafName !== basename(pending.sourceWorkspaceRoot) ||
    record.targetLeafName !== basename(pending.targetWorkspaceRoot)
  ) {
    throw new Error("Workspace migration rollback identity is inconsistent.");
  }
  let currentPreference = resolve(await readPreference());
  if (currentPreference === pending.targetWorkspaceRoot) {
    try {
      await switchPreference({
        expectedWorkspaceRoot: pending.targetWorkspaceRoot,
        nextWorkspaceRoot: pending.sourceWorkspaceRoot,
      });
    } catch (error) {
      currentPreference = resolve(await readPreference());
      if (currentPreference !== pending.sourceWorkspaceRoot) throw error;
    }
    currentPreference = resolve(await readPreference());
  }
  if (currentPreference !== pending.sourceWorkspaceRoot) {
    throw new Error("Workspace migration rollback authority is ambiguous.");
  }
  const targetExists = await lstat(pending.targetWorkspaceRoot).then(
    () => true,
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return false;
      throw error;
    },
  );
  const stagingRoot = join(
    pending.parentRoot,
    `.axmorf-workspace-staging-${pending.migrationId}`,
  );
  if (targetExists) {
    await moveWorkspaceMigrationPath({
      parentRoot: pending.parentRoot,
      sourceRoot: pending.targetWorkspaceRoot,
      destinationRoot: stagingRoot,
    });
  }
  await removeWorkspaceMigrationPath({
    parentRoot: pending.parentRoot,
    migrationPath: stagingRoot,
    migrationId: pending.migrationId,
  });
  await removeRecovery(pending.migrationId);
  await removeWorkspaceMigrationJournal({
    parentRoot: pending.parentRoot,
    migrationRoot: pending.migrationRoot,
  });
};

export const recoverWorkspaceMigration = async ({
  parentRoot: rawParentRoot,
  migrationRoot,
  sourceWorkspaceRoot: rawSourceWorkspaceRoot,
  targetWorkspaceRoot: rawTargetWorkspaceRoot,
  integrationResourcesRoot,
  rspExecutable,
  readPreference,
  switchPreference,
  clearRecovery,
}: {
  readonly parentRoot: string;
  readonly migrationRoot: string;
  readonly sourceWorkspaceRoot?: string;
  readonly targetWorkspaceRoot: string;
  readonly integrationResourcesRoot: string;
  readonly rspExecutable: ManagedRspExecutable;
  readonly readPreference: WorkspacePreferenceReader;
  readonly switchPreference: WorkspacePreferenceSwitcher;
  readonly clearRecovery: WorkspaceMigrationRecoveryRemover;
}): Promise<"completed" | "rolled-back"> => {
  const parentRoot = resolve(rawParentRoot);
  const record = await readWorkspaceMigrationJournal({
    parentRoot,
    migrationRoot,
  });
  const sourceRoot =
    rawSourceWorkspaceRoot === undefined
      ? join(parentRoot, record.sourceLeafName)
      : resolve(rawSourceWorkspaceRoot);
  const targetRoot = join(parentRoot, record.targetLeafName);
  if (resolve(rawTargetWorkspaceRoot) !== targetRoot) {
    throw new Error("Workspace migration target identity is inconsistent.");
  }
  const stagingRoot = join(parentRoot, record.stagingLeafName);
  const preservedRoot =
    record.preservedLeafName === null
      ? null
      : join(parentRoot, record.preservedLeafName);
  const files = await loadManagedIntegration({
    integrationResourcesRoot,
    rspExecutable,
  });

  if (record.kind !== "workspace-root-move") {
    if (record.state === "source-preserved") {
      const sourceExists = await lstat(sourceRoot).then(
        () => true,
        (error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return false;
          throw error;
        },
      );
      if (!sourceExists) {
        await verifyWorkspaceV2({ workspaceRoot: stagingRoot, files });
        await moveWorkspaceMigrationPath({
          parentRoot,
          sourceRoot: stagingRoot,
          destinationRoot: sourceRoot,
        });
      }
      await verifyWorkspaceV2({ workspaceRoot: sourceRoot, files });
      await clearRecovery(record.migrationId);
      await removeWorkspaceMigrationJournal({ parentRoot, migrationRoot });
      return "completed";
    }
    if (record.state === "target-ready") {
      await verifyWorkspaceV2({ workspaceRoot: targetRoot, files });
      await clearRecovery(record.migrationId);
      await removeWorkspaceMigrationJournal({ parentRoot, migrationRoot });
      return "completed";
    }
    if (preservedRoot !== null) {
      const sourceExists = await lstat(sourceRoot).then(
        () => true,
        () => false,
      );
      const preservedExists = await lstat(preservedRoot).then(
        () => true,
        () => false,
      );
      if (!sourceExists && preservedExists) {
        await moveWorkspaceMigrationPath({
          parentRoot,
          sourceRoot: preservedRoot,
          destinationRoot: sourceRoot,
        });
      }
    }
    await removeWorkspaceMigrationPath({
      parentRoot,
      migrationPath: stagingRoot,
      migrationId: record.migrationId,
    });
    await clearRecovery(record.migrationId);
    await removeWorkspaceMigrationJournal({ parentRoot, migrationRoot });
    return "rolled-back";
  }

  const currentPreference = resolve(await readPreference());
  if (basename(sourceRoot) !== record.sourceLeafName) {
    throw new Error("Workspace migration source identity is inconsistent.");
  }
  if (
    record.state === "target-ready" ||
    record.state === "preference-switched"
  ) {
    await verifyWorkspaceV2({ workspaceRoot: targetRoot, files });
    if (currentPreference === sourceRoot) {
      await switchPreference({
        expectedWorkspaceRoot: sourceRoot,
        nextWorkspaceRoot: targetRoot,
      });
    } else if (currentPreference !== targetRoot) {
      throw new Error("Workspace migration preference authority is ambiguous.");
    }
    await clearRecovery(record.migrationId);
    await removeWorkspaceMigrationJournal({ parentRoot, migrationRoot });
    return "completed";
  }
  await removeWorkspaceMigrationPath({
    parentRoot,
    migrationPath: stagingRoot,
    migrationId: record.migrationId,
  });
  await clearRecovery(record.migrationId);
  await removeWorkspaceMigrationJournal({ parentRoot, migrationRoot });
  return "rolled-back";
};

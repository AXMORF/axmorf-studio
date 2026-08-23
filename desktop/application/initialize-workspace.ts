import { randomUUID } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";

import {
  MANAGED_FILES_LEDGER_PATH,
  WORKSPACE_MANIFEST_PATH,
  assertWorkspaceManagedPath,
  createWorkspaceDirectories,
  createWorkspaceStaging,
  checksumWorkspaceBytes,
  installManagedFile,
  inspectWorkspaceDirectories,
  loadManagedIntegration,
  promoteWorkspaceStaging,
  serializeWorkspaceJson,
  validateWorkspaceRoot,
  verifyWorkspaceFileMode,
  writeWorkspaceFileAtomic,
  type ManagedIntegrationFile,
  type ManagedRspExecutable,
} from "../adapters/workspace-filesystem";
import {
  migrateLegacyWorkspaceV1,
  updateManagedWorkspaceIntegration,
  type WorkspaceActiveWorkProbe,
} from "./migrate-workspace";
import {
  DESKTOP_INTEGRATION_VERSION,
  DESKTOP_MANAGED_FILES_CONTRACT_VERSION,
  ManagedFilesLedgerSchema,
  LegacyWorkspaceV1ManifestSchema,
  WorkspaceManifestSchema,
  createWorkspaceManifest,
  type ManagedFilesLedger,
  type WorkspaceManifest,
} from "../contracts/workspace";

type ExistingWorkspaceState = Readonly<{
  manifest: WorkspaceManifest | null;
  ledger: ManagedFilesLedger | null;
  directoriesCurrent: boolean;
  filesCurrent: boolean;
  existingManagedFileCount: number;
}>;

const readOptionalStrictJson = async ({
  workspaceRoot,
  relativePath,
  label,
}: {
  readonly workspaceRoot: string;
  readonly relativePath: string;
  readonly label: string;
}): Promise<unknown | null> => {
  const destination = await assertWorkspaceManagedPath({
    workspaceRoot,
    relativePath,
    kind: "file",
  });
  let metadata;
  try {
    metadata = await lstat(destination);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  if (
    metadata.isSymbolicLink() ||
    !metadata.isFile() ||
    (metadata.mode & 0o777) !== 0o600
  ) {
    throw new Error(`${label} must be an owner-only regular file.`);
  }
  try {
    return JSON.parse(await readFile(destination, "utf8"));
  } catch (error) {
    throw new Error(`${label} is malformed.`, { cause: error });
  }
};

const expectedLedger = ({
  workspaceId,
  files,
  state,
}: {
  readonly workspaceId: string;
  readonly files: readonly ManagedIntegrationFile[];
  readonly state: ManagedFilesLedger["state"];
}): ManagedFilesLedger =>
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

const assertLedgerMatchesIntegration = ({
  ledger,
  files,
}: {
  readonly ledger: ManagedFilesLedger;
  readonly files: readonly ManagedIntegrationFile[];
}) => {
  const expected = expectedLedger({
    workspaceId: ledger.workspaceId,
    files,
    state: ledger.state,
  });
  if (serializeWorkspaceJson(ledger) !== serializeWorkspaceJson(expected)) {
    throw new Error(
      "Managed files ledger does not match integration v2.",
    );
  }
};

const inspectExistingWorkspace = async ({
  workspaceRoot,
  files,
}: {
  readonly workspaceRoot: string;
  readonly files: readonly ManagedIntegrationFile[];
}): Promise<ExistingWorkspaceState> => {
  const directoriesCurrent = await inspectWorkspaceDirectories(workspaceRoot);
  const [rawManifest, rawLedger] = await Promise.all([
    readOptionalStrictJson({
      workspaceRoot,
      relativePath: WORKSPACE_MANIFEST_PATH,
      label: "Workspace manifest",
    }),
    readOptionalStrictJson({
      workspaceRoot,
      relativePath: MANAGED_FILES_LEDGER_PATH,
      label: "Managed files ledger",
    }),
  ]);
  const manifest =
    rawManifest === null ? null : WorkspaceManifestSchema.parse(rawManifest);
  const ledger =
    rawLedger === null ? null : ManagedFilesLedgerSchema.parse(rawLedger);
  if (
    manifest !== null &&
    ledger !== null &&
    manifest.workspaceId !== ledger.workspaceId
  ) {
    throw new Error("Workspace manifest and managed files ledger disagree.");
  }
  if (ledger !== null) assertLedgerMatchesIntegration({ ledger, files });

  let filesCurrent = true;
  let existingManagedFileCount = 0;
  for (const file of files) {
    const destination = await assertWorkspaceManagedPath({
      workspaceRoot,
      relativePath: file.relativePath,
      kind: "file",
    });
    let metadata;
    try {
      metadata = await lstat(destination);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        filesCurrent = false;
        continue;
      }
      throw error;
    }
    existingManagedFileCount += 1;
    if (
      metadata.isSymbolicLink() ||
      !metadata.isFile() ||
      (metadata.mode & 0o777) !== file.mode
    ) {
      throw new Error(`Managed Workspace file drifted: ${file.relativePath}.`);
    }
    const bytes = await readFile(destination);
    if (file.sha256 !== checksumWorkspaceBytes(bytes)) {
      throw new Error(`Managed Workspace file drifted: ${file.relativePath}.`);
    }
  }

  if (
    ledger?.state === "ready" &&
    (manifest === null || !directoriesCurrent || !filesCurrent)
  ) {
    throw new Error("Ready Workspace managed state is incomplete or drifted.");
  }
  if (manifest === null && ledger === null && existingManagedFileCount > 0) {
    throw new Error(
      "Existing files at managed paths do not belong to an initialized Workspace.",
    );
  }
  return {
    manifest,
    ledger,
    directoriesCurrent,
    filesCurrent,
    existingManagedFileCount,
  };
};

const writeWorkspaceControlFile = async ({
  workspaceRoot,
  relativePath,
  value,
  replace,
}: {
  readonly workspaceRoot: string;
  readonly relativePath:
    | typeof WORKSPACE_MANIFEST_PATH
    | typeof MANAGED_FILES_LEDGER_PATH;
  readonly value: unknown;
  readonly replace: boolean;
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
    replace,
  });
  await verifyWorkspaceFileMode({ path: destination, mode: 0o600 });
};

const populateWorkspace = async ({
  workspaceRoot,
  manifest,
  files,
}: {
  readonly workspaceRoot: string;
  readonly manifest: WorkspaceManifest;
  readonly files: readonly ManagedIntegrationFile[];
}) => {
  await createWorkspaceDirectories(workspaceRoot);
  await writeWorkspaceControlFile({
    workspaceRoot,
    relativePath: WORKSPACE_MANIFEST_PATH,
    value: manifest,
    replace: false,
  });
  await writeWorkspaceControlFile({
    workspaceRoot,
    relativePath: MANAGED_FILES_LEDGER_PATH,
    value: expectedLedger({
      workspaceId: manifest.workspaceId,
      files,
      state: "initializing",
    }),
    replace: false,
  });
  for (const file of files) {
    await installManagedFile({ workspaceRoot, file });
  }
  await writeWorkspaceControlFile({
    workspaceRoot,
    relativePath: MANAGED_FILES_LEDGER_PATH,
    value: expectedLedger({
      workspaceId: manifest.workspaceId,
      files,
      state: "ready",
    }),
    replace: true,
  });
};

const initializeFreshWorkspace = async ({
  workspaceRoot,
  parentRoot,
  manifest,
  files,
}: {
  readonly workspaceRoot: string;
  readonly parentRoot: string;
  readonly manifest: WorkspaceManifest;
  readonly files: readonly ManagedIntegrationFile[];
}) => {
  const staging = await createWorkspaceStaging(parentRoot);
  try {
    await populateWorkspace({
      workspaceRoot: staging.stagingRoot,
      manifest,
      files,
    });
    await promoteWorkspaceStaging({
      stagingRoot: staging.stagingRoot,
      workspaceRoot,
    });
  } finally {
    await staging.cleanup();
  }
};

const recoverExistingWorkspace = async ({
  workspaceRoot,
  manifest,
  ledger,
  files,
}: {
  readonly workspaceRoot: string;
  readonly manifest: WorkspaceManifest;
  readonly ledger: ManagedFilesLedger | null;
  readonly files: readonly ManagedIntegrationFile[];
}) => {
  await createWorkspaceDirectories(workspaceRoot);
  if (ledger === null) {
    await writeWorkspaceControlFile({
      workspaceRoot,
      relativePath: MANAGED_FILES_LEDGER_PATH,
      value: expectedLedger({
        workspaceId: manifest.workspaceId,
        files,
        state: "initializing",
      }),
      replace: false,
    });
  }
  const manifestPath = await assertWorkspaceManagedPath({
    workspaceRoot,
    relativePath: WORKSPACE_MANIFEST_PATH,
    kind: "file",
  });
  try {
    await lstat(manifestPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await writeWorkspaceControlFile({
      workspaceRoot,
      relativePath: WORKSPACE_MANIFEST_PATH,
      value: manifest,
      replace: false,
    });
  }
  for (const file of files) {
    await installManagedFile({ workspaceRoot, file });
  }
  await writeWorkspaceControlFile({
    workspaceRoot,
    relativePath: MANAGED_FILES_LEDGER_PATH,
    value: expectedLedger({
      workspaceId: manifest.workspaceId,
      files,
      state: "ready",
    }),
    replace: true,
  });
};

export const initializeWorkspace = async ({
  workspaceRoot: rawWorkspaceRoot,
  homeDirectory,
  integrationResourcesRoot,
  rspExecutable,
  forbiddenRoots,
  activeWork,
}: {
  readonly workspaceRoot: string;
  readonly homeDirectory: string;
  readonly integrationResourcesRoot: string;
  readonly rspExecutable: ManagedRspExecutable;
  readonly forbiddenRoots: readonly string[];
  readonly activeWork: WorkspaceActiveWorkProbe;
}): Promise<
  Readonly<{
    workspaceRoot: string;
    manifest: WorkspaceManifest;
    initialized: boolean;
  }>
> => {
  const [root, files] = await Promise.all([
    validateWorkspaceRoot({
      workspaceRoot: rawWorkspaceRoot,
      homeDirectory,
      forbiddenRoots,
    }),
    loadManagedIntegration({ integrationResourcesRoot, rspExecutable }),
  ]);

  if (!root.exists) {
    const manifest = createWorkspaceManifest(randomUUID());
    await initializeFreshWorkspace({
      workspaceRoot: root.workspaceRoot,
      parentRoot: root.parentRoot,
      manifest,
      files,
    });
    return { workspaceRoot: root.workspaceRoot, manifest, initialized: true };
  }

  const rawExistingManifest = await readOptionalStrictJson({
    workspaceRoot: root.workspaceRoot,
    relativePath: WORKSPACE_MANIFEST_PATH,
    label: "Workspace manifest",
  });
  if (
    rawExistingManifest !== null &&
    LegacyWorkspaceV1ManifestSchema.safeParse(rawExistingManifest).success
  ) {
    const migrated = await migrateLegacyWorkspaceV1({
      workspaceRoot: root.workspaceRoot,
      integrationResourcesRoot,
      rspExecutable,
      activeWork,
    });
    return {
      workspaceRoot: root.workspaceRoot,
      manifest: migrated.manifest,
      initialized: true,
    };
  }

  if (
    rawExistingManifest !== null &&
    WorkspaceManifestSchema.safeParse(rawExistingManifest).success
  ) {
    const integration = await updateManagedWorkspaceIntegration({
      workspaceRoot: root.workspaceRoot,
      integrationResourcesRoot,
      rspExecutable,
      activeWork,
    });
    if (integration.updated) {
      return {
        workspaceRoot: root.workspaceRoot,
        manifest: integration.manifest,
        initialized: true,
      };
    }
  }

  const existing = await inspectExistingWorkspace({
    workspaceRoot: root.workspaceRoot,
    files,
  });
  const workspaceId =
    existing.manifest?.workspaceId ??
    existing.ledger?.workspaceId ??
    randomUUID();
  const manifest = existing.manifest ?? createWorkspaceManifest(workspaceId);
  if (
    existing.manifest !== null &&
    existing.ledger?.state === "ready" &&
    existing.directoriesCurrent &&
    existing.filesCurrent
  ) {
    return { workspaceRoot: root.workspaceRoot, manifest, initialized: false };
  }
  await recoverExistingWorkspace({
    workspaceRoot: root.workspaceRoot,
    manifest,
    ledger: existing.ledger,
    files,
  });
  const verified = await inspectExistingWorkspace({
    workspaceRoot: root.workspaceRoot,
    files,
  });
  if (
    verified.manifest === null ||
    verified.ledger?.state !== "ready" ||
    !verified.directoriesCurrent ||
    !verified.filesCurrent
  ) {
    throw new Error("Workspace verification failed after initialization.");
  }
  return {
    workspaceRoot: root.workspaceRoot,
    manifest: verified.manifest,
    initialized: true,
  };
};

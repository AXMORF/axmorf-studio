import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  rmdir,
} from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

import {
  ProjectAssetManifestSchema,
  PexelsAcquisitionReceiptV1Schema,
  StoryIdSchema,
  buildProjectAssetManifest,
  serializeCanonicalJson,
} from "../../src/contracts";
import {
  generateWorkspaceProjectResourceCatalog,
  generateWorkspaceResourceCatalog,
} from "../catalog/generate";
import type { ProductionLocations } from "../project-production/application/production-locations";
import { acquireRepositoryOperationLock } from "../shared/repository-operation-lock";
import { adaptPexelsAcquisitionReceiptV1 } from "../project-assets/adapters/pexels-receipt";
import { inspectImageBytes } from "../project-assets/domain/image";
import {
  buildImportedImageDescriptor,
  createProjectExternalResourceId,
  type ProjectAssetRole,
} from "../project-assets/domain/model";
import { assertWorkspaceOwnedDirectoryChain } from "./workspace-owned-root";

const checksum = (bytes: Uint8Array) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}` as const;

const exact = (left: Uint8Array, right: Uint8Array) =>
  left.byteLength === right.byteLength &&
  left.every((value, index) => value === right[index]);

const state = async (path: string) => {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

const contained = (root: string, target: string) => {
  const path = relative(resolve(root), resolve(target));
  return path !== "" && path !== ".." && !path.startsWith(`..${sep}`);
};

const assertRealDirectory = async (path: string, label: string) => {
  const metadata = await lstat(path);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new Error(`${label} must be a real directory.`);
  }
};

const ensureContainedDirectory = async ({
  root,
  directory,
}: {
  readonly root: string;
  readonly directory: string;
}) => {
  if (!contained(root, directory)) {
    throw new Error("Workspace asset directory escapes its ownership root.");
  }
  await assertRealDirectory(root, "Workspace asset ownership root");
  const segments = relative(root, directory).split(sep);
  let current = root;
  for (const segment of segments) {
    current = join(current, segment);
    let metadata = await state(current);
    if (metadata === null) {
      await mkdir(current);
      metadata = await lstat(current);
    }
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      throw new Error("Workspace asset directory chain is unsafe.");
    }
  }
};

const readOptionalRegular = async (path: string) => {
  const before = await state(path);
  if (before === null) return null;
  if (before.isSymbolicLink() || !before.isFile()) {
    throw new Error("Workspace asset target must be a regular file.");
  }
  const bytes = Uint8Array.from(await readFile(path));
  const after = await lstat(path);
  if (
    after.isSymbolicLink() ||
    !after.isFile() ||
    before.dev !== after.dev ||
    before.ino !== after.ino ||
    before.size !== after.size ||
    before.mtimeMs !== after.mtimeMs
  ) {
    throw new Error("Workspace asset target changed while being read.");
  }
  return bytes;
};

const readExactEvidence = async (path: string) => {
  const metadata = await state(path);
  if (metadata === null) return null;
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new Error("Workspace asset evidence target is unsafe.");
  }
  const entries = await readdir(path, { withFileTypes: true });
  if (
    entries.length !== 2 ||
    entries.some(
      (entry) =>
        entry.isSymbolicLink() ||
        !entry.isFile() ||
        !["external-asset-acquisition.json", "provider-receipt.json"].includes(
          entry.name,
        ),
    )
  ) {
    throw new Error("Workspace asset evidence has an invalid exact file set.");
  }
  return {
    acquisition: Uint8Array.from(
      await readFile(join(path, "external-asset-acquisition.json")),
    ),
    receipt: Uint8Array.from(
      await readFile(join(path, "provider-receipt.json")),
    ),
  } as const;
};

const writeExclusive = async (path: string, bytes: Uint8Array | string) => {
  const handle = await open(path, "wx", 0o644);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
};

const removeEmptyDirectory = async (path: string) => {
  await rmdir(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT" && error.code !== "ENOTEMPTY") throw error;
  });
};

const restoreFile = async (path: string, previous: Uint8Array | null) => {
  if (previous === null) {
    await rm(path, { force: true });
    return;
  }
  const temporary = `${path}.${randomUUID()}.restore`;
  await writeExclusive(temporary, previous);
  await rename(temporary, path);
};

const decodeCandidate = ({
  candidateBase64,
  expectedSize,
}: {
  readonly candidateBase64: string;
  readonly expectedSize: number;
}) => {
  const encodedSize = Math.ceil(expectedSize / 3) * 4;
  if (
    candidateBase64.length !== encodedSize ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(
      candidateBase64,
    )
  ) {
    throw new Error("Workspace asset candidate must use canonical base64.");
  }
  const bytes = Uint8Array.from(Buffer.from(candidateBase64, "base64"));
  if (
    bytes.byteLength !== expectedSize ||
    Buffer.from(bytes).toString("base64") !== candidateBase64
  ) {
    throw new Error("Workspace asset candidate base64 size is stale.");
  }
  return bytes;
};

const assertBeforeSceneFreeze = async (projectRoot: string) => {
  for (const path of [
    join(projectRoot, "production/scene-assignments"),
    join(projectRoot, "production/global-visual-assignment.generated.json"),
  ]) {
    if ((await state(path)) !== null) {
      throw new Error(
        "Workspace asset import is forbidden after Scene freeze.",
      );
    }
  }
};

type PreparedImport = Readonly<{
  projectId: string;
  resourceId: string;
  publicPath: string;
  mediaTarget: string;
  evidenceTarget: string;
  manifestTarget: string;
  candidateBytes: Uint8Array;
  receiptBytes: Uint8Array;
  acquisitionBytes: Uint8Array;
  manifestBytes: Uint8Array;
  previousManifestBytes: Uint8Array;
  exactExisting: boolean;
}>;

const prepareImport = async ({
  locations,
  projectId,
  role,
  receipt: rawReceipt,
  candidateBase64,
}: {
  readonly locations: ProductionLocations;
  readonly projectId: string;
  readonly role: ProjectAssetRole;
  readonly receipt: unknown;
  readonly candidateBase64: string;
}): Promise<PreparedImport> => {
  const receipt = PexelsAcquisitionReceiptV1Schema.parse(rawReceipt);
  const acquisition = adaptPexelsAcquisitionReceiptV1(receipt);
  const candidateBytes = decodeCandidate({
    candidateBase64,
    expectedSize: acquisition.file.sizeBytes,
  });
  const inspected = inspectImageBytes(candidateBytes);
  const declaredExtension = acquisition.file.relativePath
    .slice(acquisition.file.relativePath.lastIndexOf(".") + 1)
    .toLowerCase();
  if (
    checksum(candidateBytes) !== acquisition.file.sha256 ||
    inspected.mimeType !== acquisition.file.mimeType ||
    inspected.extension !== declaredExtension ||
    inspected.width !== acquisition.file.width ||
    inspected.height !== acquisition.file.height
  ) {
    throw new Error("Workspace asset candidate identity is stale.");
  }
  const projectRoot = join(locations.projectSourceRoot, projectId);
  const mediaRoot = join(locations.projectMediaRoot, projectId);
  await Promise.all([
    assertWorkspaceOwnedDirectoryChain({
      locations,
      ownedRoot: locations.projectSourceRoot,
      targetDirectory: projectRoot,
    }),
    assertWorkspaceOwnedDirectoryChain({
      locations,
      ownedRoot: locations.projectMediaRoot,
      targetDirectory: mediaRoot,
    }),
    assertRealDirectory(projectRoot, "Workspace Project source root"),
    assertRealDirectory(mediaRoot, "Workspace Project media root"),
  ]);
  await assertBeforeSceneFreeze(projectRoot);
  const resourceId = createProjectExternalResourceId({
    projectId,
    acquisition,
    role,
  });
  const publicPath = `public/projects/${projectId}/assets/${resourceId}.${inspected.extension}`;
  const evidenceLogicalRoot = `src/projects/${projectId}/sources/assets/${resourceId}`;
  const evidenceTarget = join(projectRoot, "sources/assets", resourceId);
  const mediaTarget = join(
    mediaRoot,
    "assets",
    `${resourceId}.${inspected.extension}`,
  );
  const manifestTarget = join(projectRoot, "assets.manifest.json");
  const previousManifestBytes = await readOptionalRegular(manifestTarget);
  if (previousManifestBytes === null) {
    throw new Error("Workspace Project asset manifest is missing.");
  }
  const previousManifest = ProjectAssetManifestSchema.parse(
    JSON.parse(Buffer.from(previousManifestBytes).toString("utf8")),
  );
  if (previousManifest.projectId !== projectId) {
    throw new Error("Workspace Project asset manifest identity is stale.");
  }
  const descriptor = buildImportedImageDescriptor({
    projectId,
    resourceId,
    role,
    acquisition,
    publicPath,
  });
  const receiptBytes = Buffer.from(`${serializeCanonicalJson(receipt)}\n`);
  const acquisitionBytes = Buffer.from(
    `${serializeCanonicalJson(acquisition)}\n`,
  );
  const entry = {
    resourceId,
    role,
    acquisition,
    evidence: {
      providerReceiptPath: `${evidenceLogicalRoot}/provider-receipt.json`,
      providerReceiptChecksum: checksum(receiptBytes),
      acquisitionPath: `${evidenceLogicalRoot}/external-asset-acquisition.json`,
    },
  } as const;
  const providerIdentityMatches = previousManifest.externalAssets
    .filter(
      ({ acquisition: current }) =>
        current.provider === acquisition.provider &&
        current.providerAssetId === acquisition.providerAssetId,
    )
    .every(
      ({ acquisition: current }) =>
        current.provenanceFingerprint === acquisition.provenanceFingerprint,
    );
  if (!providerIdentityMatches) {
    throw new Error("Workspace asset provider identity conflicts.");
  }
  const existingDescriptor = previousManifest.assets.find(
    ({ id }) => id === resourceId,
  );
  const existingEvidenceEntry = previousManifest.externalAssets.find(
    ({ resourceId: id }) => id === resourceId,
  );
  const manifest = buildProjectAssetManifest({
    projectId,
    assets: [
      ...previousManifest.assets,
      ...(existingDescriptor === undefined ? [descriptor] : []),
    ],
    externalAssets: [
      ...previousManifest.externalAssets,
      ...(existingEvidenceEntry === undefined ? [entry] : []),
    ],
  });
  const manifestBytes = Buffer.from(`${serializeCanonicalJson(manifest)}\n`);
  const [existingMedia, existingEvidence] = await Promise.all([
    readOptionalRegular(mediaTarget),
    readExactEvidence(evidenceTarget),
  ]);
  const exactExisting =
    existingDescriptor !== undefined &&
    existingEvidenceEntry !== undefined &&
    serializeCanonicalJson(existingDescriptor) ===
      serializeCanonicalJson(descriptor) &&
    serializeCanonicalJson(existingEvidenceEntry) ===
      serializeCanonicalJson(entry) &&
    exact(previousManifestBytes, manifestBytes) &&
    existingMedia !== null &&
    exact(existingMedia, candidateBytes) &&
    existingEvidence !== null &&
    exact(existingEvidence.receipt, receiptBytes) &&
    exact(existingEvidence.acquisition, acquisitionBytes);
  if (
    !exactExisting &&
    (existingDescriptor !== undefined ||
      existingEvidenceEntry !== undefined ||
      existingMedia !== null ||
      existingEvidence !== null)
  ) {
    throw new Error("Workspace asset identity conflicts with current output.");
  }
  return {
    projectId,
    resourceId,
    publicPath,
    mediaTarget,
    evidenceTarget,
    manifestTarget,
    candidateBytes,
    receiptBytes,
    acquisitionBytes,
    manifestBytes,
    previousManifestBytes,
    exactExisting,
  };
};

const syncCatalog = async ({
  locations,
  projectId,
  mode,
}: {
  readonly locations: ProductionLocations;
  readonly projectId: string;
  readonly mode: "write" | "check";
}) => {
  const project = await generateWorkspaceProjectResourceCatalog({
    locations,
    projectId,
    mode,
  });
  const aggregate = await generateWorkspaceResourceCatalog({ locations, mode });
  return { project, aggregate } as const;
};

export const importWorkspaceProjectAsset = async ({
  locations,
  projectId: rawProjectId,
  role,
  receipt,
  candidateBase64,
}: {
  readonly locations: ProductionLocations;
  readonly projectId: string;
  readonly role: ProjectAssetRole;
  readonly receipt: unknown;
  readonly candidateBase64: string;
}) => {
  if (locations.layoutKind !== "workspace") {
    throw new Error("Workspace asset import requires Workspace locations.");
  }
  if (role !== "scene-visual" && role !== "global-visual") {
    throw new Error("Workspace image role is unsupported.");
  }
  const projectId = StoryIdSchema.parse(rawProjectId);
  await Promise.all([
    assertWorkspaceOwnedDirectoryChain({
      locations,
      ownedRoot: locations.projectSourceRoot,
      targetDirectory: join(locations.projectSourceRoot, projectId),
    }),
    assertWorkspaceOwnedDirectoryChain({
      locations,
      ownedRoot: locations.projectMediaRoot,
      targetDirectory: join(locations.projectMediaRoot, projectId),
    }),
    assertWorkspaceOwnedDirectoryChain({
      locations,
      ownedRoot: dirname(locations.sourceCurrentRoot),
    }),
    assertWorkspaceOwnedDirectoryChain({
      locations,
      ownedRoot: locations.operationLockRoot,
      allowMissingOwnedRoot: true,
    }),
  ]);
  await mkdir(locations.operationLockRoot, { recursive: true });
  await assertWorkspaceOwnedDirectoryChain({
    locations,
    ownedRoot: locations.operationLockRoot,
  });
  const lock = await acquireRepositoryOperationLock({
    rootDir: locations.operationLockRoot,
    ownerId: "workspace-asset-import",
  });
  try {
    await Promise.all([
      assertWorkspaceOwnedDirectoryChain({
        locations,
        ownedRoot: locations.projectSourceRoot,
        targetDirectory: join(locations.projectSourceRoot, projectId),
      }),
      assertWorkspaceOwnedDirectoryChain({
        locations,
        ownedRoot: locations.projectMediaRoot,
        targetDirectory: join(locations.projectMediaRoot, projectId),
      }),
    ]);
    const prepared = await prepareImport({
      locations,
      projectId,
      role,
      receipt,
      candidateBase64,
    });
    if (prepared.exactExisting) {
      const catalogs = await syncCatalog({
        locations,
        projectId,
        mode: "check",
      });
      return {
        projectId,
        resourceId: prepared.resourceId,
        publicPath: prepared.publicPath,
        catalogFingerprint: catalogs.project.catalog.catalogFingerprint,
        noOp: true,
      } as const;
    }
    const mediaParent = dirname(prepared.mediaTarget);
    const evidenceParent = dirname(prepared.evidenceTarget);
    const evidenceGrandparent = dirname(evidenceParent);
    const [mediaParentBefore, evidenceParentBefore, evidenceGrandparentBefore] =
      await Promise.all([
        state(mediaParent),
        state(evidenceParent),
        state(evidenceGrandparent),
      ]);
    await Promise.all([
      ensureContainedDirectory({
        root: locations.projectMediaRoot,
        directory: mediaParent,
      }),
      ensureContainedDirectory({
        root: locations.projectSourceRoot,
        directory: evidenceParent,
      }),
    ]);
    await Promise.all([
      assertWorkspaceOwnedDirectoryChain({
        locations,
        ownedRoot: locations.projectMediaRoot,
        targetDirectory: mediaParent,
      }),
      assertWorkspaceOwnedDirectoryChain({
        locations,
        ownedRoot: locations.projectSourceRoot,
        targetDirectory: evidenceParent,
      }),
    ]);
    const transactionId = randomUUID();
    const mediaStaging = `${prepared.mediaTarget}.${transactionId}.tmp`;
    const evidenceStaging = `${prepared.evidenceTarget}.${transactionId}.tmp`;
    const manifestStaging = `${prepared.manifestTarget}.${transactionId}.tmp`;
    await mkdir(evidenceStaging);
    try {
      await Promise.all([
        writeExclusive(mediaStaging, prepared.candidateBytes),
        writeExclusive(
          join(evidenceStaging, "provider-receipt.json"),
          prepared.receiptBytes,
        ),
        writeExclusive(
          join(evidenceStaging, "external-asset-acquisition.json"),
          prepared.acquisitionBytes,
        ),
        writeExclusive(manifestStaging, prepared.manifestBytes),
      ]);
    } catch (error) {
      await Promise.all([
        rm(mediaStaging, { force: true }),
        rm(evidenceStaging, { recursive: true, force: true }),
        rm(manifestStaging, { force: true }),
      ]);
      if (mediaParentBefore === null) await removeEmptyDirectory(mediaParent);
      if (evidenceParentBefore === null)
        await removeEmptyDirectory(evidenceParent);
      if (evidenceGrandparentBefore === null)
        await removeEmptyDirectory(evidenceGrandparent);
      throw error;
    }
    const projectCatalogPath = join(
      locations.projectSourceRoot,
      projectId,
      "generated/resource-catalog.generated.json",
    );
    const aggregateCatalogPath = join(
      locations.sourceCurrentRoot,
      "../resource-catalog.generated.json",
    );
    const [previousProjectCatalog, previousAggregateCatalog] =
      await Promise.all([
        readOptionalRegular(projectCatalogPath),
        readOptionalRegular(aggregateCatalogPath),
      ]);
    const manifestBackup = `${prepared.manifestTarget}.${transactionId}.backup`;
    let manifestBackedUp = false;
    let mediaPromoted = false;
    let evidencePromoted = false;
    let manifestPromoted = false;
    try {
      await rename(prepared.manifestTarget, manifestBackup);
      manifestBackedUp = true;
      await rename(mediaStaging, prepared.mediaTarget);
      mediaPromoted = true;
      await rename(evidenceStaging, prepared.evidenceTarget);
      evidencePromoted = true;
      await rename(manifestStaging, prepared.manifestTarget);
      manifestPromoted = true;
      const written = await syncCatalog({
        locations,
        projectId,
        mode: "write",
      });
      const checked = await syncCatalog({
        locations,
        projectId,
        mode: "check",
      });
      if (
        written.project.catalog.catalogFingerprint !==
          checked.project.catalog.catalogFingerprint ||
        written.aggregate.destination !== checked.aggregate.destination
      ) {
        throw new Error("Workspace asset Catalog identity drifted.");
      }
      const catalogEntry = checked.project.catalog.entries.find(
        ({ descriptor }) => descriptor.id === prepared.resourceId,
      );
      if (
        catalogEntry?.descriptor.kind !== "asset" ||
        catalogEntry.descriptor.localPath !== prepared.publicPath
      ) {
        throw new Error("Workspace asset is missing from Project Catalog.");
      }
      await rm(manifestBackup, { force: true });
      manifestBackedUp = false;
      return {
        projectId,
        resourceId: prepared.resourceId,
        publicPath: prepared.publicPath,
        catalogFingerprint: checked.project.catalog.catalogFingerprint,
        noOp: false,
      } as const;
    } catch (error) {
      const rollbackErrors: unknown[] = [];
      if (manifestPromoted) {
        await rm(prepared.manifestTarget, { force: true }).catch((cause) =>
          rollbackErrors.push(cause),
        );
      }
      if (manifestBackedUp) {
        await rename(manifestBackup, prepared.manifestTarget).catch((cause) =>
          rollbackErrors.push(cause),
        );
      }
      if (evidencePromoted) {
        await rm(prepared.evidenceTarget, {
          recursive: true,
          force: true,
        }).catch((cause) => rollbackErrors.push(cause));
      }
      if (mediaPromoted) {
        await rm(prepared.mediaTarget, { force: true }).catch((cause) =>
          rollbackErrors.push(cause),
        );
      }
      await Promise.all([
        restoreFile(projectCatalogPath, previousProjectCatalog),
        restoreFile(aggregateCatalogPath, previousAggregateCatalog),
      ]).catch((cause) => rollbackErrors.push(cause));
      if (mediaParentBefore === null) {
        await removeEmptyDirectory(mediaParent).catch((cause) =>
          rollbackErrors.push(cause),
        );
      }
      if (evidenceParentBefore === null) {
        await removeEmptyDirectory(evidenceParent).catch((cause) =>
          rollbackErrors.push(cause),
        );
      }
      if (evidenceGrandparentBefore === null) {
        await removeEmptyDirectory(evidenceGrandparent).catch((cause) =>
          rollbackErrors.push(cause),
        );
      }
      if (rollbackErrors.length > 0) {
        throw new AggregateError(
          [error, ...rollbackErrors],
          "Workspace asset import failed and rollback was incomplete.",
        );
      }
      throw error;
    } finally {
      await Promise.all([
        rm(mediaStaging, { force: true }),
        rm(evidenceStaging, { recursive: true, force: true }),
        rm(manifestStaging, { force: true }),
      ]);
    }
  } finally {
    await lock.release();
  }
};

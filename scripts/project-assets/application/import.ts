import { isAbsolute, join } from "node:path";

import { z } from "zod";

import {
  ProjectAssetManifestSchema,
  ResourceAssetDescriptorSchema,
  StoryIdSchema,
  buildProjectAssetManifest,
  serializeCanonicalJson,
  type ProjectAssetManifest,
  type ResourceCatalog,
} from "@axmorf/studio/contracts";
import {
  acquireImportLock,
  assertBeforeSceneFreeze,
  assertProjectDirectory,
  assertSafeTargetParent,
  checksumBytes,
  createImportStaging,
  promoteImportStaging,
  readCandidateFile,
  readExactEvidenceDirectory,
  readOptionalFile,
  readProviderReceipt,
} from "../adapters/filesystem";
import { adaptPexelsAcquisitionReceiptV1 } from "../adapters/pexels-receipt";
import { inspectImageBytes } from "../domain/image";
import {
  buildImportedImageDescriptor,
  createProjectExternalResourceId,
  type ProjectAssetRole,
} from "../domain/model";

export type ProjectAssetCatalogSync = (request: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly mode: "write" | "check";
}) => Promise<ResourceCatalog>;

const bytesOf = (value: string) => new TextEncoder().encode(value);
const exactBytes = (left: Uint8Array, right: Uint8Array) =>
  left.byteLength === right.byteLength &&
  left.every((value, index) => value === right[index]);

const LegacyProjectAssetManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    projectId: StoryIdSchema,
    assets: z.array(ResourceAssetDescriptorSchema),
  })
  .strict();

const parseExistingManifest = (
  bytes: Uint8Array | null,
  projectId: string,
): ProjectAssetManifest => {
  if (bytes === null) {
    return buildProjectAssetManifest({
      projectId,
      assets: [],
      externalAssets: [],
    });
  }
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    throw new Error("Project asset manifest contains malformed JSON.", {
      cause: error,
    });
  }
  if ((raw as { schemaVersion?: unknown }).schemaVersion === 1) {
    const legacy = LegacyProjectAssetManifestSchema.parse(raw);
    if (legacy.projectId !== projectId) {
      throw new Error("Project asset manifest identity is stale.");
    }
    return buildProjectAssetManifest({
      projectId,
      assets: legacy.assets,
      externalAssets: [],
    });
  }
  const manifest = ProjectAssetManifestSchema.parse(raw);
  if (manifest.projectId !== projectId) {
    throw new Error("Project asset manifest identity is stale.");
  }
  return manifest;
};

const validateCandidate = ({
  acquisition,
  bytes,
}: {
  readonly acquisition: ReturnType<typeof adaptPexelsAcquisitionReceiptV1>;
  readonly bytes: Uint8Array;
}) => {
  const inspected = inspectImageBytes(bytes);
  const extension = acquisition.file.relativePath.slice(
    acquisition.file.relativePath.lastIndexOf(".") + 1,
  );
  if (
    checksumBytes(bytes) !== acquisition.file.sha256 ||
    bytes.byteLength !== acquisition.file.sizeBytes ||
    inspected.mimeType !== acquisition.file.mimeType ||
    inspected.extension !== extension ||
    inspected.width !== acquisition.file.width ||
    inspected.height !== acquisition.file.height
  ) {
    throw new Error(
      "Candidate image identity drifted from its provider receipt.",
    );
  }
  return inspected;
};

export const importProjectAsset = async ({
  rootDir,
  projectId: rawProjectId,
  receiptPath,
  role,
  syncCatalog: injectedSyncCatalog,
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly receiptPath: string;
  readonly role: ProjectAssetRole;
  readonly syncCatalog?: ProjectAssetCatalogSync;
}) => {
  const projectId = StoryIdSchema.parse(rawProjectId);
  if (!isAbsolute(receiptPath)) {
    throw new Error("Provider receipt path must be absolute.");
  }
  if (role !== "scene-visual" && role !== "global-visual") {
    throw new Error(
      "Project image role must be scene-visual or global-visual.",
    );
  }
  await assertProjectDirectory(rootDir, projectId);
  await assertBeforeSceneFreeze(rootDir, projectId);
  const receipt = await readProviderReceipt(receiptPath);
  const acquisition = adaptPexelsAcquisitionReceiptV1(receipt.value);
  const candidate = await readCandidateFile({
    receiptPath,
    relativePath: acquisition.file.relativePath,
  });
  const inspected = validateCandidate({ acquisition, bytes: candidate.bytes });
  const resourceId = createProjectExternalResourceId({
    projectId,
    acquisition,
    role,
  });
  const publicPath = `public/projects/${projectId}/assets/${resourceId}.${inspected.extension}`;
  const evidencePath = `src/projects/${projectId}/sources/assets/${resourceId}`;
  const manifestPath = `src/projects/${projectId}/assets.manifest.json`;
  const acquisitionPath = `${evidencePath}/external-asset-acquisition.json`;
  const providerReceiptPath = `${evidencePath}/provider-receipt.json`;
  const descriptor = buildImportedImageDescriptor({
    projectId,
    resourceId,
    role,
    acquisition,
    publicPath,
  });
  await Promise.all([
    assertSafeTargetParent(rootDir, join(rootDir, publicPath)),
    assertSafeTargetParent(rootDir, join(rootDir, evidencePath)),
    assertSafeTargetParent(rootDir, join(rootDir, manifestPath)),
  ]);
  const lock = await acquireImportLock(rootDir);
  try {
    await assertBeforeSceneFreeze(rootDir, projectId);
    const previousManifestBytes = await readOptionalFile(
      join(rootDir, manifestPath),
    );
    const previousManifest = parseExistingManifest(
      previousManifestBytes,
      projectId,
    );
    const existingDescriptor = previousManifest.assets.find(
      ({ id }) => id === resourceId,
    );
    const existingEvidence = previousManifest.externalAssets.find(
      (entry) => entry.resourceId === resourceId,
    );
    const providerIdentityMatches = previousManifest.externalAssets
      .filter(
        ({ acquisition: value }) =>
          value.provider === acquisition.provider &&
          value.providerAssetId === acquisition.providerAssetId,
      )
      .every(
        ({ acquisition: value }) =>
          value.provenanceFingerprint === acquisition.provenanceFingerprint,
      );
    if (!providerIdentityMatches) {
      throw new Error(
        "Provider receipt identity conflicts with an imported asset.",
      );
    }

    const acquisitionBytes = `${serializeCanonicalJson(acquisition)}\n`;
    const receiptChecksum = checksumBytes(receipt.bytes);
    const entry = {
      resourceId,
      role,
      acquisition,
      evidence: {
        providerReceiptPath,
        providerReceiptChecksum: receiptChecksum,
        acquisitionPath,
      },
    } as const;
    const manifest = buildProjectAssetManifest({
      projectId,
      assets: [
        ...previousManifest.assets,
        ...(existingDescriptor ? [] : [descriptor]),
      ],
      externalAssets: [
        ...previousManifest.externalAssets,
        ...(existingEvidence ? [] : [entry]),
      ],
    });
    const manifestBytes = `${serializeCanonicalJson(manifest)}\n`;
    const publicExisting = await readOptionalFile(join(rootDir, publicPath));
    const evidenceExisting = await readExactEvidenceDirectory(
      join(rootDir, evidencePath),
    );
    const exactExisting =
      existingDescriptor !== undefined &&
      existingEvidence !== undefined &&
      serializeCanonicalJson(existingDescriptor) ===
        serializeCanonicalJson(descriptor) &&
      serializeCanonicalJson(existingEvidence) ===
        serializeCanonicalJson(entry) &&
      previousManifestBytes !== null &&
      exactBytes(previousManifestBytes, bytesOf(manifestBytes)) &&
      publicExisting !== null &&
      exactBytes(publicExisting, candidate.bytes) &&
      evidenceExisting !== null &&
      exactBytes(evidenceExisting.receipt, receipt.bytes) &&
      exactBytes(evidenceExisting.acquisition, bytesOf(acquisitionBytes));
    const syncCatalog =
      injectedSyncCatalog ??
      (await import("./catalog-sync")).syncProjectAssetCatalog;
    if (exactExisting) {
      const catalog = await syncCatalog({ rootDir, projectId, mode: "check" });
      return {
        projectId,
        resourceId,
        publicPath,
        catalogFingerprint: catalog.catalogFingerprint,
        noOp: true,
      } as const;
    }
    if (
      existingDescriptor !== undefined ||
      existingEvidence !== undefined ||
      publicExisting !== null ||
      evidenceExisting !== null
    ) {
      throw new Error("Project asset identity conflicts with existing output.");
    }

    const staging = await createImportStaging({
      rootDir,
      publicPath,
      evidencePath,
      manifestPath,
      publicBytes: candidate.bytes,
      receiptBytes: receipt.bytes,
      acquisitionBytes,
      manifestBytes,
    });
    const promoted = await promoteImportStaging({
      staging,
      previousManifest: previousManifestBytes,
    });
    try {
      const writtenCatalog = await syncCatalog({
        rootDir,
        projectId,
        mode: "write",
      });
      const checkedCatalog = await syncCatalog({
        rootDir,
        projectId,
        mode: "check",
      });
      if (
        writtenCatalog.catalogFingerprint !== checkedCatalog.catalogFingerprint
      ) {
        throw new Error(
          "ResourceCatalog identity drifted during asset import.",
        );
      }
      const catalogEntry = checkedCatalog.entries.find(
        ({ descriptor: value }) => value.id === resourceId,
      );
      if (
        catalogEntry === undefined ||
        catalogEntry.descriptor.kind !== "asset" ||
        catalogEntry.descriptor.localPath !== publicPath
      ) {
        throw new Error(
          "Imported asset is missing from the rebuilt ResourceCatalog.",
        );
      }
      await promoted.commit();
      return {
        projectId,
        resourceId,
        publicPath,
        catalogFingerprint: checkedCatalog.catalogFingerprint,
        noOp: false,
      } as const;
    } catch (error) {
      await promoted.rollback();
      try {
        await syncCatalog({ rootDir, projectId, mode: "write" });
        await syncCatalog({ rootDir, projectId, mode: "check" });
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          "Project asset import failed and Catalog rollback could not be verified.",
        );
      }
      throw error;
    }
  } finally {
    await lock.release();
  }
};

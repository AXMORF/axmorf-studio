import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  ProducerAssetManifestSchema,
  ResourceAssetDescriptorSchema,
  ResourceDescriptorSchema,
  ResourceIdSchema,
  type ResourceCatalog,
  type ResourceDescriptor,
} from "../../src/contracts";
import { capabilityDescriptorDeclarations } from "../../src/remotion/catalog/capability-descriptors";
import { styleDescriptorDeclarations } from "../../src/remotion/catalog/style-descriptors";
import { producerStyleProfileIds } from "../../src/remotion/capabilities/styles";
import { createRepositoryProjectStorageLocations } from "../projects/repository-project-locations";
import {
  checksumBytes,
  loadProjectResourceDescriptorsFromStorage,
  readGeneratedResourceCatalogFromStorage,
  readRegularFile,
  validateCapabilityDescriptorExports,
} from "./project-files";

export const LOCAL_REFERENCE_ASSET_MANIFEST_PATH =
  "private/reference-assets/assets.manifest.json";
export const LOCAL_REFERENCE_ASSET_LICENSE_EVIDENCE_PATH =
  "private/reference-assets/MIXKIT_AUDIO_LICENSE.md";

const LOCAL_REFERENCE_AUDIO_ROLES = new Set([
  "sound-effect",
  "background-music",
]);

export const validateAssetDescriptorFiles = async (
  rootDir: string,
  rawDescriptors: readonly unknown[],
): Promise<void> => {
  for (const rawDescriptor of rawDescriptors) {
    const descriptor = ResourceAssetDescriptorSchema.parse(rawDescriptor);
    const bytes = await readRegularFile(join(rootDir, descriptor.localPath));
    if (checksumBytes(bytes) !== descriptor.checksum) {
      throw new Error(`Catalog asset checksum is stale: ${descriptor.id}.`);
    }
  }
};

const withAuthorityChecksum = async (
  rootDir: string,
  rawDescriptor: unknown,
): Promise<ResourceDescriptor> => {
  const descriptor = ResourceDescriptorSchema.parse(rawDescriptor);
  const bytes = await readRegularFile(
    join(rootDir, descriptor.authority.repositoryPath),
  );
  return ResourceDescriptorSchema.parse({
    ...descriptor,
    authority: {
      ...descriptor.authority,
      sourceChecksum: checksumBytes(bytes),
    },
  });
};

export const loadProjectResourceDescriptors = async (
  rootDir: string,
  projectId?: string,
): Promise<readonly ResourceDescriptor[]> =>
  loadProjectResourceDescriptorsFromStorage({
    storage: createRepositoryProjectStorageLocations({ repositoryRoot: rootDir }),
    projectId,
  });

export const loadLocalReferenceAssetDescriptors = async (
  rootDir: string,
): Promise<readonly ResourceDescriptor[]> => {
  const manifestPath = join(rootDir, LOCAL_REFERENCE_ASSET_MANIFEST_PATH);
  let metadata;
  try {
    metadata = await lstat(manifestPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(
      "Local reference asset manifest must be a regular non-symbolic file.",
    );
  }
  const manifest = ProducerAssetManifestSchema.parse(
    JSON.parse((await readFile(manifestPath, "utf8")).toString()),
  );
  const licenseEvidenceChecksum = checksumBytes(
    await readRegularFile(
      join(rootDir, LOCAL_REFERENCE_ASSET_LICENSE_EVIDENCE_PATH),
    ),
  );
  for (const descriptor of manifest.assets) {
    if (
      descriptor.authority.repositoryPath !==
      LOCAL_REFERENCE_ASSET_MANIFEST_PATH
    ) {
      throw new Error(
        `Local reference asset authority is stale: ${descriptor.id}.`,
      );
    }
    if (
      descriptor.assetKind !== "audio" ||
      !LOCAL_REFERENCE_AUDIO_ROLES.has(descriptor.mediaRole) ||
      descriptor.allowedUse !== "localize-asset" ||
      !descriptor.localPath.startsWith("public/assets/library/")
    ) {
      throw new Error(
        `Local reference asset scope is invalid: ${descriptor.id}.`,
      );
    }
    if (
      descriptor.license.sourceEvidenceFingerprint !== licenseEvidenceChecksum
    ) {
      throw new Error(
        `Local reference asset license evidence is stale: ${descriptor.id}.`,
      );
    }
  }
  await validateAssetDescriptorFiles(rootDir, manifest.assets);
  return manifest.assets;
};

export const loadCoreCatalogAuthorityDescriptors = async (
  rootDir: string,
): Promise<readonly ResourceDescriptor[]> => {
  const manifestPath = join(
    rootDir,
    "src/remotion/catalog/assets.manifest.json",
  );
  const manifest = ProducerAssetManifestSchema.parse(
    JSON.parse((await readRegularFile(manifestPath)).toString("utf8")),
  );
  await validateAssetDescriptorFiles(rootDir, manifest.assets);
  await validateCapabilityDescriptorExports(rootDir, [
    ...styleDescriptorDeclarations,
    ...capabilityDescriptorDeclarations,
  ]);
  const styleIds = styleDescriptorDeclarations.map(
    (descriptor) => descriptor.styleProfileId,
  );
  if (
    styleIds.length !== producerStyleProfileIds.length ||
    styleIds.some((id, index) => id !== producerStyleProfileIds[index])
  ) {
    throw new Error("Catalog style profile identities are stale.");
  }
  return Promise.all(
    [
      ...manifest.assets,
      ...styleDescriptorDeclarations,
      ...capabilityDescriptorDeclarations,
    ].map((descriptor) => withAuthorityChecksum(rootDir, descriptor)),
  );
};

export const loadCatalogAuthorityDescriptors = async (
  rootDir: string,
  projectId?: string,
): Promise<readonly ResourceDescriptor[]> => {
  const [coreDescriptors, localReferenceDescriptors, projectDescriptors] =
    await Promise.all([
      loadCoreCatalogAuthorityDescriptors(rootDir),
      loadLocalReferenceAssetDescriptors(rootDir),
      loadProjectResourceDescriptors(rootDir, projectId),
    ]);
  const enrichedLocalDescriptors = await Promise.all(
    [...localReferenceDescriptors, ...projectDescriptors].map((descriptor) =>
      withAuthorityChecksum(rootDir, descriptor),
    ),
  );
  const descriptors = [...coreDescriptors, ...enrichedLocalDescriptors];
  const ids = new Set<string>();
  for (const descriptor of descriptors) {
    ResourceIdSchema.parse(descriptor.id);
    if (ids.has(descriptor.id)) {
      throw new Error(`Duplicate Resource Catalog ID: ${descriptor.id}.`);
    }
    ids.add(descriptor.id);
  }
  return descriptors;
};

export const readGeneratedResourceCatalog = async (
  rootDir: string,
): Promise<ResourceCatalog> =>
  readGeneratedResourceCatalogFromStorage(
    createRepositoryProjectStorageLocations({ repositoryRoot: rootDir }),
  );

import { createHash } from "node:crypto";

import {
  ResourceAssetDescriptorSchema,
  ResourceIdSchema,
  type ExternalImageAssetAcquisition,
} from "@axmorf/studio/contracts";

export type ProjectAssetRole = "scene-visual" | "global-visual";

export const createProjectExternalResourceId = ({
  projectId,
  acquisition,
  role,
}: {
  readonly projectId: string;
  readonly acquisition: ExternalImageAssetAcquisition;
  readonly role: ProjectAssetRole;
}) => {
  const projectIdentity = createHash("sha256")
    .update(projectId)
    .digest("hex")
    .slice(0, 16);
  return ResourceIdSchema.parse(
    `asset.${acquisition.provider}.${acquisition.providerAssetId}.${role}.${projectIdentity}`,
  );
};

export const buildImportedImageDescriptor = ({
  projectId,
  resourceId,
  role,
  acquisition,
  publicPath,
}: {
  readonly projectId: string;
  readonly resourceId: string;
  readonly role: ProjectAssetRole;
  readonly acquisition: ExternalImageAssetAcquisition;
  readonly publicPath: string;
}) =>
  ResourceAssetDescriptorSchema.parse({
    schemaVersion: 1,
    id: resourceId,
    kind: "asset",
    status: "approved",
    title: `${acquisition.provider} image ${acquisition.providerAssetId}`,
    description: `Verified project-local ${acquisition.provider} image for ${role}.`,
    useCases: [role],
    tags: ["external", "image", acquisition.provider, role].sort(),
    authority: {
      kind: "repository-file",
      repositoryPath: `src/projects/${projectId}/assets.manifest.json`,
    },
    allowedUse: "runtime-approved",
    assetKind: "image",
    mediaRole: role,
    localPath: publicPath,
    checksum: acquisition.file.sha256,
    license: {
      id: acquisition.license.name,
      verificationStatus: "verified",
      sourceUrl: acquisition.license.url,
      attributionRequired: acquisition.attribution.required,
      attributionText: acquisition.attribution.text,
      verifiedAt: acquisition.acquiredAt,
      sourceEvidenceFingerprint: acquisition.provenanceFingerprint,
    },
    externalSource: {
      provider: acquisition.provider,
      providerAssetId: acquisition.providerAssetId,
      sourcePageUrl: acquisition.sourcePageUrl,
      creator: acquisition.creator,
      provenanceFingerprint: acquisition.provenanceFingerprint,
    },
    media: {
      mimeType: acquisition.file.mimeType,
      width: acquisition.file.width,
      height: acquisition.file.height,
      sizeBytes: acquisition.file.sizeBytes,
    },
  });

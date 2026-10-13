import { createHash } from "node:crypto";

import {
  ResourceAssetDescriptorSchema,
  ResourceIdSchema,
  type ExternalImageAssetAcquisition,
  type GeneratedArtworkRecord,
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

export const createProjectGeneratedResourceId = (
  projectId: string,
  assetId: string,
) =>
  ResourceIdSchema.parse(
    `asset.generated.${assetId}.${createHash("sha256").update(projectId).digest("hex").slice(0, 16)}`,
  );

export const buildGeneratedArtworkDescriptor = ({
  projectId,
  resourceId,
  creation,
  publicPath,
}: {
  readonly projectId: string;
  readonly resourceId: string;
  readonly creation: GeneratedArtworkRecord;
  readonly publicPath: string;
}) =>
  ResourceAssetDescriptorSchema.parse({
    schemaVersion: 1,
    id: resourceId,
    kind: "asset",
    status: "approved",
    title: creation.title,
    description: creation.description,
    useCases: ["scene-visual"],
    tags: [creation.provenance.kind, "project-local", "scene-visual"].sort(),
    authority: {
      kind: "repository-file",
      repositoryPath: `src/projects/${projectId}/assets.manifest.json`,
    },
    allowedUse: "runtime-approved",
    assetKind: creation.provenance.kind === "authored-svg" ? "svg" : "image",
    mediaRole: "scene-visual",
    localPath: publicPath,
    checksum: creation.file.sha256,
    license: {
      id: "creator-declared-original-work",
      verificationStatus: "verified",
      sourceUrl: null,
      attributionRequired: false,
      attributionText: null,
      // A fixed admission-policy date, never the generation attempt's clock.
      verifiedAt: "2026-10-13T00:00:00.000Z",
      sourceEvidenceFingerprint: creation.provenanceFingerprint,
    },
    generatedSource: {
      kind: creation.provenance.kind,
      creator: creation.provenance.creator,
      provenanceFingerprint: creation.provenanceFingerprint,
    },
    media: {
      mimeType: creation.file.mimeType,
      width: creation.file.width,
      height: creation.file.height,
      sizeBytes: creation.file.sizeBytes,
    },
  });

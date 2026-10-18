import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  ProducerAssetManifestSchema,
  Sha256DigestSchema,
  type ResourceDescriptor,
} from "@axmorf/studio/contracts";

/** Maintainer-supplied licensed audio that may replace the bookend template audio. */
export const LOCAL_REFERENCE_ASSET_MANIFEST_PATH =
  "private/reference-assets/assets.manifest.json";
export const LOCAL_REFERENCE_ASSET_LICENSE_EVIDENCE_PATH =
  "private/reference-assets/MIXKIT_AUDIO_LICENSE.md";

const LOCAL_REFERENCE_AUDIO_ROLES = new Set([
  "sound-effect",
  "background-music",
]);

const checksumBytes = (bytes: Buffer) =>
  Sha256DigestSchema.parse(
    `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
  );

const readRegularFile = async (path: string): Promise<Buffer> => {
  const stat = await lstat(path);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error("Reference asset files must be regular non-symbolic files.");
  }
  return readFile(path);
};

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
    JSON.parse(await readFile(manifestPath, "utf8")),
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
    const bytes = await readRegularFile(join(rootDir, descriptor.localPath));
    if (checksumBytes(bytes) !== descriptor.checksum) {
      throw new Error(`Reference asset checksum is stale: ${descriptor.id}.`);
    }
  }
  return manifest.assets;
};

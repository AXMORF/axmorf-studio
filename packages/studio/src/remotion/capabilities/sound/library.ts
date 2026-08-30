import { ProducerAssetManifestSchema } from "../../../contracts/assets";
import { assertResourceAllowedForUse } from "../../../contracts/resource-catalog";
import { assertProducerLocalMediaPath } from "../media/local-path";
import type {
  ProducerSoundLibrary,
  ProducerSoundLibraryEntry,
  ProducerSoundLibraryRole,
} from "./types";

export const getProducerSoundLibrary = (
  rawManifest: unknown,
): ProducerSoundLibrary => {
  const manifest = ProducerAssetManifestSchema.parse(rawManifest);
  const byRole: Record<ProducerSoundLibraryRole, ProducerSoundLibraryEntry[]> =
    {
      "background-music": [],
      "sound-effect": [],
    };

  for (const asset of manifest.assets) {
    if (asset.assetKind !== "audio") continue;
    if (asset.mediaRole === "narration") {
      throw new Error(`${asset.id} narration is not a sound contribution.`);
    }
    if (
      asset.mediaRole !== "background-music" &&
      asset.mediaRole !== "sound-effect"
    ) {
      throw new Error(`${asset.id} uses an unsupported sound concept.`);
    }
    const role = asset.mediaRole;
    assertResourceAllowedForUse(asset, asset.mediaRole);
    if (
      !asset.media?.durationInSeconds ||
      !asset.media.codec ||
      !asset.media.sampleRate ||
      asset.license.verificationStatus !== "verified"
    ) {
      throw new Error(
        `${asset.id} sound library asset is missing media or license metadata.`,
      );
    }
    const src = asset.localPath.replace(/^public\//u, "");
    assertProducerLocalMediaPath(src, `${asset.id} sound library src`);
    byRole[role].push({
      id: asset.id,
      role,
      publicPath: asset.localPath,
      license: asset.license.id,
      durationInSeconds: asset.media.durationInSeconds,
    });
  }

  return byRole;
};

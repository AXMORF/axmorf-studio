import { ProducerAssetManifestSchema } from "../../../contracts/assets";
import { assertResourceAllowedForUse } from "../../../contracts/resource-catalog";
import { assertProducerLocalMediaPath } from "../media/local-path";
import type {
  ProducerSoundLibrary,
  ProducerSoundLibraryEntry,
  ProducerSoundRole,
} from "./types";

export const getProducerSoundLibrary = (
  rawManifest: unknown,
): ProducerSoundLibrary => {
  const manifest = ProducerAssetManifestSchema.parse(rawManifest);
  const byRole: Record<ProducerSoundRole, ProducerSoundLibraryEntry[]> = {
    narration: [],
    bgm: [],
    ambience: [],
    sfx: [],
  };

  for (const asset of manifest.assets) {
    if (asset.assetKind !== "audio") continue;
    if (asset.mediaRole === "narration" || asset.mediaRole === "global-bgm") {
      throw new Error(`${asset.id} is not Scene-local sound.`);
    }
    const role = asset.mediaRole === "scene-ambience" ? "ambience" : "sfx";
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
      src,
      license: asset.license.id,
      durationInSeconds: asset.media.durationInSeconds,
    });
  }

  return byRole;
};

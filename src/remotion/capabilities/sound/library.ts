import type { ProducerAssetManifest } from "../../../contracts/assets";
import { assertProducerLocalMediaPath } from "../media/local-path";
import type { ProducerSoundLibrary, ProducerSoundLibraryEntry, ProducerSoundRole } from "./types";

export const getProducerSoundLibrary = (manifest: ProducerAssetManifest): ProducerSoundLibrary => {
  const byRole: Record<ProducerSoundRole, ProducerSoundLibraryEntry[]> = {
    narration: [],
    bgm: [],
    ambience: [],
    sfx: [],
  };

  for (const asset of manifest.assets) {
    if (asset.kind !== "audio" || !asset.sound) continue;
    if (
      !asset.media?.durationInSeconds ||
      !asset.media.codec ||
      !asset.media.sampleRate ||
      !asset.source.license.trim()
    ) {
      throw new Error(`${asset.id} sound library asset is missing media or license metadata.`);
    }
    const src = asset.localPath.replace(/^public\//u, "");
    assertProducerLocalMediaPath(src, `${asset.id} sound library src`);
    byRole[asset.sound.role].push({
      id: asset.id,
      role: asset.sound.role,
      src,
      license: asset.source.license,
      durationInSeconds: asset.media.durationInSeconds,
    });
  }

  return byRole;
};

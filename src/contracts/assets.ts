export type AssetKind =
  | "image"
  | "video"
  | "svg"
  | "audio"
  | "font"
  | "lottie"
  | "rive"
  | "gltf"
  | "texture";

export type AssetSoundRole = "narration" | "bgm" | "ambience" | "sfx";

export type ProducerAsset = {
  readonly id: string;
  readonly kind: AssetKind;
  readonly localPath: string;
  readonly title: string;
  readonly description: string;
  readonly useCases: readonly string[];
  readonly tags: readonly string[];
  readonly source: {
    readonly origin: "authored" | "library" | "captured" | "licensed";
    readonly license: string;
    readonly sourceUrl?: string;
  };
  readonly media?: {
    readonly width?: number;
    readonly height?: number;
    readonly durationInSeconds?: number;
    readonly codec?: string;
    readonly sampleRate?: number;
  };
  readonly sound?: {
    readonly role: AssetSoundRole;
  };
};

export type ProducerAssetManifest = {
  readonly schemaVersion: 1;
  readonly assets: readonly ProducerAsset[];
};

const allowedPrefixes = ["public/assets/library/", "public/projects/"] as const;

export const assertProducerAssetManifest = (manifest: ProducerAssetManifest): void => {
  if (manifest.schemaVersion !== 1) throw new Error("Unsupported asset manifest schemaVersion.");
  const ids = new Set<string>();
  for (const asset of manifest.assets) {
    if (ids.has(asset.id)) throw new Error(`Duplicate asset id: ${asset.id}`);
    ids.add(asset.id);
    if (
      !allowedPrefixes.some((prefix) => asset.localPath.startsWith(prefix)) ||
      asset.localPath.includes("..") ||
      asset.localPath.includes("\\")
    ) {
      throw new Error(`${asset.id} must use an approved repository-local public path.`);
    }
    if (!asset.title.trim() || !asset.description.trim() || !asset.source.license.trim()) {
      throw new Error(`${asset.id} is missing catalog metadata.`);
    }
  }
};

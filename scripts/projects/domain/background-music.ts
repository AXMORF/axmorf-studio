import type {
  ResourceAssetDescriptor,
  ResourceDescriptor,
} from "@axmorf/studio/contracts";

/** Only global, licensed loop masters can become the continuous Project score. */
export const backgroundMusicCandidates = (
  descriptors: readonly ResourceDescriptor[],
  resourceIds?: readonly string[],
): readonly ResourceAssetDescriptor[] =>
  descriptors
    .filter(
      (descriptor): descriptor is ResourceAssetDescriptor =>
        descriptor.kind === "asset" &&
        descriptor.assetKind === "audio" &&
        descriptor.mediaRole === "background-music" &&
        descriptor.status === "approved" &&
        descriptor.license.verificationStatus === "verified" &&
        (descriptor.allowedUse === "runtime-approved" ||
          descriptor.allowedUse === "localize-asset") &&
        !descriptor.authority.repositoryPath.startsWith("src/projects/") &&
        !descriptor.localPath.startsWith("public/projects/") &&
        !descriptor.tags.includes("scene-template") &&
        descriptor.tags.includes("loop") &&
        (descriptor.media?.durationInSeconds ?? 0) > 0 &&
        descriptor.media?.codec !== undefined &&
        descriptor.media?.sampleRate !== undefined &&
        (resourceIds === undefined || resourceIds.includes(descriptor.id)),
    )
    .sort((left, right) => left.id.localeCompare(right.id));

export const chooseBackgroundMusic = (
  candidates: readonly ResourceAssetDescriptor[],
  text: string,
): ResourceAssetDescriptor | null => {
  const normalized = text.toLowerCase();
  const segmenter = new Intl.Segmenter("zh", { granularity: "word" });
  const words = [
    ...new Set(
      [...segmenter.segment(normalized)]
        .filter(({ isWordLike, segment }) => isWordLike && segment.length >= 2)
        .map(({ segment }) => segment),
    ),
  ];
  const generic = new Set([
    "background",
    "music",
    "loop",
    "original",
    "video",
    "instrumental",
    "循环",
    "音乐",
    "视频",
  ]);
  const score = (asset: ResourceAssetDescriptor) => {
    const description = [asset.title, ...asset.useCases]
      .join(" ")
      .toLowerCase();
    return (
      asset.tags.reduce(
        (value, tag) =>
          value +
          (!generic.has(tag) && normalized.includes(tag.toLowerCase()) ? 3 : 0),
        0,
      ) +
      words.reduce(
        (value, word) =>
          value + (!generic.has(word) && description.includes(word) ? 1 : 0),
        0,
      )
    );
  };
  return (
    [...candidates].sort(
      (left, right) =>
        score(right) - score(left) || left.id.localeCompare(right.id),
    )[0] ?? null
  );
};

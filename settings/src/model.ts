type VoiceProfile = Readonly<{
  id: string;
  referenceAudioPath?: string;
  promptAudioPath?: string;
  promptTextPath?: string;
}>;
type Provider = { id: string; voiceProfiles: VoiceProfile[] };
export type EditableTtsConfig = {
  audioDefaults?: {
    globalBgm: null | { sourcePath: string; volume: number };
  };
  tts: {
    defaultProviderId: string;
    defaultVoiceProfileId: string;
    providers: Provider[];
  };
};

export const COMMON_RENDER_SIZES = [
  { width: 1080, height: 1920, label: "竖屏 9:16 · 1080 × 1920" },
  { width: 1920, height: 1080, label: "横屏 16:9 · 1920 × 1080" },
  { width: 1080, height: 1350, label: "竖版 4:5 · 1080 × 1350" },
  { width: 1080, height: 1080, label: "方形 1:1 · 1080 × 1080" },
] as const;

export const renderSizeValue = (size: {
  readonly width: number;
  readonly height: number;
}) => `${size.width}x${size.height}`;

export const parseRenderSize = (value: string) => {
  const match = /^(\d+)x(\d+)$/u.exec(value);
  const width = Number(match?.[1]);
  const height = Number(match?.[2]);
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error(
      "Render size must contain positive integer width and height.",
    );
  }
  return { width, height } as const;
};

export const isRepositoryRelativeFilePath = (value: string) => {
  const segments = value.split("/");
  return (
    value.trim() === value &&
    value.length > 0 &&
    value.length <= 512 &&
    !value.startsWith("/") &&
    !/^[A-Za-z]:[\\/]/u.test(value) &&
    !value.includes("\\") &&
    !value.includes("://") &&
    segments.every(
      (segment) => segment !== "" && segment !== "." && segment !== "..",
    )
  );
};

export const nextUniqueId = (
  prefix: string,
  existingIds: readonly string[],
) => {
  const existing = new Set(existingIds);
  for (let index = 1; ; index += 1) {
    const candidate = `${prefix}-${index}`;
    if (!existing.has(candidate)) return candidate;
  }
};

const requireProvider = (config: EditableTtsConfig, providerId: string) => {
  const provider = config.tts.providers.find(({ id }) => id === providerId);
  if (provider === undefined || provider.voiceProfiles.length === 0) {
    throw new Error(
      "The selected provider must have at least one voice profile.",
    );
  }
  return provider;
};

export const selectProviderAndVoice = (
  config: EditableTtsConfig,
  providerId: string,
) => {
  const provider = requireProvider(config, providerId);
  config.tts.defaultProviderId = provider.id;
  config.tts.defaultVoiceProfileId = provider.voiceProfiles[0]!.id;
};

export const removeVoiceProfile = (
  config: EditableTtsConfig,
  providerId: string,
  voiceProfileId: string,
) => {
  const provider = requireProvider(config, providerId);
  if (provider.voiceProfiles.length === 1) {
    throw new Error("A provider must keep at least one voice profile.");
  }
  provider.voiceProfiles = provider.voiceProfiles.filter(
    ({ id }) => id !== voiceProfileId,
  );
  if (
    config.tts.defaultProviderId === providerId &&
    config.tts.defaultVoiceProfileId === voiceProfileId
  ) {
    config.tts.defaultVoiceProfileId = provider.voiceProfiles[0]!.id;
  }
};

export const getConfigConsistencyError = (
  config: EditableTtsConfig & {
    publishingCollections: readonly Readonly<{ id: string }>[];
  },
) => {
  const duplicate = (values: readonly string[]) =>
    new Set(values).size !== values.length;
  if (duplicate(config.publishingCollections.map(({ id }) => id))) {
    return "合集 ID 必须唯一。";
  }
  if (duplicate(config.tts.providers.map(({ id }) => id))) {
    return "Provider ID 必须唯一。";
  }
  for (const provider of config.tts.providers) {
    if (duplicate(provider.voiceProfiles.map(({ id }) => id))) {
      return `Provider ${provider.id} 的声线 ID 必须唯一。`;
    }
    for (const profile of provider.voiceProfiles) {
      const paths = [
        profile.referenceAudioPath,
        profile.promptAudioPath,
        profile.promptTextPath,
      ].filter((value): value is string => value !== undefined);
      if (paths.some((path) => !isRepositoryRelativeFilePath(path))) {
        return `声线 ${profile.id} 的文件必须使用仓库相对路径。`;
      }
    }
  }
  const bgm = config.audioDefaults?.globalBgm;
  if (bgm !== null && bgm !== undefined) {
    if (!isRepositoryRelativeFilePath(bgm.sourcePath)) {
      return "全局 BGM 文件必须使用仓库相对路径。";
    }
    if (!Number.isFinite(bgm.volume) || bgm.volume < 0 || bgm.volume > 1) {
      return "全局 BGM 音量必须在 0 到 1 之间。";
    }
  }
  const provider = config.tts.providers.find(
    ({ id }) => id === config.tts.defaultProviderId,
  );
  if (provider === undefined) return "默认 Provider 不存在。";
  if (
    !provider.voiceProfiles.some(
      ({ id }) => id === config.tts.defaultVoiceProfileId,
    )
  ) {
    return "默认声线必须属于默认 Provider。";
  }
  return null;
};

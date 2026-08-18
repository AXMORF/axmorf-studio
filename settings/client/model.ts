import { getEdgeTtsVoiceDefinition } from "../../src/contracts/tts-provider-registry";

type VoiceProfile = Readonly<{
  id: string;
  voiceId?: string;
  source?: "catalog" | "remote-clone" | "remote-designed";
  locale?: string;
  referenceAudioPath?: string;
  promptAudioPath?: string;
  promptTextPath?: string;
}>;
type Provider = {
  id: string;
  kind?: "voxcpm" | "speech-sdk" | "edge-tts";
  voiceProfiles: VoiceProfile[];
  connection?:
    | { apiKey?: string; groupId?: string }
    | { baseUrl?: string; token?: string }
    | { timeoutMs?: number };
};
export type EditableTtsConfig = {
  sceneDefaults?: {
    introSceneTemplateId: string | null;
    outroSceneTemplateId: string | null;
  };
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

export const projectDeletionErrorMessage = (error: unknown) => {
  if (error instanceof TypeError && error.message === "Failed to fetch") {
    return "删除请求连接中断，Project 可能已经删除；请重新启动本地开发服务或刷新页面确认。";
  }
  return error instanceof Error ? error.message : "Project 删除结果未知";
};

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

export const removeProvider = (
  config: EditableTtsConfig,
  providerId: string,
) => {
  if (config.tts.providers.length === 1) {
    throw new Error("TTS configuration must keep at least one provider.");
  }
  const remaining = config.tts.providers.filter(({ id }) => id !== providerId);
  if (remaining.length === config.tts.providers.length) {
    throw new Error("The selected provider does not exist.");
  }
  config.tts.providers = remaining;
  if (config.tts.defaultProviderId === providerId) {
    selectProviderAndVoice(config, remaining[0]!.id);
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
  for (const templateId of [
    config.sceneDefaults?.introSceneTemplateId,
    config.sceneDefaults?.outroSceneTemplateId,
  ]) {
    if (
      templateId !== null &&
      templateId !== undefined &&
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(templateId)
    ) {
      return "默认 Scene 模板 ID 格式无效。";
    }
  }
  if (duplicate(config.tts.providers.map(({ id }) => id))) {
    return "Provider ID 必须唯一。";
  }
  if (config.tts.providers.length === 0) {
    return "至少保留一个 TTS Provider。";
  }
  for (const provider of config.tts.providers) {
    if (provider.voiceProfiles.length === 0) {
      return `Provider ${provider.id} 必须至少保留一个声线。`;
    }
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
      if (
        provider.kind === "speech-sdk" &&
        (profile.voiceId === undefined || profile.voiceId.trim() === "")
      ) {
        return `声线 ${profile.id} 必须配置云端 Voice ID。`;
      }
      if (provider.kind === "edge-tts") {
        const definition =
          profile.voiceId === undefined
            ? undefined
            : getEdgeTtsVoiceDefinition(profile.voiceId);
        if (definition === undefined) {
          return `声线 ${profile.id} 必须选择本项目支持的 Edge 声线。`;
        }
        if (profile.locale !== definition.locale) {
          return `声线 ${profile.id} 的 Locale 与 Edge 声线不一致。`;
        }
      }
    }
    if (
      provider.kind === "speech-sdk" &&
      (provider.connection === undefined ||
        !("apiKey" in provider.connection) ||
        provider.connection.apiKey === undefined ||
        provider.connection.apiKey.trim() === "")
    ) {
      return `Provider ${provider.id} 必须配置 API Key。`;
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

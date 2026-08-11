type VoiceProfile = Readonly<{ id: string }>;
type Provider = { id: string; voiceProfiles: VoiceProfile[] };
export type EditableTtsConfig = {
  tts: {
    defaultProviderId: string;
    defaultVoiceProfileId: string;
    providers: Provider[];
  };
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

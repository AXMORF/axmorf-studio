import { randomUUID } from "node:crypto";
import {
  chmod,
  link,
  mkdir,
  open,
  readFile,
  rename,
  unlink,
} from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { parseEnv } from "node:util";

import {
  ProducerConfigSchema,
  buildProducerConfig,
  createFingerprint,
  type ProducerConfig,
  type TtsProviderConfig,
  type VoxcpmProviderConfig,
} from "@axmorf/studio/contracts";
import type { VoxcpmPrivateConfig } from "../narration/adapters/private-config";

export const DEFAULT_PRODUCER_CONFIG_REPOSITORY_PATH =
  "private/producer.config.json" as const;

export const resolveProducerConfigPath = ({
  rootDir,
  env,
}: {
  readonly rootDir: string;
  readonly env: Readonly<Record<string, string | undefined>>;
}) => {
  const configuredPath = env.RSP_PRODUCER_CONFIG;
  if (configuredPath === undefined || configuredPath.trim() === "") {
    return join(rootDir, DEFAULT_PRODUCER_CONFIG_REPOSITORY_PATH);
  }
  return isAbsolute(configuredPath)
    ? configuredPath
    : resolve(rootDir, configuredPath);
};

export const loadProducerConfigEnvironment = async ({
  rootDir,
  env,
}: {
  readonly rootDir: string;
  readonly env: Readonly<Record<string, string | undefined>>;
}) => {
  if (env.RSP_PRODUCER_CONFIG !== undefined) return env;
  let source: string;
  try {
    source = await readFile(join(rootDir, ".env"), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return env;
    throw new Error("Repository .env is unreadable.", { cause: error });
  }
  let parsed: NodeJS.Dict<string>;
  try {
    parsed = parseEnv(source);
  } catch (error) {
    throw new Error("Repository .env is malformed.", { cause: error });
  }
  const configuredPath = parsed.RSP_PRODUCER_CONFIG;
  return configuredPath === undefined
    ? env
    : { ...env, RSP_PRODUCER_CONFIG: configuredPath };
};

export const resolveProducerConfigPathFromEnvironment = async ({
  rootDir,
  env,
}: {
  readonly rootDir: string;
  readonly env: Readonly<Record<string, string | undefined>>;
}) =>
  resolveProducerConfigPath({
    rootDir,
    env: await loadProducerConfigEnvironment({ rootDir, env }),
  });

export const readProducerConfig = async ({
  configPath,
}: {
  readonly configPath: string;
}): Promise<ProducerConfig> => {
  if (!isAbsolute(configPath)) {
    throw new Error("Producer config path must be absolute.");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(configPath, "utf8"));
  } catch (error) {
    throw new Error("Producer config is missing, malformed, or unreadable.", {
      cause: error,
    });
  }
  const assertLegacyVoxcpmProviders = (legacy: Record<string, unknown>) => {
    const tts = legacy.tts;
    const providers =
      tts !== null && typeof tts === "object" && !Array.isArray(tts)
        ? (tts as Record<string, unknown>).providers
        : undefined;
    if (
      !Array.isArray(providers) ||
      providers.some(
        (provider) =>
          provider === null ||
          typeof provider !== "object" ||
          Array.isArray(provider) ||
          (provider as Record<string, unknown>).kind !== "voxcpm",
      )
    ) {
      throw new Error(
        "Legacy Producer config contains an unsupported provider.",
      );
    }
  };
  if (
    raw !== null &&
    typeof raw === "object" &&
    !Array.isArray(raw) &&
    (raw as Record<string, unknown>).schemaVersion === 1 &&
    (raw as Record<string, unknown>).contractVersion === "producer-config-v1"
  ) {
    const legacy = { ...(raw as Record<string, unknown>) };
    const allowedKeys = new Set([
      "schemaVersion",
      "contractVersion",
      "renderDefaults",
      "readability",
      "audioDefaults",
      "publishingCollections",
      "tts",
      "configFingerprint",
    ]);
    if (Object.keys(legacy).some((key) => !allowedKeys.has(key))) {
      throw new Error("Producer config v1 contains unknown fields.");
    }
    const fingerprint = legacy.configFingerprint;
    delete legacy.configFingerprint;
    const expectedFingerprint = createFingerprint({
      namespace: "producer-config",
      version: 1,
      value: legacy,
    });
    if (fingerprint !== expectedFingerprint) {
      throw new Error("Producer config v1 fingerprint is stale.");
    }
    assertLegacyVoxcpmProviders(legacy);
    delete legacy.schemaVersion;
    delete legacy.contractVersion;
    return buildProducerConfig({
      ...legacy,
      schemaVersion: 4,
      contractVersion: "producer-config-v4",
      sceneDefaults: {
        introSceneTemplateId: "axmorf-brand-reveal-v1",
        outroSceneTemplateId: "axmorf-source-follow-v1",
      },
    });
  }
  if (
    raw !== null &&
    typeof raw === "object" &&
    !Array.isArray(raw) &&
    (raw as Record<string, unknown>).schemaVersion === 2 &&
    (raw as Record<string, unknown>).contractVersion === "producer-config-v2"
  ) {
    const legacy = { ...(raw as Record<string, unknown>) };
    const fingerprint = legacy.configFingerprint;
    delete legacy.configFingerprint;
    const expectedFingerprint = createFingerprint({
      namespace: "producer-config",
      version: 2,
      value: legacy,
    });
    if (fingerprint !== expectedFingerprint) {
      throw new Error("Producer config v2 fingerprint is stale.");
    }
    assertLegacyVoxcpmProviders(legacy);
    return buildProducerConfig({
      ...legacy,
      schemaVersion: 4,
      contractVersion: "producer-config-v4",
    });
  }
  if (
    raw !== null &&
    typeof raw === "object" &&
    !Array.isArray(raw) &&
    (raw as Record<string, unknown>).schemaVersion === 3 &&
    (raw as Record<string, unknown>).contractVersion === "producer-config-v3"
  ) {
    const legacy = { ...(raw as Record<string, unknown>) };
    const fingerprint = legacy.configFingerprint;
    delete legacy.configFingerprint;
    const expectedFingerprint = createFingerprint({
      namespace: "producer-config",
      version: 3,
      value: legacy,
    });
    if (fingerprint !== expectedFingerprint) {
      throw new Error("Producer config v3 fingerprint is stale.");
    }
    const tts = legacy.tts as Record<string, unknown> | undefined;
    const providers = tts?.providers;
    if (!Array.isArray(providers)) {
      throw new Error("Producer config v3 providers are unavailable.");
    }
    const migratedProviders = providers.map((provider) => {
      if (
        provider === null ||
        typeof provider !== "object" ||
        Array.isArray(provider)
      ) {
        throw new Error("Producer config v3 contains an invalid provider.");
      }
      const record = provider as Record<string, unknown>;
      if (record.kind === "voxcpm") return record;
      if (
        record.kind !== "speech-sdk" ||
        record.vendor !== "openai" ||
        record.modelId !== "gpt-4o-mini-tts"
      ) {
        throw new Error("Producer config v3 contains an unsupported provider.");
      }
      if (!Array.isArray(record.voiceProfiles)) {
        throw new Error("Producer config v3 voice profiles are unavailable.");
      }
      return {
        ...record,
        voiceProfiles: record.voiceProfiles.map((profile) => {
          const profileRecord = profile as Record<string, unknown>;
          if (Object.hasOwn(profileRecord, "source")) {
            throw new Error("Producer config v3 contains unknown fields.");
          }
          return { ...profileRecord, source: "catalog" };
        }),
      };
    });
    return buildProducerConfig({
      ...legacy,
      schemaVersion: 4,
      contractVersion: "producer-config-v4",
      tts: { ...tts, providers: migratedProviders },
    });
  }
  return ProducerConfigSchema.parse(raw);
};

export const writeProducerConfig = async ({
  configPath,
  value,
  overwrite = true,
}: {
  readonly configPath: string;
  readonly value: unknown;
  readonly overwrite?: boolean;
}) => {
  if (!isAbsolute(configPath)) {
    throw new Error("Producer config path must be absolute.");
  }
  const record = { ...(value as Record<string, unknown>) };
  delete record.configFingerprint;
  const config = buildProducerConfig(record);
  await mkdir(dirname(configPath), { recursive: true, mode: 0o700 });
  const temporaryPath = `${configPath}.${randomUUID()}.tmp`;
  const handle = await open(temporaryPath, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(config, null, 2)}\n`, "utf8");
    await handle.sync();
  } catch (error) {
    await handle.close();
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
  await handle.close();
  try {
    if (overwrite) {
      await rename(temporaryPath, configPath);
    } else {
      await link(temporaryPath, configPath);
      await unlink(temporaryPath);
    }
    await chmod(configPath, 0o600);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    if (!overwrite && (error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(
        "Producer config already exists; migration refused to overwrite it.",
        {
          cause: error,
        },
      );
    }
    throw error;
  }
  return config;
};

export const resolveDefaultTtsProvider = (
  config: ProducerConfig,
): TtsProviderConfig => {
  const matches = config.tts.providers.filter(
    ({ id }) => id === config.tts.defaultProviderId,
  );
  if (matches.length !== 1) {
    throw new Error("Default TTS provider is unavailable.");
  }
  return matches[0] as TtsProviderConfig;
};

export const toVoxcpmPrivateConfig = (
  provider: VoxcpmProviderConfig,
  rootDir: string,
): VoxcpmPrivateConfig => ({
  schemaVersion: 2,
  baseUrl: provider.connection.baseUrl,
  ...(provider.connection.token === undefined
    ? {}
    : { token: provider.connection.token }),
  timeoutMs: provider.connection.timeoutMs,
  modelId: provider.modelId,
  endpointPath: provider.routes.controllableClone,
  parameters: provider.parameters,
  voiceProfiles: provider.voiceProfiles.map((profile) => {
    const { name: _name, ...runtimeProfile } = profile;
    void _name;
    return runtimeProfile.mode === "controllable-clone"
      ? {
          ...runtimeProfile,
          referenceAudioPath: isAbsolute(runtimeProfile.referenceAudioPath)
            ? runtimeProfile.referenceAudioPath
            : resolve(rootDir, runtimeProfile.referenceAudioPath),
        }
      : {
          ...runtimeProfile,
          promptAudioPath: isAbsolute(runtimeProfile.promptAudioPath)
            ? runtimeProfile.promptAudioPath
            : resolve(rootDir, runtimeProfile.promptAudioPath),
          promptTextPath: isAbsolute(runtimeProfile.promptTextPath)
            ? runtimeProfile.promptTextPath
            : resolve(rootDir, runtimeProfile.promptTextPath),
        };
  }),
});

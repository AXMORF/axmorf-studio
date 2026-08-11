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
import { dirname, isAbsolute, join } from "node:path";

import {
  ProducerConfigSchema,
  buildProducerConfig,
  type ProducerConfig,
  type VoxcpmProviderConfig,
} from "../../src/contracts";
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
  return configuredPath === undefined || configuredPath.trim() === ""
    ? join(rootDir, DEFAULT_PRODUCER_CONFIG_REPOSITORY_PATH)
    : configuredPath;
};

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
): VoxcpmProviderConfig => {
  const matches = config.tts.providers.filter(
    ({ id }) => id === config.tts.defaultProviderId,
  );
  if (matches.length !== 1) {
    throw new Error("Default TTS provider is unavailable.");
  }
  return matches[0] as VoxcpmProviderConfig;
};

export const toVoxcpmPrivateConfig = (
  provider: VoxcpmProviderConfig,
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
    return runtimeProfile;
  }),
});

import { z } from "zod";

import { buildProducerConfig } from "../../src/contracts";
import { DEFAULT_EXECUTION_PREFERENCES } from "../../settings/contracts/execution-preferences";
import {
  DesktopSettingsErrorSchema,
  DesktopSettingsSaveRequestSchema,
  DesktopSettingsSnapshotSchema,
  createDefaultDesktopProducerConfigDraft,
  createDesktopPrivateConfig,
  type DesktopPrivateConfig,
  type DesktopProducerConfigDraft,
  type DesktopSettingsError,
  type DesktopSettingsSaveRequest,
  type DesktopSettingsSnapshot,
} from "../contracts/settings";

export class DesktopSettingsSecureStoreError extends Error {
  readonly operation: "read" | "write";

  constructor(operation: "read" | "write", options?: ErrorOptions) {
    super(`desktop-settings-secure-store-${operation}-failed`, options);
    this.name = "DesktopSettingsSecureStoreError";
    this.operation = operation;
  }
}

const issuePath = (path: readonly PropertyKey[]) =>
  path.reduce<string>((result, segment) => {
    if (typeof segment === "number") return `${result}[${segment}]`;
    const value = String(segment);
    return result === "$" ? `$.${value}` : `${result}.${value}`;
  }, "$" as string);

const issueCode = (code: string) =>
  `settings-${code.replaceAll("_", "-")}`.replace(
    /[^a-z0-9-]/gu,
    "-",
  );

export const desktopSettingsIssues = (error: z.ZodError) =>
  error.issues.slice(0, 50).map((issue) => ({
    path: issuePath(issue.path),
    code: issueCode(issue.code),
    message:
      issue.code === "unrecognized_keys"
        ? "包含严格配置合同不允许的字段。"
        : issue.message,
  }));

const redactProducerConfig = (
  privateConfig: DesktopPrivateConfig,
): Readonly<{
  config: DesktopProducerConfigDraft;
  secrets: DesktopSettingsSnapshot["secrets"];
}> => {
  const config = structuredClone(
    privateConfig.producerConfig,
  ) as unknown as DesktopProducerConfigDraft & {
    configFingerprint?: string;
  };
  delete config.configFingerprint;
  const secrets: Array<DesktopSettingsSnapshot["secrets"][number]> = [];
  for (const provider of config.tts.providers) {
    if (provider.kind === "voxcpm") {
      secrets.push({
        providerId: provider.id,
        field: "token",
        configured:
          typeof provider.connection.token === "string" &&
          provider.connection.token.length > 0,
      });
      delete provider.connection.token;
    } else if (provider.kind === "speech-sdk") {
      secrets.push({
        providerId: provider.id,
        field: "apiKey",
        configured: provider.connection.apiKey.length > 0,
      });
      provider.connection.apiKey = "";
    }
  }
  return { config, secrets };
};

export const createDesktopSettingsSnapshot = ({
  privateConfig,
  status = privateConfig === null ? "not-configured" : "ready",
}: {
  readonly privateConfig: DesktopPrivateConfig | null;
  readonly status?: DesktopSettingsSnapshot["status"];
}): DesktopSettingsSnapshot => {
  const redacted =
    privateConfig === null
      ? { config: createDefaultDesktopProducerConfigDraft(), secrets: [] }
      : redactProducerConfig(privateConfig);
  return DesktopSettingsSnapshotSchema.parse({
    schemaVersion: 1,
    status,
    ...redacted,
    executionPreferences:
      privateConfig?.executionPreferences ?? DEFAULT_EXECUTION_PREFERENCES,
    deliveryPolicy: privateConfig?.deliveryPolicy ?? "manual",
  });
};

const recordValue = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

export const mergeDesktopSettingsSaveRequest = ({
  current,
  request: rawRequest,
}: {
  readonly current: DesktopPrivateConfig | null;
  readonly request: DesktopSettingsSaveRequest;
}): DesktopPrivateConfig => {
  const request = DesktopSettingsSaveRequestSchema.parse(rawRequest);
  const config = structuredClone(request.config);
  const configRecord = recordValue(config);
  const tts = recordValue(configRecord?.tts);
  const providers = tts?.providers;
  if (!Array.isArray(providers)) {
    return createDesktopPrivateConfig({
      producerConfig: buildProducerConfig(config),
      executionPreferences: request.executionPreferences,
      deliveryPolicy: request.deliveryPolicy,
    });
  }
  const cleared = new Set(
    request.clearedSecrets.map(
      ({ providerId, field }) => `${providerId}:${field}`,
    ),
  );
  const currentProviders = new Map(
    current?.producerConfig.tts.providers.map((provider) => [
      provider.id,
      provider,
    ]) ?? [],
  );
  for (const rawProvider of providers) {
    const provider = recordValue(rawProvider);
    const connection = recordValue(provider?.connection);
    if (
      provider === null ||
      connection === null ||
      typeof provider.id !== "string"
    ) {
      continue;
    }
    const previous = currentProviders.get(provider.id);
    if (provider.kind === "voxcpm") {
      const identity = `${provider.id}:token`;
      const nextToken = connection.token;
      if (cleared.has(identity)) {
        delete connection.token;
      } else if (
        typeof nextToken !== "string" ||
        nextToken.trim().length === 0
      ) {
        if (previous?.kind === "voxcpm" && previous.connection.token) {
          connection.token = previous.connection.token;
        } else {
          delete connection.token;
        }
      }
    } else if (provider.kind === "speech-sdk") {
      const nextApiKey = connection.apiKey;
      if (
        (typeof nextApiKey !== "string" ||
          nextApiKey.trim().length === 0) &&
        !cleared.has(`${provider.id}:apiKey`) &&
        previous?.kind === "speech-sdk"
      ) {
        connection.apiKey = previous.connection.apiKey;
      }
    }
  }
  return createDesktopPrivateConfig({
    producerConfig: buildProducerConfig(config),
    executionPreferences: request.executionPreferences,
    deliveryPolicy: request.deliveryPolicy,
  });
};

export const desktopSettingsError = ({
  code,
  message,
  action,
  error,
}: {
  readonly code: string;
  readonly message: string;
  readonly action: string;
  readonly error?: unknown;
}): DesktopSettingsError =>
  DesktopSettingsErrorSchema.parse({
    code,
    message,
    action,
    issues: error instanceof z.ZodError ? desktopSettingsIssues(error) : [],
  });

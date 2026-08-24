import { z } from "zod";

import {
  DeliveryPolicySchema,
  ProducerConfigInputSchema,
  ProducerConfigSchema,
  type ProducerConfig,
} from "../../src/contracts";
import {
  DEFAULT_EXECUTION_PREFERENCES,
  ExecutionPreferencesSchema,
  type ExecutionPreferences,
} from "../../settings/contracts/execution-preferences";

export const DESKTOP_PRIVATE_CONFIG_VERSION =
  "desktop-private-config-v1" as const;

type DeepMutable<Value> = Value extends
  | string
  | number
  | boolean
  | bigint
  | symbol
  | null
  | undefined
  ? Value
  : Value extends readonly (infer Item)[]
    ? DeepMutable<Item>[]
    : Value extends object
      ? { -readonly [Key in keyof Value]: DeepMutable<Value[Key]> }
      : Value;

export type DesktopProducerConfigDraft = DeepMutable<
  z.input<typeof ProducerConfigInputSchema>
>;

export const createDefaultDesktopProducerConfigDraft =
  (): DesktopProducerConfigDraft => ({
    schemaVersion: 4,
    contractVersion: "producer-config-v4",
    renderDefaults: {
      width: 1080,
      height: 1920,
      fps: 30,
      locale: "zh-CN",
    },
    readability: { edgeInsetPx: 90 },
    sceneDefaults: {
      introSceneTemplateId: "axmorf-brand-reveal-v1",
      outroSceneTemplateId: "axmorf-source-follow-v1",
    },
    audioDefaults: { globalBgm: null },
    publishingCollections: [
      {
        id: "default",
        name: "默认合集",
        description: "尚未归入更具体合集的视频。",
      },
    ],
    tts: {
      defaultProviderId: "edge-tts",
      defaultVoiceProfileId: "zh-cn-xiaoxiao",
      speech: { rate: 1, targetLoudnessLufs: -16 },
      providers: [
        {
          id: "edge-tts",
          kind: "edge-tts",
          service: "microsoft-edge-read-aloud",
          name: "Edge 免费在线 TTS",
          connection: { timeoutMs: 60_000 },
          modelId: "edge-read-aloud",
          voiceProfiles: [
            {
              id: "zh-cn-xiaoxiao",
              name: "晓晓",
              voiceId: "zh-CN-XiaoxiaoNeural",
              locale: "zh-CN",
            },
          ],
        },
      ],
    },
  });

export const DesktopPrivateConfigSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    contractVersion: z.literal(DESKTOP_PRIVATE_CONFIG_VERSION),
    producerConfig: ProducerConfigSchema,
    executionPreferences: ExecutionPreferencesSchema,
    deliveryPolicy: DeliveryPolicySchema,
  })
  .readonly();

export type DesktopPrivateConfig = z.infer<
  typeof DesktopPrivateConfigSchema
>;

export const createDesktopPrivateConfig = ({
  producerConfig,
  executionPreferences = DEFAULT_EXECUTION_PREFERENCES,
  deliveryPolicy = "manual",
}: {
  readonly producerConfig: ProducerConfig;
  readonly executionPreferences?: ExecutionPreferences;
  readonly deliveryPolicy?: "manual" | "automatic";
}): DesktopPrivateConfig =>
  DesktopPrivateConfigSchema.parse({
    schemaVersion: 1,
    contractVersion: DESKTOP_PRIVATE_CONFIG_VERSION,
    producerConfig,
    executionPreferences,
    deliveryPolicy,
  });

export const DesktopSecretFieldSchema = z.enum(["token", "apiKey"]);

export const DesktopSecretStateSchema = z
  .strictObject({
    providerId: z.string().min(1).max(96),
    field: DesktopSecretFieldSchema,
    configured: z.boolean(),
  })
  .readonly();

export type DesktopSecretState = z.infer<typeof DesktopSecretStateSchema>;

const DesktopClearedSecretSchema = z
  .strictObject({
    providerId: z.string().min(1).max(96),
    field: DesktopSecretFieldSchema,
  })
  .readonly();

export const DesktopSettingsSaveRequestSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    config: z.unknown(),
    executionPreferences: ExecutionPreferencesSchema,
    deliveryPolicy: DeliveryPolicySchema,
    clearedSecrets: z.array(DesktopClearedSecretSchema).max(20).readonly(),
  })
  .superRefine((request, context) => {
    const identities = request.clearedSecrets.map(
      ({ providerId, field }) => `${providerId}:${field}`,
    );
    if (new Set(identities).size !== identities.length) {
      context.addIssue({
        code: "custom",
        message: "Secret clear requests must be unique.",
        path: ["clearedSecrets"],
      });
    }
  })
  .readonly();

export type DesktopSettingsSaveRequest = z.infer<
  typeof DesktopSettingsSaveRequestSchema
>;

const DesktopSettingsSnapshotEnvelopeSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    status: z.enum(["ready", "not-configured", "unavailable"]),
    config: z.unknown(),
    executionPreferences: ExecutionPreferencesSchema,
    deliveryPolicy: DeliveryPolicySchema,
    secrets: z.array(DesktopSecretStateSchema).max(20).readonly(),
  })
  .readonly();

export type DesktopSettingsSnapshot = Readonly<{
  schemaVersion: 1;
  status: "ready" | "not-configured" | "unavailable";
  config: DesktopProducerConfigDraft;
  executionPreferences: ExecutionPreferences;
  deliveryPolicy: "manual" | "automatic";
  secrets: readonly DesktopSecretState[];
}>;

export const DesktopSettingsSnapshotSchema =
  DesktopSettingsSnapshotEnvelopeSchema.superRefine((snapshot, context) => {
    if (
      snapshot.config === null ||
      typeof snapshot.config !== "object" ||
      Array.isArray(snapshot.config)
    ) {
      context.addIssue({
        code: "custom",
        message: "Desktop settings config must be an object.",
        path: ["config"],
      });
      return;
    }
    const candidate = structuredClone(snapshot.config) as Record<
      string,
      unknown
    >;
    const tts = candidate.tts as Record<string, unknown> | undefined;
    const providers = tts?.providers;
    if (Array.isArray(providers)) {
      for (const [providerIndex, provider] of providers.entries()) {
        if (
          provider === null ||
          typeof provider !== "object" ||
          Array.isArray(provider)
        ) {
          continue;
        }
        const record = provider as Record<string, unknown>;
        const connection = record.connection;
        if (
          connection === null ||
          typeof connection !== "object" ||
          Array.isArray(connection)
        ) {
          continue;
        }
        const connectionRecord = connection as Record<string, unknown>;
        if (
          record.kind === "voxcpm" &&
          Object.hasOwn(connectionRecord, "token")
        ) {
          context.addIssue({
            code: "custom",
            message: "Desktop settings snapshots must not echo Provider tokens.",
            path: [
              "config",
              "tts",
              "providers",
              providerIndex,
              "connection",
              "token",
            ],
          });
        }
        if (
          record.kind !== "speech-sdk" ||
          typeof record.id !== "string"
        ) {
          continue;
        }
        if (
          connectionRecord.apiKey !== ""
        ) {
          context.addIssue({
            code: "custom",
            message: "Desktop settings snapshots must not echo API keys.",
            path: [
              "config",
              "tts",
              "providers",
              providerIndex,
              "connection",
              "apiKey",
            ],
          });
          continue;
        }
        if (
          snapshot.secrets.some(
            (secret) =>
              secret.providerId === record.id &&
              secret.field === "apiKey" &&
              secret.configured,
          )
        ) {
          connectionRecord.apiKey = "desktop-write-only-secret";
        }
      }
    }
    const parsed = ProducerConfigInputSchema.safeParse(candidate);
    if (!parsed.success) {
      for (const issue of parsed.error.issues.slice(0, 50)) {
        context.addIssue({
          code: "custom",
          message: issue.message,
          path: ["config", ...issue.path],
        });
      }
    }
  }) as z.ZodType<DesktopSettingsSnapshot>;

export const DesktopSettingsIssueSchema = z
  .strictObject({
    path: z.string().min(1).max(512),
    code: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
    message: z.string().min(1).max(500),
  })
  .readonly();

export const DesktopSettingsErrorSchema = z
  .strictObject({
    code: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
    message: z.string().min(1).max(500),
    action: z.string().min(1).max(500),
    issues: z.array(DesktopSettingsIssueSchema).max(50).readonly(),
  })
  .readonly();

export type DesktopSettingsError = z.infer<typeof DesktopSettingsErrorSchema>;

export const DesktopSettingsSaveResultSchema = z.discriminatedUnion("ok", [
  z
    .strictObject({
      ok: z.literal(true),
      settings: DesktopSettingsSnapshotSchema,
    })
    .readonly(),
  z
    .strictObject({
      ok: z.literal(false),
      error: DesktopSettingsErrorSchema,
    })
    .readonly(),
]);

export type DesktopSettingsSaveResult = z.infer<
  typeof DesktopSettingsSaveResultSchema
>;

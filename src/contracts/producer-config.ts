import { z } from "zod";

import { createFingerprint } from "./fingerprint";
import {
  PositiveIntegerSchema,
  Sha256DigestSchema,
  VoiceProfileIdSchema,
} from "./primitives";

export const PRODUCER_CONFIG_VERSION = "producer-config-v1" as const;

export const ProducerConfigIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(96)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);

const CanonicalLocaleSchema = z.string().refine((value) => {
  try {
    return Intl.getCanonicalLocales(value)[0] === value;
  } catch {
    return false;
  }
}, "locale must be a canonical BCP 47 language tag");

const HttpUrlSchema = z.string().refine(
  (value) => {
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  },
  { message: "baseUrl must be a valid HTTP URL." },
);

export const RepositoryRelativeFilePathSchema = z
  .string()
  .trim()
  .min(1)
  .max(512)
  .refine((value) => {
    const segments = value.split("/");
    return (
      !value.startsWith("/") &&
      !/^[A-Za-z]:[\\/]/u.test(value) &&
      !value.includes("\\") &&
      !value.includes("://") &&
      segments.every(
        (segment) => segment !== "" && segment !== "." && segment !== "..",
      )
    );
  }, "File paths must be normalized repository-relative paths.");

export const PublishingCollectionSchema = z
  .object({
    id: ProducerConfigIdSchema,
    name: z.string().trim().min(1).max(96),
    description: z.string().trim().min(1).max(500),
  })
  .strict()
  .readonly();

const ControllableCloneProfileSchema = z
  .object({
    id: VoiceProfileIdSchema,
    name: z.string().trim().min(1).max(96),
    mode: z.literal("controllable-clone"),
    referenceAudioPath: RepositoryRelativeFilePathSchema,
    controlInstruction: z.string().trim().min(1),
  })
  .strict()
  .readonly();

const HighFidelityCloneProfileSchema = z
  .object({
    id: VoiceProfileIdSchema,
    name: z.string().trim().min(1).max(96),
    mode: z.literal("high-fidelity-clone"),
    promptAudioPath: RepositoryRelativeFilePathSchema,
    promptTextPath: RepositoryRelativeFilePathSchema,
    promptTranscriptConfirmed: z.literal(true),
  })
  .strict()
  .readonly();

export const VoxcpmVoiceProfileSchema = z.discriminatedUnion("mode", [
  ControllableCloneProfileSchema,
  HighFidelityCloneProfileSchema,
]);

export const VoxcpmProviderConfigSchema = z
  .object({
    id: ProducerConfigIdSchema,
    kind: z.literal("voxcpm"),
    name: z.string().trim().min(1).max(96),
    connection: z
      .object({
        baseUrl: HttpUrlSchema,
        token: z.string().trim().min(1).optional(),
        timeoutMs: z.number().int().positive().safe(),
      })
      .strict()
      .readonly(),
    modelId: z.string().trim().min(1),
    routes: z
      .object({
        controllableClone: z.literal("/clone"),
        highFidelityClone: z.literal("/clone_with_prompt"),
      })
      .strict()
      .readonly(),
    parameters: z
      .object({
        cfgValue: z.number().finite().min(1).max(3),
        inferenceTimesteps: z.number().int().min(4).max(30),
        minLen: z.number().int().min(1).max(8192),
        maxLen: z.number().int().min(2).max(8192),
        normalize: z.boolean(),
        denoise: z.boolean(),
        retryBadcase: z.boolean(),
        retryBadcaseMaxTimes: z.number().int().min(0).max(10),
        retryBadcaseRatioThreshold: z.number().finite().positive(),
      })
      .strict()
      .superRefine((parameters, context) => {
        if (parameters.minLen > parameters.maxLen) {
          context.addIssue({
            code: "custom",
            message: "minLen must not exceed maxLen.",
            path: ["minLen"],
          });
        }
      })
      .readonly(),
    voiceProfiles: z.array(VoxcpmVoiceProfileSchema).min(1).readonly(),
  })
  .strict()
  .superRefine((provider, context) => {
    const ids = new Set<string>();
    provider.voiceProfiles.forEach((profile, index) => {
      if (ids.has(profile.id)) {
        context.addIssue({
          code: "custom",
          message: "Voice profile IDs must be unique within a provider.",
          path: ["voiceProfiles", index, "id"],
        });
      }
      ids.add(profile.id);
    });
  })
  .readonly();

const ProducerConfigInputObject = z
  .object({
    schemaVersion: z.literal(1),
    contractVersion: z.literal(PRODUCER_CONFIG_VERSION),
    renderDefaults: z
      .object({
        width: PositiveIntegerSchema,
        height: PositiveIntegerSchema,
        fps: PositiveIntegerSchema.max(120),
        locale: CanonicalLocaleSchema,
      })
      .strict()
      .superRefine((render, context) => {
        if (render.width % 2 !== 0 || render.height % 2 !== 0) {
          context.addIssue({
            code: "custom",
            message: "H.264 width and height must be even integers.",
            path: [render.width % 2 !== 0 ? "width" : "height"],
          });
        }
      })
      .readonly(),
    readability: z
      .object({ edgeInsetPx: PositiveIntegerSchema.max(1000) })
      .strict()
      .readonly(),
    audioDefaults: z
      .object({
        globalBgm: z
          .object({
            sourcePath: RepositoryRelativeFilePathSchema,
            volume: z.number().finite().min(0).max(1),
          })
          .strict()
          .readonly()
          .nullable(),
      })
      .strict()
      .readonly()
      .optional(),
    publishingCollections: z
      .array(PublishingCollectionSchema)
      .min(1)
      .max(100)
      .readonly(),
    tts: z
      .object({
        defaultProviderId: ProducerConfigIdSchema,
        defaultVoiceProfileId: VoiceProfileIdSchema,
        speech: z
          .object({
            rate: z.number().finite().min(0.5).max(2),
            targetLoudnessLufs: z.number().finite().min(-30).max(-8),
          })
          .strict()
          .readonly(),
        providers: z
          .array(VoxcpmProviderConfigSchema)
          .min(1)
          .max(20)
          .readonly(),
      })
      .strict()
      .readonly(),
  })
  .strict()
  .superRefine((config, context) => {
    const collectionIds = new Set<string>();
    config.publishingCollections.forEach((collection, index) => {
      if (collectionIds.has(collection.id)) {
        context.addIssue({
          code: "custom",
          message: "Publishing collection IDs must be unique.",
          path: ["publishingCollections", index, "id"],
        });
      }
      collectionIds.add(collection.id);
    });
    const providerIds = new Set<string>();
    config.tts.providers.forEach((provider, index) => {
      if (providerIds.has(provider.id)) {
        context.addIssue({
          code: "custom",
          message: "TTS provider IDs must be unique.",
          path: ["tts", "providers", index, "id"],
        });
      }
      providerIds.add(provider.id);
    });
    const defaultProviders = config.tts.providers.filter(
      ({ id }) => id === config.tts.defaultProviderId,
    );
    if (defaultProviders.length !== 1) {
      context.addIssue({
        code: "custom",
        message: "The default TTS provider must exist exactly once.",
        path: ["tts", "defaultProviderId"],
      });
      return;
    }
    if (
      defaultProviders[0]?.voiceProfiles.filter(
        ({ id }) => id === config.tts.defaultVoiceProfileId,
      ).length !== 1
    ) {
      context.addIssue({
        code: "custom",
        message:
          "The default voice profile must belong to the default provider.",
        path: ["tts", "defaultVoiceProfileId"],
      });
    }
  });

export const ProducerConfigInputSchema = ProducerConfigInputObject.readonly();

export const computeProducerConfigFingerprint = (rawConfig: unknown) => {
  const record = { ...(rawConfig as Record<string, unknown>) };
  delete record.configFingerprint;
  return createFingerprint({
    namespace: "producer-config",
    version: 1,
    value: ProducerConfigInputSchema.parse(record),
  });
};

export const ProducerConfigSchema = ProducerConfigInputObject.safeExtend({
  configFingerprint: Sha256DigestSchema,
})
  .strict()
  .superRefine((config, context) => {
    const { configFingerprint, ...input } = config;
    if (configFingerprint !== computeProducerConfigFingerprint(input)) {
      context.addIssue({
        code: "custom",
        message: "Producer config fingerprint is stale.",
        path: ["configFingerprint"],
      });
    }
  })
  .readonly();

export const buildProducerConfig = (rawInput: unknown) => {
  const input = ProducerConfigInputSchema.parse(rawInput);
  return ProducerConfigSchema.parse({
    ...input,
    configFingerprint: computeProducerConfigFingerprint(input),
  });
};

export const computePublishingCollectionCatalogFingerprint = (
  collections: unknown,
) =>
  createFingerprint({
    namespace: "publishing-collection-catalog",
    version: 1,
    value: z.array(PublishingCollectionSchema).min(1).parse(collections),
  });

export type ProducerConfig = z.infer<typeof ProducerConfigSchema>;
export type PublishingCollection = z.infer<typeof PublishingCollectionSchema>;
export type VoxcpmProviderConfig = z.infer<typeof VoxcpmProviderConfigSchema>;

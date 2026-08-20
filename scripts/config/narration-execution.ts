import type { NarrationSpec } from "../../src/contracts/narration";
import { buildNarrationExecutionSnapshot } from "../../src/contracts/narration-execution";
import { createFingerprint } from "../../src/contracts/fingerprint";
import {
  NarrationMasteringPolicySchema,
  buildNarrationMasteringPolicy,
} from "../../src/contracts/mastered-narration";
import type {
  EdgeTtsProviderConfig,
  SpeechSdkProviderConfig,
} from "../../src/contracts/producer-config";
import { getSpeechSdkModelMaxInputChars } from "../../src/contracts/tts-provider-registry";
import type { SpeechSdkVendor } from "../../src/contracts/tts-provider-registry";
import {
  resolveVoxcpmProfile,
  resolveVoxcpmProfileInspectionMetadata,
  resolveVoxcpmProfileMetadata,
  type VoxcpmProfileInspectionMetadata,
} from "../narration/adapters/private-config";
import {
  computeProviderAttemptFingerprint,
  type ResolvedEdgeTtsProfile,
  type ResolvedSpeechSdkProfile,
} from "../narration/domain/provider-input";
import {
  readProducerConfig,
  resolveDefaultTtsProvider,
  resolveProducerConfigPathFromEnvironment,
  toVoxcpmPrivateConfig,
} from "./producer-config";

export type RemoteTtsProfileMetadata =
  | Readonly<{
      kind: "speech-sdk";
      vendor: SpeechSdkVendor;
      profileMatched: true;
      validationState: "configuration-validated-generation-not-probed";
    }>
  | Readonly<{
      kind: "edge-tts";
      vendor: "microsoft-edge-read-aloud";
      profileMatched: true;
      validationState: "configuration-validated-generation-not-probed";
    }>;

export type ProducerNarrationInspection = Readonly<{
  providerAttemptFingerprint: string | null;
  providerAttemptIdentityState:
    | "exact"
    | "unknown-protected-voice-material";
  masteringPolicy: ReturnType<
    typeof NarrationMasteringPolicySchema.parse
  >;
  metadata: VoxcpmProfileInspectionMetadata | RemoteTtsProfileMetadata;
}>;

const requireVoiceProfile = <
  T extends readonly { readonly id: string }[],
>(
  profiles: T,
  narration: NarrationSpec,
  providerLabel: string,
) => {
  const matches = profiles.filter(
    ({ id }) => id === narration.voiceProfileId,
  );
  if (matches.length !== 1) {
    throw new Error(`The selected ${providerLabel} voice profile is unavailable.`);
  }
  return matches[0] as T[number];
};

const resolveSpeechSdkProfile = ({
  provider,
  narration,
  speechRate,
}: {
  readonly provider: SpeechSdkProviderConfig;
  readonly narration: NarrationSpec;
  readonly speechRate: number;
}): Readonly<{
  resolved: ResolvedSpeechSdkProfile;
  metadata: RemoteTtsProfileMetadata;
}> => {
  const profile = requireVoiceProfile(
    provider.voiceProfiles,
    narration,
    "SpeechSDK",
  );
  const maxInputChars = getSpeechSdkModelMaxInputChars(
    provider.vendor,
    provider.modelId,
  );
  const providerConfigFingerprint = createFingerprint({
    namespace: "speech-sdk-private-execution-config",
    version: 2,
    value: {
      vendor: provider.vendor,
      apiKey: provider.connection.apiKey,
      baseUrl: provider.connection.baseUrl?.replace(/\/+$/u, "") ?? null,
      groupId: provider.connection.groupId ?? null,
      timeoutMs: provider.connection.timeoutMs,
      modelId: provider.modelId,
      voiceProfile: profile,
    },
  });
  return {
    resolved: {
      kind: "speech-sdk",
      vendor: provider.vendor,
      apiKey: provider.connection.apiKey,
      ...(provider.connection.baseUrl === undefined
        ? {}
        : { baseUrl: provider.connection.baseUrl.replace(/\/+$/u, "") }),
      ...(provider.connection.groupId === undefined
        ? {}
        : { groupId: provider.connection.groupId }),
      timeoutMs: provider.connection.timeoutMs,
      modelId: provider.modelId,
      voiceId: profile.voiceId,
      safeDescriptor: {
        adapterId: "speech-sdk-direct-v2",
        providerConfigFingerprint,
        vendor: provider.vendor,
        modelId: provider.modelId,
        voiceProfileId: profile.id,
        voiceId: profile.voiceId,
        voiceSource: profile.source,
        speechRate,
        maxInputChars,
        maxRetries: 0,
      },
    },
    metadata: {
      kind: "speech-sdk",
      vendor: provider.vendor,
      profileMatched: true,
      validationState: "configuration-validated-generation-not-probed",
    },
  };
};

const resolveEdgeTtsProfile = ({
  provider,
  narration,
  speechRate,
}: {
  readonly provider: EdgeTtsProviderConfig;
  readonly narration: NarrationSpec;
  readonly speechRate: number;
}): Readonly<{
  resolved: ResolvedEdgeTtsProfile;
  metadata: RemoteTtsProfileMetadata;
}> => {
  const profile = requireVoiceProfile(
    provider.voiceProfiles,
    narration,
    "Edge TTS",
  );
  const providerConfigFingerprint = createFingerprint({
    namespace: "edge-tts-private-execution-config",
    version: 1,
    value: {
      service: provider.service,
      timeoutMs: provider.connection.timeoutMs,
      modelId: provider.modelId,
      voiceProfile: profile,
    },
  });
  return {
    resolved: {
      kind: "edge-tts",
      timeoutMs: provider.connection.timeoutMs,
      voiceId: profile.voiceId,
      locale: profile.locale,
      speechRate,
      safeDescriptor: {
        adapterId: "edge-read-aloud-websocket-v1",
        providerConfigFingerprint,
        service: provider.service,
        modelId: provider.modelId,
        voiceProfileId: profile.id,
        voiceId: profile.voiceId,
        locale: profile.locale,
        speechRate,
        maxInputBytes: 4096,
        maxRetries: 0,
      },
    },
    metadata: {
      kind: "edge-tts",
      vendor: provider.service,
      profileMatched: true,
      validationState: "configuration-validated-generation-not-probed",
    },
  };
};

/**
 * Check-only narration metadata. In particular, VoxCPM material checksums
 * cannot be proven without opening protected voice files, so its exact
 * provider-attempt/cache identity is deliberately unknown instead of being
 * replaced with a configuration-only lookalike fingerprint.
 */
export const resolveProducerNarrationInspection = async ({
  rootDir,
  env,
  narration,
}: {
  readonly rootDir: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly narration: NarrationSpec;
}): Promise<ProducerNarrationInspection> => {
  const configPath = await resolveProducerConfigPathFromEnvironment({
    rootDir,
    env,
  });
  const producerConfig = await readProducerConfig({ configPath });
  const provider = resolveDefaultTtsProvider(producerConfig);
  const speechRate = producerConfig.tts.speech.rate;
  const masteringPolicy = NarrationMasteringPolicySchema.parse(
    buildNarrationMasteringPolicy(
      producerConfig.tts.speech.targetLoudnessLufs,
    ),
  );
  if (provider.kind === "voxcpm") {
    return {
      providerAttemptFingerprint: null,
      providerAttemptIdentityState: "unknown-protected-voice-material",
      masteringPolicy,
      metadata: resolveVoxcpmProfileInspectionMetadata({
        config: toVoxcpmPrivateConfig(provider, rootDir),
        narration,
      }),
    };
  }
  const execution =
    provider.kind === "speech-sdk"
      ? resolveSpeechSdkProfile({ provider, narration, speechRate })
      : resolveEdgeTtsProfile({ provider, narration, speechRate });
  return {
    providerAttemptFingerprint: computeProviderAttemptFingerprint(
      execution.resolved.safeDescriptor,
    ),
    providerAttemptIdentityState: "exact",
    masteringPolicy,
    metadata: execution.metadata,
  };
};

export const resolveProducerNarrationExecution = async ({
  rootDir,
  env,
  narration,
}: {
  readonly rootDir: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly narration: NarrationSpec;
}) => {
  const configPath = await resolveProducerConfigPathFromEnvironment({
    rootDir,
    env,
  });
  const producerConfig = await readProducerConfig({ configPath });
  const provider = resolveDefaultTtsProvider(producerConfig);
  const speechRate = producerConfig.tts.speech.rate;
  const execution =
    provider.kind === "voxcpm"
      ? {
          resolved: await resolveVoxcpmProfile({
            config: toVoxcpmPrivateConfig(provider, rootDir),
            narration,
            speechRate,
          }),
          metadata: await resolveVoxcpmProfileMetadata({
            config: toVoxcpmPrivateConfig(provider, rootDir),
            narration,
            rootDir,
          }),
        }
      : provider.kind === "speech-sdk"
        ? resolveSpeechSdkProfile({ provider, narration, speechRate })
        : resolveEdgeTtsProfile({ provider, narration, speechRate });
  const { resolved, metadata } = execution;
  const providerAttemptFingerprint = computeProviderAttemptFingerprint(
    resolved.safeDescriptor,
  );
  return {
    snapshot: buildNarrationExecutionSnapshot({
      providerId: provider.id,
      providerKind: provider.kind,
      providerVendor:
        provider.kind === "speech-sdk"
          ? provider.vendor
          : provider.kind === "edge-tts"
            ? provider.service
            : null,
      voiceProfileId: narration.voiceProfileId,
      speechRate,
      providerAttemptFingerprint,
      targetLoudnessLufs: producerConfig.tts.speech.targetLoudnessLufs,
    }),
    resolved,
    metadata,
  } as const;
};

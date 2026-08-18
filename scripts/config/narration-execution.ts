import type { NarrationSpec } from "../../src/contracts/narration";
import { buildNarrationExecutionSnapshot } from "../../src/contracts/narration-execution";
import { createFingerprint } from "../../src/contracts/fingerprint";
import type { SpeechSdkProviderConfig } from "../../src/contracts/producer-config";
import {
  resolveVoxcpmProfile,
  resolveVoxcpmProfileMetadata,
} from "../narration/adapters/private-config";
import {
  computeProviderAttemptFingerprint,
  type ResolvedSpeechSdkOpenAIProfile,
} from "../narration/domain/provider-input";
import {
  readProducerConfig,
  resolveDefaultTtsProvider,
  resolveProducerConfigPathFromEnvironment,
  toVoxcpmPrivateConfig,
} from "./producer-config";

export type SpeechSdkProfileMetadata = Readonly<{
  kind: "speech-sdk";
  vendor: "openai";
  profileMatched: true;
  validationState: "configuration-validated-generation-not-probed";
}>;

const resolveSpeechSdkOpenAIProfile = ({
  provider,
  narration,
  speechRate,
}: {
  readonly provider: SpeechSdkProviderConfig;
  readonly narration: NarrationSpec;
  readonly speechRate: number;
}): Readonly<{
  resolved: ResolvedSpeechSdkOpenAIProfile;
  metadata: SpeechSdkProfileMetadata;
}> => {
  const matches = provider.voiceProfiles.filter(
    ({ id }) => id === narration.voiceProfileId,
  );
  if (matches.length !== 1) {
    throw new Error("The selected SpeechSDK voice profile is unavailable.");
  }
  const profile = matches[0]!;
  const providerConfigFingerprint = createFingerprint({
    namespace: "speech-sdk-openai-private-execution-config",
    version: 1,
    value: {
      apiKey: provider.connection.apiKey,
      baseUrl: provider.connection.baseUrl?.replace(/\/+$/u, "") ?? null,
      timeoutMs: provider.connection.timeoutMs,
      modelId: provider.modelId,
      voiceProfile: profile,
    },
  });
  return {
    resolved: {
      kind: "speech-sdk",
      vendor: "openai",
      apiKey: provider.connection.apiKey,
      ...(provider.connection.baseUrl === undefined
        ? {}
        : { baseUrl: provider.connection.baseUrl.replace(/\/+$/u, "") }),
      timeoutMs: provider.connection.timeoutMs,
      modelId: provider.modelId,
      voiceId: profile.voiceId,
      safeDescriptor: {
        adapterId: "speech-sdk-openai-direct-v1",
        providerConfigFingerprint,
        vendor: "openai",
        modelId: provider.modelId,
        voiceProfileId: profile.id,
        voiceId: profile.voiceId,
        speechRate,
        maxInputChars: 4096,
        maxRetries: 0,
      },
    },
    metadata: {
      kind: "speech-sdk",
      vendor: "openai",
      profileMatched: true,
      validationState: "configuration-validated-generation-not-probed",
    },
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
  const execution =
    provider.kind === "voxcpm"
      ? {
          resolved: await resolveVoxcpmProfile({
            config: toVoxcpmPrivateConfig(provider, rootDir),
            narration,
            speechRate: producerConfig.tts.speech.rate,
          }),
          metadata: await resolveVoxcpmProfileMetadata({
            config: toVoxcpmPrivateConfig(provider, rootDir),
            narration,
            rootDir,
          }),
        }
      : resolveSpeechSdkOpenAIProfile({
          provider,
          narration,
          speechRate: producerConfig.tts.speech.rate,
        });
  const { resolved, metadata } = execution;
  const providerAttemptFingerprint = computeProviderAttemptFingerprint(
    resolved.safeDescriptor,
  );
  return {
    snapshot: buildNarrationExecutionSnapshot({
      providerId: provider.id,
      providerKind: provider.kind,
      providerVendor: provider.kind === "speech-sdk" ? provider.vendor : null,
      voiceProfileId: narration.voiceProfileId,
      speechRate: producerConfig.tts.speech.rate,
      providerAttemptFingerprint,
      targetLoudnessLufs: producerConfig.tts.speech.targetLoudnessLufs,
    }),
    resolved,
    metadata,
  } as const;
};

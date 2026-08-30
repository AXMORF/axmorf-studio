import { createFingerprint } from "@axmorf/studio/contracts";
import type { SpeechSdkVendor } from "@axmorf/studio/contracts";

type SafeVoxcpmDescriptorBase = {
  readonly privateConfigFingerprint: string;
  readonly modelId: string;
  readonly cfgValue: number;
  readonly inferenceTimesteps: number;
  readonly minLen: number;
  readonly maxLen: number;
  readonly normalize: boolean;
  readonly denoise: boolean;
  readonly retryBadcase: boolean;
  readonly retryBadcaseMaxTimes: number;
  readonly retryBadcaseRatioThreshold: number;
  readonly voiceProfileId: string;
  readonly speechRate: number;
};

export type SafeVoxcpmExecutionDescriptor =
  | (SafeVoxcpmDescriptorBase & {
      readonly adapterId: "voxcpm-controllable-clone-http-v2";
      readonly mode: "controllable-clone";
      readonly referenceAudioChecksum: string;
      readonly controlInstruction: string;
    })
  | (SafeVoxcpmDescriptorBase & {
      readonly adapterId: "voxcpm-high-fidelity-clone-http-v2";
      readonly mode: "high-fidelity-clone";
      readonly promptSourceChecksum: string;
      readonly promptTextChecksum: string;
      readonly promptAudioChecksum: string;
      readonly referenceAudioChecksum: string;
    });

export type ResolvedVoxcpmProfile = {
  readonly kind: "voxcpm";
  readonly baseUrl: string;
  readonly endpointPath: "/clone" | "/clone_with_prompt";
  readonly token?: string;
  readonly timeoutMs: number;
  readonly referenceAudioBytes: Buffer;
  readonly controlInstruction?: string;
  readonly promptAudioBytes?: Buffer;
  readonly promptText?: string;
  readonly parameters: {
    readonly cfgValue: number;
    readonly inferenceTimesteps: number;
    readonly minLen: number;
    readonly maxLen: number;
    readonly normalize: boolean;
    readonly denoise: boolean;
    readonly retryBadcase: boolean;
    readonly retryBadcaseMaxTimes: number;
    readonly retryBadcaseRatioThreshold: number;
  };
  readonly safeDescriptor: SafeVoxcpmExecutionDescriptor;
};

export type SafeSpeechSdkExecutionDescriptor = {
  readonly adapterId: "speech-sdk-direct-v2";
  readonly providerConfigFingerprint: string;
  readonly vendor: SpeechSdkVendor;
  readonly modelId: string;
  readonly voiceProfileId: string;
  readonly voiceId: string;
  readonly voiceSource: "catalog" | "remote-clone" | "remote-designed";
  readonly speechRate: number;
  readonly maxInputChars: number;
  readonly maxRetries: 0;
};

export type ResolvedSpeechSdkProfile = {
  readonly kind: "speech-sdk";
  readonly vendor: SpeechSdkVendor;
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly groupId?: string;
  readonly timeoutMs: number;
  readonly modelId: string;
  readonly voiceId: string;
  readonly safeDescriptor: SafeSpeechSdkExecutionDescriptor;
};

export type SafeEdgeTtsExecutionDescriptor = {
  readonly adapterId: "edge-read-aloud-websocket-v1";
  readonly providerConfigFingerprint: string;
  readonly service: "microsoft-edge-read-aloud";
  readonly modelId: "edge-read-aloud";
  readonly voiceProfileId: string;
  readonly voiceId: string;
  readonly locale: string;
  readonly speechRate: number;
  readonly maxInputBytes: 4096;
  readonly maxRetries: 0;
};

export type ResolvedEdgeTtsProfile = {
  readonly kind: "edge-tts";
  readonly timeoutMs: number;
  readonly voiceId: string;
  readonly locale: string;
  readonly speechRate: number;
  readonly safeDescriptor: SafeEdgeTtsExecutionDescriptor;
};

export type SafeProviderExecutionDescriptor =
  | SafeVoxcpmExecutionDescriptor
  | SafeSpeechSdkExecutionDescriptor
  | SafeEdgeTtsExecutionDescriptor;

export type ResolvedProviderExecution =
  | ResolvedVoxcpmProfile
  | ResolvedSpeechSdkProfile
  | ResolvedEdgeTtsProfile;

export type ChunkAudioRequest = {
  readonly generationInputFingerprint: string;
  readonly providerAttemptFingerprint: string;
  readonly requestFingerprint: string;
  readonly chunkId: string;
  readonly meaningId: string;
  readonly ttsText: string;
};

export type ChunkAudioGenerator = (
  request: ChunkAudioRequest,
) => Promise<Buffer>;

export const NARRATION_NORMALIZATION_POLICY_ID =
  "pcm-s16le-normalize-v1" as const;

export const computeProviderAttemptFingerprint = (
  descriptor: SafeProviderExecutionDescriptor,
) => {
  if (descriptor.adapterId.startsWith("voxcpm-")) {
    return createFingerprint({
      namespace: "voxcpm-provider-attempt",
      version: 2,
      value: descriptor,
    });
  }
  if (descriptor.adapterId.startsWith("edge-")) {
    return createFingerprint({
      namespace: "edge-tts-provider-attempt",
      version: 1,
      value: descriptor,
    });
  }
  return createFingerprint({
    namespace: "speech-sdk-provider-attempt",
    version: 2,
    value: descriptor,
  });
};

export const computeChunkRequestFingerprint = ({
  providerAttemptFingerprint,
  chunkId,
  meaningId,
  ttsText,
}: Omit<ChunkAudioRequest, "requestFingerprint">) =>
  createFingerprint({
    namespace: "tts-chunk-request",
    version: 3,
    value: {
      providerAttemptFingerprint,
      normalizationPolicyId: NARRATION_NORMALIZATION_POLICY_ID,
      chunkId,
      meaningId,
      ttsText,
    },
  });

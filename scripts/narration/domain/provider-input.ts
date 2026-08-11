import { createFingerprint } from "../../../src/contracts/fingerprint";

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

export type VoxcpmChunkRequest = {
  readonly generationInputFingerprint: string;
  readonly providerAttemptFingerprint: string;
  readonly requestFingerprint: string;
  readonly chunkId: string;
  readonly meaningId: string;
  readonly ttsText: string;
};

export type ChunkAudioGenerator = (
  request: VoxcpmChunkRequest,
) => Promise<Buffer>;

export const computeProviderAttemptFingerprint = (
  descriptor: SafeVoxcpmExecutionDescriptor,
) =>
  createFingerprint({
    namespace: "voxcpm-provider-attempt",
    version: 2,
    value: descriptor,
  });

export const computeChunkRequestFingerprint = ({
  generationInputFingerprint,
  providerAttemptFingerprint,
  chunkId,
  meaningId,
  ttsText,
}: Omit<VoxcpmChunkRequest, "requestFingerprint">) =>
  createFingerprint({
    namespace: "voxcpm-chunk-request",
    version: 1,
    value: {
      generationInputFingerprint,
      providerAttemptFingerprint,
      chunkId,
      meaningId,
      ttsText,
    },
  });

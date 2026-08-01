import { createFingerprint } from "../../../src/contracts/fingerprint";

export type SafeVoxcpmExecutionDescriptor = {
  readonly adapterId: "voxcpm-controllable-clone-http-v1";
  readonly modelId: string;
  readonly mode: "controllable-clone";
  readonly cfgValue: number;
  readonly inferenceTimesteps: number;
  readonly normalize: boolean;
  readonly denoise: boolean;
  readonly retryBadcase: boolean;
  readonly voiceProfileId: string;
  readonly referenceAudioChecksum: string;
  readonly controlInstruction: string;
};

export type ResolvedVoxcpmProfile = {
  readonly baseUrl: string;
  readonly endpointPath: "/clone";
  readonly token?: string;
  readonly timeoutMs: number;
  readonly referenceAudioBytes: Buffer;
  readonly controlInstruction: string;
  readonly parameters: {
    readonly cfgValue: number;
    readonly inferenceTimesteps: number;
    readonly normalize: boolean;
    readonly denoise: boolean;
    readonly retryBadcase: boolean;
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
    version: 1,
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

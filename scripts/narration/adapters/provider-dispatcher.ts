import type {
  ChunkAudioGenerator,
  ResolvedProviderExecution,
} from "../domain/provider-input";
import { createSpeechSdkChunkGenerator } from "./speech-sdk-client";
import { createVoxcpmChunkGenerator } from "./voxcpm-client";

export const createChunkAudioGenerator = ({
  resolved,
  adapters = {
    voxcpm: createVoxcpmChunkGenerator,
    speechSdk: createSpeechSdkChunkGenerator,
  },
}: {
  readonly resolved: ResolvedProviderExecution;
  readonly adapters?: Readonly<{
    voxcpm: typeof createVoxcpmChunkGenerator;
    speechSdk: typeof createSpeechSdkChunkGenerator;
  }>;
}): ChunkAudioGenerator =>
  resolved.kind === "voxcpm"
    ? adapters.voxcpm({ resolved })
    : adapters.speechSdk({ resolved });

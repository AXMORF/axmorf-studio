import type {
  ChunkAudioGenerator,
  ResolvedProviderExecution,
} from "../domain/provider-input";
import { createSpeechSdkChunkGenerator } from "./speech-sdk-client";
import { createVoxcpmChunkGenerator } from "./voxcpm-client";
import { createEdgeTtsChunkGenerator } from "./edge-tts-client";

export const createChunkAudioGenerator = ({
  resolved,
  adapters = {
    voxcpm: createVoxcpmChunkGenerator,
    speechSdk: createSpeechSdkChunkGenerator,
    edgeTts: createEdgeTtsChunkGenerator,
  },
}: {
  readonly resolved: ResolvedProviderExecution;
  readonly adapters?: Readonly<{
    voxcpm: typeof createVoxcpmChunkGenerator;
    speechSdk: typeof createSpeechSdkChunkGenerator;
    edgeTts?: typeof createEdgeTtsChunkGenerator;
  }>;
}): ChunkAudioGenerator =>
  resolved.kind === "voxcpm"
    ? adapters.voxcpm({ resolved })
    : resolved.kind === "speech-sdk"
      ? adapters.speechSdk({ resolved })
      : (adapters.edgeTts ?? createEdgeTtsChunkGenerator)({ resolved });

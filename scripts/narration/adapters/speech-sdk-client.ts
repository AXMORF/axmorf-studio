import { generateSpeech } from "@speech-sdk/core";
import {
  createCartesia,
  createDeepgram,
  createElevenLabs,
  createFishAudio,
  createGradium,
  createHume,
  createInworld,
  createMiniMax,
  createMistral,
  createMurf,
  createOpenAI,
  createResemble,
  createSmallestAI,
  createSpeechify,
  createXai,
} from "@speech-sdk/core/providers";

import {
  getSpeechSdkModelMaxInputChars,
  getSpeechSdkVendorDefinition,
} from "@axmorf/studio/contracts";
import type { SpeechSdkVendor } from "@axmorf/studio/contracts";
import type {
  ChunkAudioGenerator,
  ResolvedSpeechSdkProfile,
} from "../domain/provider-input";

type DirectFactoryConfig = {
  readonly apiKey: string;
  readonly baseURL?: string;
  readonly fetch?: typeof fetch;
  readonly groupId?: string;
};

const createDirectFactory = (
  vendor: SpeechSdkVendor,
  config: DirectFactoryConfig,
) => {
  switch (vendor) {
    case "cartesia":
      return createCartesia(config);
    case "deepgram":
      return createDeepgram(config);
    case "elevenlabs":
      return createElevenLabs(config);
    case "fish-audio":
      return createFishAudio(config);
    case "gradium":
      return createGradium(config);
    case "hume":
      return createHume(config);
    case "inworld":
      return createInworld(config);
    case "minimax":
      return createMiniMax(config);
    case "mistral":
      return createMistral(config);
    case "murf":
      return createMurf(config);
    case "openai":
      return createOpenAI(config);
    case "resemble":
      return createResemble(config);
    case "smallest-ai":
      return createSmallestAI(config);
    case "speechify":
      return createSpeechify(config);
    case "xai":
      return createXai(config);
  }
};

export const createSpeechSdkDirectModel = ({
  resolved,
  fetchImpl,
}: {
  readonly resolved: ResolvedSpeechSdkProfile;
  readonly fetchImpl?: typeof fetch;
}) => {
  const definition = getSpeechSdkVendorDefinition(resolved.vendor);
  if (!(definition.models as readonly string[]).includes(resolved.modelId)) {
    throw new Error("Unsupported SpeechSDK direct provider model.");
  }
  const factory = createDirectFactory(resolved.vendor, {
    apiKey: resolved.apiKey,
    ...(resolved.baseUrl === undefined ? {} : { baseURL: resolved.baseUrl }),
    ...(resolved.groupId === undefined ? {} : { groupId: resolved.groupId }),
    ...(fetchImpl === undefined ? {} : { fetch: fetchImpl }),
  });
  return factory(resolved.modelId);
};

export const createSpeechSdkChunkGenerator = ({
  resolved,
  fetchImpl,
}: {
  readonly resolved: ResolvedSpeechSdkProfile;
  readonly fetchImpl?: typeof fetch;
}): ChunkAudioGenerator => {
  const definition = getSpeechSdkVendorDefinition(resolved.vendor);
  const maxInputChars = getSpeechSdkModelMaxInputChars(
    resolved.vendor,
    resolved.modelId,
  );
  const model = createSpeechSdkDirectModel({ resolved, fetchImpl });

  return async (request) => {
    if (request.ttsText.length > maxInputChars) {
      throw new Error(
        `SpeechSDK ${definition.label} single-request limit exceeded for chunk ${request.chunkId}.`,
      );
    }
    if (/\[[^\]]+\]/u.test(request.ttsText)) {
      throw new Error(
        `SpeechSDK audio tags are not allowed in authored chunk ${request.chunkId}.`,
      );
    }
    try {
      const result = await generateSpeech({
        model,
        text: request.ttsText,
        voice: resolved.voiceId,
        maxRetries: 0,
        maxInputChars,
        abortSignal: AbortSignal.timeout(resolved.timeoutMs),
      });
      const bytes = Buffer.from(result.audio.uint8Array);
      if (bytes.length === 0) throw new Error("empty provider audio");
      return bytes;
    } catch {
      throw new Error(
        `SpeechSDK ${definition.label} request failed for chunk ${request.chunkId}.`,
      );
    }
  };
};

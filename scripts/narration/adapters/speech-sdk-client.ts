import { generateSpeech } from "@speech-sdk/core";
import { createOpenAI } from "@speech-sdk/core/providers";

import type {
  ChunkAudioGenerator,
  ResolvedSpeechSdkOpenAIProfile,
} from "../domain/provider-input";

export const SPEECH_SDK_OPENAI_MAX_INPUT_CHARS = 4096 as const;

export const createSpeechSdkChunkGenerator = ({
  resolved,
  fetchImpl,
}: {
  readonly resolved: ResolvedSpeechSdkOpenAIProfile;
  readonly fetchImpl?: typeof fetch;
}): ChunkAudioGenerator => {
  if (resolved.vendor !== "openai" || resolved.modelId !== "gpt-4o-mini-tts") {
    throw new Error("Unsupported SpeechSDK direct provider configuration.");
  }
  const model = createOpenAI({
    apiKey: resolved.apiKey,
    ...(resolved.baseUrl === undefined ? {} : { baseURL: resolved.baseUrl }),
    ...(fetchImpl === undefined ? {} : { fetch: fetchImpl }),
  })(resolved.modelId);

  return async (request) => {
    if (request.ttsText.length > SPEECH_SDK_OPENAI_MAX_INPUT_CHARS) {
      throw new Error(
        `SpeechSDK OpenAI single-request limit exceeded for chunk ${request.chunkId}.`,
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
        maxInputChars: SPEECH_SDK_OPENAI_MAX_INPUT_CHARS,
        abortSignal: AbortSignal.timeout(resolved.timeoutMs),
      });
      const bytes = Buffer.from(result.audio.uint8Array);
      if (bytes.length === 0) {
        throw new Error("empty provider audio");
      }
      return bytes;
    } catch {
      throw new Error(
        `SpeechSDK OpenAI request failed for chunk ${request.chunkId}.`,
      );
    }
  };
};

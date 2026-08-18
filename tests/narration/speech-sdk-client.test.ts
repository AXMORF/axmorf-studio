import assert from "node:assert/strict";
import test from "node:test";

import {
  SPEECH_SDK_OPENAI_MAX_INPUT_CHARS,
  createSpeechSdkChunkGenerator,
} from "../../scripts/narration/adapters/speech-sdk-client";
import { createChunkAudioGenerator } from "../../scripts/narration/adapters/provider-dispatcher";
import type {
  ChunkAudioRequest,
  ResolvedSpeechSdkOpenAIProfile,
} from "../../scripts/narration/domain/provider-input";

const secret = "test-api-key-that-must-never-leak";

const resolved: ResolvedSpeechSdkOpenAIProfile = {
  kind: "speech-sdk",
  vendor: "openai",
  apiKey: secret,
  baseUrl: "https://tts.example.invalid/v1",
  timeoutMs: 5_000,
  modelId: "gpt-4o-mini-tts",
  voiceId: "alloy",
  safeDescriptor: {
    adapterId: "speech-sdk-openai-direct-v1",
    providerConfigFingerprint: `sha256:${"0".repeat(64)}`,
    vendor: "openai",
    modelId: "gpt-4o-mini-tts",
    voiceProfileId: "cloud-narrator",
    voiceId: "alloy",
    speechRate: 1,
    maxInputChars: 4096,
    maxRetries: 0,
  },
};

const request: ChunkAudioRequest = {
  generationInputFingerprint: `sha256:${"a".repeat(64)}`,
  providerAttemptFingerprint: `sha256:${"b".repeat(64)}`,
  requestFingerprint: `sha256:${"c".repeat(64)}`,
  chunkId: "cloud-01",
  meaningId: "cloud",
  ttsText: "一次 authored chunk 只允许一次直连请求。",
};

test("SpeechSDK OpenAI direct uses one request with retry fallback and SDK post-processing disabled", async () => {
  const calls: Array<{ input: string | URL | Request; init?: RequestInit }> =
    [];
  const fetchImpl = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    calls.push({ input, init });
    return new Response(Uint8Array.from([1, 2, 3]), {
      status: 200,
      headers: { "content-type": "audio/mpeg" },
    });
  }) as typeof fetch;
  const generate = createSpeechSdkChunkGenerator({ resolved, fetchImpl });

  assert.deepEqual(await generate(request), Buffer.from([1, 2, 3]));
  assert.equal(calls.length, 1);
  assert.equal(
    String(calls[0]?.input),
    "https://tts.example.invalid/v1/audio/speech",
  );
  const body = JSON.parse(String(calls[0]?.init?.body)) as Record<
    string,
    unknown
  >;
  assert.deepEqual(body, {
    model: "gpt-4o-mini-tts",
    input: request.ttsText,
    voice: "alloy",
  });
  assert.equal(
    new Headers(calls[0]?.init?.headers).get("authorization"),
    `Bearer ${secret}`,
  );
});

test("SpeechSDK OpenAI rejects input that could activate SDK chunking", async () => {
  assert.equal(SPEECH_SDK_OPENAI_MAX_INPUT_CHARS, 4096);
  const generate = createSpeechSdkChunkGenerator({
    resolved,
    fetchImpl: (async () => {
      throw new Error("must not call fetch");
    }) as typeof fetch,
  });
  await assert.rejects(
    generate({
      ...request,
      ttsText: "字".repeat(SPEECH_SDK_OPENAI_MAX_INPUT_CHARS + 1),
    }),
    /single-request limit/iu,
  );
});

test("SpeechSDK errors are redacted and do not expose credentials or endpoints", async () => {
  const generate = createSpeechSdkChunkGenerator({
    resolved,
    fetchImpl: (async () =>
      new Response(JSON.stringify({ error: { message: secret } }), {
        status: 401,
        headers: { "content-type": "application/json" },
      })) as typeof fetch,
  });

  await assert.rejects(generate(request), (error: Error) => {
    assert.match(error.message, /SpeechSDK OpenAI request failed/iu);
    assert.doesNotMatch(error.message, new RegExp(secret, "u"));
    assert.doesNotMatch(error.message, /tts\.example\.invalid/iu);
    assert.equal(error.cause, undefined);
    return true;
  });
});

test("provider dispatcher selects the SpeechSDK adapter without fallback", async () => {
  const calls: string[] = [];
  const generator = createChunkAudioGenerator({
    resolved,
    adapters: {
      voxcpm: () => {
        calls.push("voxcpm");
        return async () => Buffer.from("wrong");
      },
      speechSdk: () => {
        calls.push("speech-sdk");
        return async () => Buffer.from("cloud");
      },
    },
  });
  assert.deepEqual(await generator(request), Buffer.from("cloud"));
  assert.deepEqual(calls, ["speech-sdk"]);
});

import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import test from "node:test";

import {
  EDGE_TTS_MAX_ESCAPED_INPUT_BYTES,
  createEdgeTtsChunkGenerator,
} from "../../scripts/narration/adapters/edge-tts-client";
import { createChunkAudioGenerator } from "../../scripts/narration/adapters/provider-dispatcher";
import type {
  ChunkAudioRequest,
  ResolvedEdgeTtsProfile,
} from "../../scripts/narration/domain/provider-input";

const resolved: ResolvedEdgeTtsProfile = {
  kind: "edge-tts",
  timeoutMs: 5_000,
  voiceId: "zh-CN-XiaoxiaoNeural",
  locale: "zh-CN",
  speechRate: 1.15,
  safeDescriptor: {
    adapterId: "edge-read-aloud-websocket-v1",
    providerConfigFingerprint: `sha256:${"0".repeat(64)}`,
    service: "microsoft-edge-read-aloud",
    modelId: "edge-read-aloud",
    voiceProfileId: "edge-narrator",
    voiceId: "zh-CN-XiaoxiaoNeural",
    locale: "zh-CN",
    speechRate: 1.15,
    maxInputBytes: 4096,
    maxRetries: 0,
  },
};

const request: ChunkAudioRequest = {
  generationInputFingerprint: `sha256:${"a".repeat(64)}`,
  providerAttemptFingerprint: `sha256:${"b".repeat(64)}`,
  requestFingerprint: `sha256:${"c".repeat(64)}`,
  chunkId: "edge-01",
  meaningId: "edge",
  ttsText: "一条 authored chunk 只发送一次。",
};

test("Edge TTS default client constructs without opening a connection", () => {
  assert.equal(typeof createEdgeTtsChunkGenerator({ resolved }), "function");
});

test("Edge TTS sends one authored chunk once and returns provider bytes", async () => {
  const calls: Array<{ text: string; outputPath: string }> = [];
  let options: Record<string, unknown> | undefined;
  const generate = createEdgeTtsChunkGenerator({
    resolved,
    env: {},
    clientFactory: (value) => {
      options = value;
      return {
        ttsPromise: async (text, outputPath) => {
          calls.push({ text, outputPath });
          await writeFile(outputPath, Buffer.from([1, 2, 3]));
        },
      };
    },
  });

  assert.deepEqual(await generate(request), Buffer.from([1, 2, 3]));
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.text, request.ttsText);
  assert.deepEqual(options, {
    voice: "zh-CN-XiaoxiaoNeural",
    lang: "zh-CN",
    outputFormat: "audio-24khz-48kbitrate-mono-mp3",
    saveSubtitles: false,
    rate: "default",
    timeout: 5_000,
  });
});

test("Edge TTS honors inherited HTTPS/HTTP proxies and service-specific NO_PROXY", () => {
  const cases: Array<{
    env: Record<string, string>;
    expectedProxy: string | undefined;
  }> = [
    {
      env: { HTTPS_PROXY: "http://proxy.example:8080" },
      expectedProxy: "http://proxy.example:8080",
    },
    {
      env: {
        https_proxy: "http://lower.example:8080",
        HTTPS_PROXY: "http://upper.example:8080",
        HTTP_PROXY: "http://http.example:8080",
      },
      expectedProxy: "http://lower.example:8080",
    },
    {
      env: { HTTP_PROXY: "http://proxy.example:8080" },
      expectedProxy: "http://proxy.example:8080",
    },
    {
      env: {
        http_proxy: "http://lower.example:8080",
        HTTP_PROXY: "http://upper.example:8080",
      },
      expectedProxy: "http://lower.example:8080",
    },
    {
      env: {
        HTTPS_PROXY: "http://proxy.example:8080",
        NO_PROXY: "localhost,127.0.0.1",
      },
      expectedProxy: "http://proxy.example:8080",
    },
    {
      env: {
        HTTPS_PROXY: "http://proxy.example:8080",
        NO_PROXY: "speech.platform.bing.com:443",
      },
      expectedProxy: undefined,
    },
    {
      env: {
        HTTPS_PROXY: "http://proxy.example:8080",
        NO_PROXY: "speech.platform.bing.com:80",
      },
      expectedProxy: "http://proxy.example:8080",
    },
    {
      env: { HTTPS_PROXY: "http://proxy.example:8080", no_proxy: ".BING.COM" },
      expectedProxy: undefined,
    },
    {
      env: { HTTPS_PROXY: "http://proxy.example:8080", NO_PROXY: "*.bing.com" },
      expectedProxy: undefined,
    },
    {
      env: { HTTPS_PROXY: "http://proxy.example:8080", NO_PROXY: "*" },
      expectedProxy: undefined,
    },
    { env: {}, expectedProxy: undefined },
  ];
  for (const { env, expectedProxy } of cases) {
    let actualProxy: string | undefined;
    let providerCalls = 0;
    const before = { ...env };
    createEdgeTtsChunkGenerator({
      resolved,
      env,
      clientFactory: (options) => {
        actualProxy = options.proxy;
        return {
          ttsPromise: async () => {
            providerCalls += 1;
          },
        };
      },
    });
    assert.equal(actualProxy, expectedProxy);
    assert.equal(providerCalls, 0);
    assert.deepEqual(env, before);
  }
});

test("Edge TTS rejects escaped UTF-8 overflow before opening a request", async () => {
  let calls = 0;
  const generate = createEdgeTtsChunkGenerator({
    resolved,
    clientFactory: () => ({
      ttsPromise: async () => {
        calls += 1;
      },
    }),
  });
  await assert.rejects(
    generate({
      ...request,
      ttsText: "&".repeat(EDGE_TTS_MAX_ESCAPED_INPUT_BYTES),
    }),
    /single-request limit/iu,
  );
  await assert.rejects(
    generate({ ...request, ttsText: "invalid\u000Bcontrol" }),
    /unsupported control characters/iu,
  );
  assert.equal(calls, 0);
});

test("Edge TTS errors are redacted and dispatcher does not fallback", async () => {
  const secret = "remote-error-that-must-not-leak";
  const generate = createEdgeTtsChunkGenerator({
    resolved,
    clientFactory: () => ({
      ttsPromise: async () => {
        throw new Error(secret);
      },
    }),
  });
  await assert.rejects(generate(request), (error: Error) => {
    assert.match(error.message, /Edge TTS request failed/iu);
    assert.doesNotMatch(error.message, new RegExp(secret, "u"));
    return true;
  });

  const calls: string[] = [];
  const dispatched = createChunkAudioGenerator({
    resolved,
    adapters: {
      voxcpm: () => {
        calls.push("voxcpm");
        return async () => Buffer.from("wrong");
      },
      speechSdk: () => {
        calls.push("speech-sdk");
        return async () => Buffer.from("wrong");
      },
      edgeTts: () => {
        calls.push("edge-tts");
        return async () => Buffer.from("edge");
      },
    },
  });
  assert.deepEqual(await dispatched(request), Buffer.from("edge"));
  assert.deepEqual(calls, ["edge-tts"]);
});

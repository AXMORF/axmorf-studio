import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createVoxcpmChunkGenerator } from "../../scripts/narration/adapters/voxcpm-client";
import type {
  ResolvedVoxcpmProfile,
  VoxcpmChunkRequest,
} from "../../scripts/narration/domain/provider-input";

const resolved: ResolvedVoxcpmProfile = {
  baseUrl: "http://127.0.0.1:9880",
  endpointPath: "/clone",
  token: "secret-token",
  timeoutMs: 5_000,
  referenceAudioBytes: Buffer.from("reference wav"),
  controlInstruction: "冷静、清晰、自然。",
  parameters: {
    cfgValue: 2,
    inferenceTimesteps: 10,
    minLen: 2,
    maxLen: 4096,
    normalize: false,
    denoise: true,
    retryBadcase: true,
    retryBadcaseMaxTimes: 3,
    retryBadcaseRatioThreshold: 6,
  },
  safeDescriptor: {
    adapterId: "voxcpm-controllable-clone-http-v2",
    modelId: "private-deployment",
    mode: "controllable-clone",
    cfgValue: 2,
    inferenceTimesteps: 10,
    minLen: 2,
    maxLen: 4096,
    normalize: false,
    denoise: true,
    retryBadcase: true,
    retryBadcaseMaxTimes: 3,
    retryBadcaseRatioThreshold: 6,
    voiceProfileId: "science-explainer-young-male",
    referenceAudioChecksum: `sha256:${"a".repeat(64)}`,
    controlInstruction: "冷静、清晰、自然。",
  },
};

const request: VoxcpmChunkRequest = {
  generationInputFingerprint: `sha256:${"b".repeat(64)}`,
  providerAttemptFingerprint: `sha256:${"c".repeat(64)}`,
  requestFingerprint: `sha256:${"d".repeat(64)}`,
  chunkId: "position-is-time-01",
  meaningId: "position-is-time",
  ttsText: "手机定位，表面上是在算位置，底层先是在比较时间。",
};

type FetchCall = {
  readonly input: string | URL | Request;
  readonly init?: RequestInit;
};

const createFetch = (
  response: Response = new Response(Uint8Array.from([1, 2, 3]), {
    status: 200,
    headers: { "content-type": "audio/wav; charset=binary" },
  }),
) => {
  const calls: FetchCall[] = [];
  const fetchImpl = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    calls.push({ input, init });
    return response;
  }) as typeof fetch;
  return { calls, fetchImpl };
};

test("one authored TTSChunk causes exactly one VoxCPM request", async () => {
  const { calls, fetchImpl } = createFetch();
  const generate = createVoxcpmChunkGenerator({ resolved, fetchImpl });
  const bytes = await generate(request);

  assert.deepEqual(bytes, Buffer.from([1, 2, 3]));
  assert.equal(calls.length, 1);
  assert.equal(String(calls[0]?.input), "http://127.0.0.1:9880/clone");
  assert.equal(calls[0]?.init?.method, "POST");
  assert.equal(
    new Headers(calls[0]?.init?.headers).get("authorization"),
    "Bearer secret-token",
  );
  assert.ok(calls[0]?.init?.signal instanceof AbortSignal);
  const form = calls[0]?.init?.body as FormData;
  assert.equal(form.get("text"), request.ttsText);
  assert.equal(form.get("control"), resolved.controlInstruction);
  assert.equal(form.get("cfg_value"), "2");
  assert.equal(form.get("inference_timesteps"), "10");
  assert.equal(form.get("min_len"), "2");
  assert.equal(form.get("max_len"), "4096");
  assert.equal(form.get("normalize"), "false");
  assert.equal(form.get("denoise"), "true");
  assert.equal(form.get("retry_badcase"), "true");
  assert.equal(form.get("retry_badcase_max_times"), "3");
  assert.equal(form.get("retry_badcase_ratio_threshold"), "6");
  assert.equal(form.get("save"), "false");
  const reference = form.get("reference_audio");
  assert.ok(reference instanceof Blob);
  assert.equal(reference.type, "audio/wav");
  assert.equal(form.has("modelId"), false);
  assert.deepEqual([...form.keys()].sort(), [
    "cfg_value",
    "control",
    "denoise",
    "inference_timesteps",
    "max_len",
    "min_len",
    "normalize",
    "reference_audio",
    "retry_badcase",
    "retry_badcase_max_times",
    "retry_badcase_ratio_threshold",
    "save",
    "text",
  ]);
});

test("authorization is omitted when no token exists", async () => {
  const { calls, fetchImpl } = createFetch();
  const generate = createVoxcpmChunkGenerator({
    resolved: { ...resolved, token: undefined },
    fetchImpl,
  });

  await generate(request);
  assert.equal(
    new Headers(calls[0]?.init?.headers).has("authorization"),
    false,
  );
});

test("network and timeout failures remain redacted", async () => {
  const networkFailure = (async () => {
    throw new Error("network offline");
  }) as typeof fetch;
  const generate = createVoxcpmChunkGenerator({
    resolved,
    fetchImpl: networkFailure,
  });

  await assert.rejects(generate(request), (error: Error) => {
    assert.match(error.message, /VoxCPM request failed/i);
    assert.equal(error.message.includes(resolved.token ?? ""), false);
    assert.equal(error.message.includes(resolved.baseUrl), false);
    return true;
  });

  const timeoutFetch = (async (
    _input: string | URL | Request,
    init?: RequestInit,
  ) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () =>
        reject(new DOMException("timed out", "AbortError")),
      );
    })) as typeof fetch;
  const timeoutGenerate = createVoxcpmChunkGenerator({
    resolved: { ...resolved, timeoutMs: 1 },
    fetchImpl: timeoutFetch,
  });
  await assert.rejects(timeoutGenerate(request), /VoxCPM request failed/i);
});

test("non-success wrong content type and empty bodies fail closed", async () => {
  const failures = [
    new Response("provider unavailable", { status: 503 }),
    new Response("not audio", {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
    new Response(new Uint8Array(), {
      status: 200,
      headers: { "content-type": "audio/x-wav" },
    }),
  ];

  for (const response of failures) {
    const { fetchImpl } = createFetch(response);
    await assert.rejects(
      createVoxcpmChunkGenerator({ resolved, fetchImpl })(request),
    );
  }
});

test("unsupported modes and punctuation helper imports are rejected", async () => {
  assert.throws(
    () =>
      createVoxcpmChunkGenerator({
        resolved: {
          ...resolved,
          safeDescriptor: {
            ...resolved.safeDescriptor,
            mode: "voice-design",
          },
        } as unknown as ResolvedVoxcpmProfile,
        fetchImpl: createFetch().fetchImpl,
      }),
    /unsupported VoxCPM mode/i,
  );

  const source = await readFile(
    new URL(
      "../../scripts/narration/adapters/voxcpm-client.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.equal(/split|punctuation|silenceremove|atrim|\/api\/tts|F5/i.test(source), false);
});

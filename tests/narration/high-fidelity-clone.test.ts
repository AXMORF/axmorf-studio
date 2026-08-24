import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import test from "node:test";

import { resolveVoxcpmProfile } from "../../scripts/narration/adapters/private-config";
import { normalizePromptAudio } from "../../scripts/narration/adapters/prompt-audio-normalizer";
import { createVoxcpmChunkGenerator } from "../../scripts/narration/adapters/voxcpm-client";
import type { ChunkAudioRequest } from "../../scripts/narration/domain/provider-input";
import {
  encodeCanonicalPcmWav,
  measureCanonicalPcmWav,
} from "../../scripts/narration/domain/pcm-wav";
import { NarrationSpecSchema } from "../../src/contracts/narration";

const promptAudioPath = "/srv/private/my_voice.m4a";
const promptTextPath = "/srv/private/my_voice_text.txt";
const promptText =
  "我们一直以为，技术只是工具。可如果它能模仿我们的声音，甚至替我们思考，它还只是工具吗？未来，真的已经来了吗？";
const sourceBytes = Buffer.from("protected m4a source");
const canonicalPromptWav = encodeCanonicalPcmWav(Buffer.from([0, 0, 1, 0]));

const config = {
  schemaVersion: 2,
  baseUrl: "http://127.0.0.1:8810",
  timeoutMs: 180_000,
  modelId: "VoxCPM2-local",
  endpointPath: "/clone",
  parameters: {
    cfgValue: 2,
    inferenceTimesteps: 10,
    minLen: 2,
    maxLen: 4096,
    normalize: true,
    denoise: false,
    retryBadcase: false,
    retryBadcaseMaxTimes: 3,
    retryBadcaseRatioThreshold: 6,
  },
  voiceProfiles: [
    {
      id: "production-project-my-voice",
      mode: "high-fidelity-clone",
      promptAudioPath,
      promptTextPath,
      promptTranscriptConfirmed: true,
    },
  ],
} as const;

const narration = NarrationSpecSchema.parse({
  schemaVersion: 2,
  voiceProfileId: "production-project-my-voice",
  mode: "voice-clone",
});

const readFile = async (path: string) => {
  if (path === promptAudioPath) return sourceBytes;
  if (path === promptTextPath) return Buffer.from(`${promptText}\n`, "utf8");
  throw new Error("missing fixture");
};

test("prompt M4A normalizes in the explicit cache root without modifying source bytes", async (context) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "rsp-prompt-root-"));
  context.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const before = Buffer.from(Uint8Array.from(sourceBytes));
  const normalized = await normalizePromptAudio({
    sourceBytes,
    temporaryRoot,
    runProcess: async (_command, args) => {
      assert.match(
        relative(temporaryRoot, args[5] ?? ""),
        /^rsp-voxcpm-prompt-/u,
      );
      assert.deepEqual(args.slice(-5), [
        "-acodec",
        "pcm_s16le",
        "-f",
        "wav",
        args.at(-1),
      ]);
      assert.match(
        relative(temporaryRoot, args.at(-1) ?? ""),
        /^rsp-voxcpm-prompt-.*\/normalized\.wav$/u,
      );
      await writeFile(args.at(-1)!, canonicalPromptWav);
      return {
        exitCode: 0,
        stdout: Buffer.alloc(0),
        stderr: Buffer.alloc(0),
      };
    },
  });
  assert.deepEqual(sourceBytes, before);
  assert.deepEqual(measureCanonicalPcmWav(normalized).sampleFrameCount, 2);
});

test("high fidelity profile binds exact prompt transcript and canonical audio", async () => {
  const resolved = await resolveVoxcpmProfile({
    config,
    narration,
    readFile,
    normalizePromptAudio: async () => canonicalPromptWav,
  });
  assert.equal(resolved.safeDescriptor.mode, "high-fidelity-clone");
  assert.equal(
    resolved.safeDescriptor.adapterId,
    "voxcpm-high-fidelity-clone-http-v2",
  );
  assert.equal(resolved.endpointPath, "/clone_with_prompt");
  assert.equal(resolved.promptText, promptText);
  assert.deepEqual(resolved.promptAudioBytes, canonicalPromptWav);
  assert.deepEqual(resolved.referenceAudioBytes, canonicalPromptWav);
  assert.equal("controlInstruction" in resolved.safeDescriptor, false);
  assert.equal(
    JSON.stringify(resolved.safeDescriptor).includes("/srv/private"),
    false,
  );
});

test("high fidelity client sends only the frozen clone_with_prompt fields", async () => {
  const resolved = await resolveVoxcpmProfile({
    config,
    narration,
    readFile,
    normalizePromptAudio: async () => canonicalPromptWav,
  });
  let requestBody: FormData | undefined;
  const generate = createVoxcpmChunkGenerator({
    resolved,
    fetchImpl: (async (_input, init) => {
      requestBody = init?.body as FormData;
      return new Response(Uint8Array.from([1, 2]), {
        status: 200,
        headers: { "content-type": "audio/wav" },
      });
    }) as typeof fetch,
  });
  const request: ChunkAudioRequest = {
    generationInputFingerprint: `sha256:${"1".repeat(64)}`,
    providerAttemptFingerprint: `sha256:${"2".repeat(64)}`,
    requestFingerprint: `sha256:${"3".repeat(64)}`,
    chunkId: "problem-hook-01",
    meaningId: "problem-hook",
    ttsText: "一支完整视频，不只是把几张图排进时间线。",
  };
  await generate(request);
  assert.equal(requestBody?.get("text"), request.ttsText);
  assert.equal(requestBody?.get("prompt_text"), promptText);
  assert.ok(requestBody?.get("prompt_audio") instanceof Blob);
  assert.ok(requestBody?.get("reference_audio") instanceof Blob);
  for (const forbidden of ["control", "controlInstruction", "emotion"]) {
    assert.equal(requestBody?.has(forbidden), false);
  }
  assert.deepEqual([...(requestBody?.keys() ?? [])].sort(), [
    "cfg_value",
    "denoise",
    "inference_timesteps",
    "max_len",
    "min_len",
    "normalize",
    "prompt_audio",
    "prompt_text",
    "reference_audio",
    "retry_badcase",
    "retry_badcase_max_times",
    "retry_badcase_ratio_threshold",
    "save",
    "text",
  ]);
});

test("high fidelity profile rejects unconfirmed transcript and control fields", async () => {
  await assert.rejects(() =>
    resolveVoxcpmProfile({
      config: {
        ...config,
        voiceProfiles: [
          { ...config.voiceProfiles[0], promptTranscriptConfirmed: false },
        ],
      },
      narration,
      readFile,
      normalizePromptAudio: async () => canonicalPromptWav,
    }),
  );
  await assert.rejects(() =>
    resolveVoxcpmProfile({
      config: {
        ...config,
        voiceProfiles: [
          { ...config.voiceProfiles[0], controlInstruction: "excited" },
        ],
      },
      narration,
      readFile,
      normalizePromptAudio: async () => canonicalPromptWav,
    }),
  );
});

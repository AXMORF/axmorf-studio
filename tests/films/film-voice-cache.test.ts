import assert from "node:assert/strict";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  readProducerConfig,
  writeProducerConfig,
} from "../../scripts/config/producer-config";
import { createFilmVoiceService } from "../../scripts/films/voice";
import { createEdgeTtsChunkGenerator } from "../../scripts/narration/adapters/edge-tts-client";
import { encodeCanonicalPcmWav } from "../../scripts/narration/domain/pcm-wav";
import { validProducerConfig } from "../fixtures/producer-config";

test("film cache hits bypass Edge pacing, diagnostics and provider requests", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "axmorf-film-cache-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const configPath = join(rootDir, "private/producer.config.json");
  await writeProducerConfig({
    configPath,
    value: {
      ...validProducerConfig,
      tts: {
        ...validProducerConfig.tts,
        defaultProviderId: "edge",
        defaultVoiceProfileId: "narrator",
        providers: [
          {
            id: "edge",
            kind: "edge-tts",
            name: "Edge",
            service: "microsoft-edge-read-aloud",
            modelId: "edge-read-aloud",
            connection: { timeoutMs: 5_000 },
            voiceProfiles: [
              {
                id: "narrator",
                name: "Narrator",
                voiceId: "zh-CN-XiaoxiaoNeural",
                locale: "zh-CN",
              },
            ],
          },
        ],
      },
    },
  });
  let now = 0;
  const starts: number[] = [];
  const waits: number[] = [];
  const events: unknown[] = [];
  const wav = encodeCanonicalPcmWav(Buffer.alloc(4_800 * 2));
  const createService = () =>
    createFilmVoiceService({
      rootDir,
      env: { RSP_PRODUCER_CONFIG: configPath },
      createGenerator: ({ resolved }) => {
        assert.equal(resolved.kind, "edge-tts");
        if (resolved.kind !== "edge-tts") throw new Error("Expected Edge");
        return createEdgeTtsChunkGenerator({
          resolved,
          env: {},
          clock: {
            now: () => now,
            sleep: async (milliseconds) => {
              waits.push(milliseconds);
              now += milliseconds;
            },
          },
          reportDiagnostic: (event) => events.push(event),
          clientFactory: () => ({
            ttsPromise: async (_text, outputPath) => {
              starts.push(now);
              await writeFile(outputPath, Uint8Array.from(wav));
            },
          }),
        });
      },
    });

  const service = await createService();
  const sentence = { id: "s01", text: "缓存测试。" };
  const first = await service.speak(sentence);
  assert.deepEqual(await service.speak(sentence), first);
  const displayEdit = { ...sentence, caption: "缓存测试 2.0。" };
  assert.deepEqual(await service.speak(displayEdit), first);
  assert.deepEqual(starts, [0]);
  assert.deepEqual(waits, []);
  assert.equal(events.length, 2);

  await service.speak({ id: "s02", text: "另一句测试。" });
  assert.deepEqual(starts, [0, 10_000]);
  assert.deepEqual(waits, [10_000]);
  assert.equal(events.length, 4);

  const freshService = await createService();
  assert.deepEqual(await freshService.speak(sentence), first);
  assert.deepEqual(starts, [0, 10_000]);
  assert.deepEqual(waits, [10_000]);
  assert.equal(events.length, 4);

  const transferredRoot = await mkdtemp(
    join(tmpdir(), "axmorf-transferred-cache-"),
  );
  context.after(() => rm(transferredRoot, { recursive: true, force: true }));
  await cp(
    join(rootDir, ".axmorf/cache/voice"),
    join(transferredRoot, ".axmorf/cache/voice"),
    { recursive: true },
  );
  const transferred = await createFilmVoiceService({
    rootDir: transferredRoot,
    env: { RSP_PRODUCER_CONFIG: configPath },
    createGenerator: () => async () => {
      throw new Error("Migrated sentence cache must bypass TTS");
    },
  });
  assert.deepEqual(await transferred.speak(sentence), first);

  const config = await readProducerConfig({ configPath });
  await writeProducerConfig({
    configPath,
    value: {
      ...config,
      tts: {
        ...config.tts,
        providers: config.tts.providers.map((provider) =>
          provider.kind === "edge-tts"
            ? {
                ...provider,
                voiceProfiles: provider.voiceProfiles.map((profile) => ({
                  ...profile,
                  voiceId: "zh-CN-YunxiNeural",
                })),
              }
            : provider,
        ),
      },
    },
  });
  const changedVoice = await createService();
  await changedVoice.speak(sentence);
  assert.equal(
    starts.length,
    3,
    "Changing the voice must miss the cache even with identical text/timing inputs",
  );
});

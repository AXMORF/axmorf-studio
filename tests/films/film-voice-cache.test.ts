import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { writeProducerConfig } from "../../scripts/config/producer-config";
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
});

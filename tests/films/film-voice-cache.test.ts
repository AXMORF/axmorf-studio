import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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
  const transferredConfig = join(
    transferredRoot,
    "private/producer.config.json",
  );
  await cp(configPath, transferredConfig);
  const transferred = await createFilmVoiceService({
    rootDir: transferredRoot,
    env: { RSP_PRODUCER_CONFIG: transferredConfig },
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

for (const mode of ["controllable-clone", "high-fidelity-clone"] as const) {
  test(`VoxCPM ${mode} cache survives Workspace and material path changes but tracks audio inputs`, async (context) => {
    const rootDir = await mkdtemp(join(tmpdir(), "axmorf-voxcpm-cache-"));
    const transferredRoot = await mkdtemp(
      join(tmpdir(), "axmorf-voxcpm-move-"),
    );
    context.after(() => rm(rootDir, { recursive: true, force: true }));
    context.after(() => rm(transferredRoot, { recursive: true, force: true }));
    const configPath = join(rootDir, "private/producer.config.json");
    const audioPath = "private/voxcpm/prompt.wav";
    const textPath = "private/voxcpm/prompt.txt";
    const source = encodeCanonicalPcmWav(Buffer.alloc(4_800 * 2));
    await mkdir(join(rootDir, "private/voxcpm"), { recursive: true });
    await writeFile(join(rootDir, audioPath), Uint8Array.from(source));
    await writeFile(join(rootDir, textPath), "参考声音。");
    const provider = validProducerConfig.tts.providers[0];
    await writeProducerConfig({
      configPath,
      value: {
        ...validProducerConfig,
        tts: {
          ...validProducerConfig.tts,
          providers: [
            {
              ...provider,
              voiceProfiles: [
                {
                  id: "my-voice",
                  name: "Narrator",
                  ...(mode === "high-fidelity-clone"
                    ? {
                        mode,
                        promptAudioPath: audioPath,
                        promptTextPath: textPath,
                        promptTranscriptConfirmed: true,
                      }
                    : {
                        mode,
                        referenceAudioPath: audioPath,
                        controlInstruction: "自然、清晰。",
                      }),
                },
              ],
            },
          ],
        },
      },
    });
    let requests = 0;
    const createService = (root: string, allowGeneration = false) =>
      createFilmVoiceService({
        rootDir: root,
        env: {
          RSP_PRODUCER_CONFIG: join(root, "private/producer.config.json"),
        },
        createGenerator: () => async () => {
          if (!allowGeneration)
            throw new Error("Migrated cache must bypass TTS");
          requests += 1;
          return source;
        },
      });
    const sentence = { id: "s01", text: "跨目录缓存测试。" };
    const first = await (await createService(rootDir, true)).speak(sentence);
    assert.equal(requests, 1);
    await cp(join(rootDir, "private"), join(transferredRoot, "private"), {
      recursive: true,
    });
    await cp(join(rootDir, ".axmorf"), join(transferredRoot, ".axmorf"), {
      recursive: true,
    });
    assert.deepEqual(
      await (await createService(transferredRoot)).speak(sentence),
      first,
    );

    // Renaming material files and transport/profile labels must not change audio identity.
    const transferredConfigPath = join(
      transferredRoot,
      "private/producer.config.json",
    );
    const config = await readProducerConfig({
      configPath: transferredConfigPath,
    });
    await cp(
      join(transferredRoot, audioPath),
      join(transferredRoot, "private/renamed.wav"),
    );
    await cp(
      join(transferredRoot, textPath),
      join(transferredRoot, "private/renamed.txt"),
    );
    await writeProducerConfig({
      configPath: transferredConfigPath,
      value: {
        ...config,
        tts: {
          ...config.tts,
          providers: config.tts.providers.map((entry) =>
            entry.kind === "voxcpm"
              ? {
                  ...entry,
                  connection: {
                    ...entry.connection,
                    baseUrl: "http://tts.example.invalid",
                    timeoutMs: 30_000,
                    token: "rotated-test-token",
                  },
                  voiceProfiles: entry.voiceProfiles.map((profile) =>
                    profile.mode === "high-fidelity-clone"
                      ? {
                          ...profile,
                          name: "Renamed",
                          promptAudioPath: "private/renamed.wav",
                          promptTextPath: "private/renamed.txt",
                        }
                      : {
                          ...profile,
                          name: "Renamed",
                          referenceAudioPath: "private/renamed.wav",
                        },
                  ),
                }
              : entry,
          ),
        },
      },
    });
    assert.deepEqual(
      await (await createService(transferredRoot)).speak(sentence),
      first,
    );
    assert.equal(requests, 1);

    const changed = Buffer.from(source);
    changed.writeInt16LE(1_000, 44);
    await writeFile(
      join(transferredRoot, "private/renamed.wav"),
      Uint8Array.from(changed),
    );
    await assert.rejects(
      (await createService(transferredRoot)).speak(sentence),
      /must bypass TTS/u,
    );
    await writeFile(
      join(transferredRoot, "private/renamed.wav"),
      Uint8Array.from(source),
    );
    if (mode === "high-fidelity-clone") {
      await writeFile(
        join(transferredRoot, "private/renamed.txt"),
        "不同的参考文本。",
      );
      await assert.rejects(
        (await createService(transferredRoot)).speak(sentence),
        /must bypass TTS/u,
      );
      await writeFile(
        join(transferredRoot, "private/renamed.txt"),
        "参考声音。",
      );
    }
    const beforeRate = await readProducerConfig({
      configPath: transferredConfigPath,
    });
    await writeProducerConfig({
      configPath: transferredConfigPath,
      value: {
        ...beforeRate,
        tts: {
          ...beforeRate.tts,
          speech: { ...beforeRate.tts.speech, rate: 1.2 },
        },
      },
    });
    await assert.rejects(
      (await createService(transferredRoot)).speak(sentence),
      /must bypass TTS/u,
    );
    assert.equal(requests, 1, "Misses are stopped before any provider call");
  });
}

import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildProducerConfig, createFingerprint } from "../../src/contracts";
import {
  readProducerConfig,
  resolveDefaultTtsProvider,
  resolveProducerConfigPathFromEnvironment,
  toVoxcpmPrivateConfig,
  writeProducerConfig,
} from "../../scripts/config/producer-config";
import {
  migrateVoxcpmConfigToProducerConfig,
  runProducerConfigMigration,
} from "../../scripts/config/migrate";
import { VoxcpmPrivateConfigSchema } from "../../scripts/narration/adapters/private-config";
import { validProducerConfigInput } from "../contracts/producer-config.test";

test("private producer config writes atomically with owner-only permissions", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-config-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const configPath = join(rootDir, "private/producer.config.json");
  const written = await writeProducerConfig({
    configPath,
    value: validProducerConfigInput,
  });
  const loaded = await readProducerConfig({ configPath });
  assert.deepEqual(loaded, written);
  assert.equal((await stat(configPath)).mode & 0o777, 0o600);
  assert.match(await readFile(configPath, "utf8"), /visible-editable-token/u);
});

test("producer-config-v1 loads as v2 without mutating the private source file", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-config-v1-upgrade-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const configPath = join(rootDir, "private/producer.config.json");
  const shared = { ...validProducerConfigInput } as Record<string, unknown>;
  delete shared.sceneDefaults;
  const legacyInput = {
    ...shared,
    schemaVersion: 1,
    contractVersion: "producer-config-v1",
  } as const;
  const legacy = {
    ...legacyInput,
    configFingerprint: createFingerprint({
      namespace: "producer-config",
      version: 1,
      value: legacyInput,
    }),
  };
  await mkdir(join(rootDir, "private"), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(legacy, null, 2)}\n`, "utf8");

  const loaded = await readProducerConfig({ configPath });

  assert.equal(loaded.schemaVersion, 2);
  assert.equal(loaded.contractVersion, "producer-config-v2");
  assert.deepEqual(loaded.sceneDefaults, {
    introSceneTemplateId: "axmorf-brand-reveal-v1",
    outroSceneTemplateId: "axmorf-source-follow-v1",
  });
  assert.equal(
    JSON.parse(await readFile(configPath, "utf8")).contractVersion,
    "producer-config-v1",
  );

  const invalidLegacyInput = {
    ...legacyInput,
    sceneDefaults: {
      introSceneTemplateId: null,
      outroSceneTemplateId: null,
    },
  };
  await writeFile(
    configPath,
    `${JSON.stringify(
      {
        ...invalidLegacyInput,
        configFingerprint: createFingerprint({
          namespace: "producer-config",
          version: 1,
          value: invalidLegacyInput,
        }),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await assert.rejects(
    () => readProducerConfig({ configPath }),
    /v1 contains unknown fields/u,
  );
});

test("config paths resolve relative to the repository while shell env remains authoritative", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-config-env-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const dotenvPath = join(rootDir, "operator/producer.config.json");
  const shellPath = join(rootDir, "shell/producer.config.json");
  await writeFile(
    join(rootDir, ".env"),
    await readFile(".env.example", "utf8"),
    "utf8",
  );
  assert.equal(
    await resolveProducerConfigPathFromEnvironment({ rootDir, env: {} }),
    join(rootDir, "private/producer.config.json"),
  );
  await writeFile(
    join(rootDir, ".env"),
    `RSP_PRODUCER_CONFIG=${dotenvPath}\n`,
    "utf8",
  );

  assert.equal(
    await resolveProducerConfigPathFromEnvironment({ rootDir, env: {} }),
    dotenvPath,
  );
  await writeFile(
    join(rootDir, ".env"),
    "RSP_PRODUCER_CONFIG=operator/producer.config.json\n",
    "utf8",
  );
  assert.equal(
    await resolveProducerConfigPathFromEnvironment({ rootDir, env: {} }),
    dotenvPath,
  );
  assert.equal(
    await resolveProducerConfigPathFromEnvironment({
      rootDir,
      env: { RSP_PRODUCER_CONFIG: shellPath },
    }),
    shellPath,
  );
  assert.equal(
    await resolveProducerConfigPathFromEnvironment({
      rootDir,
      env: { RSP_PRODUCER_CONFIG: "shell/producer.config.json" },
    }),
    shellPath,
  );
  assert.equal(
    await resolveProducerConfigPathFromEnvironment({
      rootDir: join(rootDir, "missing-env"),
      env: {},
    }),
    join(rootDir, "missing-env/private/producer.config.json"),
  );
});

test("generic config resolves repository-relative voice paths at the VoxCPM adapter boundary", () => {
  const config = buildProducerConfig({
    ...validProducerConfigInput,
    tts: {
      ...validProducerConfigInput.tts,
      providers: [
        {
          ...validProducerConfigInput.tts.providers[0],
          voiceProfiles: [
            {
              ...validProducerConfigInput.tts.providers[0].voiceProfiles[0],
              referenceAudioPath: "voxcpm/voice_profile/my-voice.wav",
            },
            {
              id: "my-prompt-voice",
              name: "我的高品质声音",
              mode: "high-fidelity-clone",
              promptAudioPath: "voxcpm/voice_profile/my-prompt-voice.wav",
              promptTextPath: "voxcpm/voice_profile/my-prompt-voice.txt",
              promptTranscriptConfirmed: true,
            },
          ],
        },
      ],
    },
  });
  const provider = resolveDefaultTtsProvider(config);
  const runtime = toVoxcpmPrivateConfig(provider, "/repo");
  assert.equal(runtime.endpointPath, "/clone");
  assert.equal(runtime.voiceProfiles[0]?.id, "my-voice");
  assert.equal("name" in (runtime.voiceProfiles[0] ?? {}), false);
  assert.equal(
    runtime.voiceProfiles[0]?.mode === "controllable-clone"
      ? runtime.voiceProfiles[0].referenceAudioPath
      : undefined,
    "/repo/voxcpm/voice_profile/my-voice.wav",
  );
  assert.deepEqual(
    runtime.voiceProfiles[1]?.mode === "high-fidelity-clone"
      ? [
          runtime.voiceProfiles[1].promptAudioPath,
          runtime.voiceProfiles[1].promptTextPath,
        ]
      : undefined,
    [
      "/repo/voxcpm/voice_profile/my-prompt-voice.wav",
      "/repo/voxcpm/voice_profile/my-prompt-voice.txt",
    ],
  );
});

test("legacy VoxCPM settings migrate into the generic provider without losing modes", () => {
  const legacy = VoxcpmPrivateConfigSchema.parse({
    schemaVersion: 2,
    baseUrl: "http://127.0.0.1:9880",
    token: "private-token",
    timeoutMs: 120_000,
    modelId: "voxcpm-local",
    endpointPath: "/clone",
    parameters: {
      cfgValue: 2,
      inferenceTimesteps: 10,
      minLen: 2,
      maxLen: 4096,
      normalize: true,
      denoise: true,
      retryBadcase: true,
      retryBadcaseMaxTimes: 3,
      retryBadcaseRatioThreshold: 6,
    },
    voiceProfiles: [
      {
        id: "voice-a",
        mode: "controllable-clone",
        referenceAudioPath: "/private/voice-a.wav",
        controlInstruction: "自然。",
      },
      {
        id: "voice-b",
        mode: "high-fidelity-clone",
        promptAudioPath: "/private/voice-b.wav",
        promptTextPath: "/private/voice-b.txt",
        promptTranscriptConfirmed: true,
      },
    ],
  });
  const migrated = migrateVoxcpmConfigToProducerConfig({
    legacy,
    rootDir: "/private",
  });
  assert.equal(migrated.tts.providers[0]?.connection.token, "private-token");
  assert.deepEqual(
    migrated.tts.providers[0]?.voiceProfiles.map(({ mode }) => mode),
    ["controllable-clone", "high-fidelity-clone"],
  );
  assert.deepEqual(migrated.tts.speech, {
    rate: 1,
    targetLoudnessLufs: -16,
  });
  assert.equal(
    migrated.tts.providers[0]?.voiceProfiles[0]?.mode === "controllable-clone"
      ? migrated.tts.providers[0].voiceProfiles[0].referenceAudioPath
      : undefined,
    "voice-a.wav",
  );
  assert.deepEqual(
    migrated.tts.providers[0]?.voiceProfiles[1]?.mode === "high-fidelity-clone"
      ? [
          migrated.tts.providers[0].voiceProfiles[1].promptAudioPath,
          migrated.tts.providers[0].voiceProfiles[1].promptTextPath,
        ]
      : undefined,
    ["voice-b.wav", "voice-b.txt"],
  );
});

test("migration atomically refuses to overwrite an existing producer config", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-config-migration-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  await mkdir(join(rootDir, "voxcpm"), { recursive: true });
  await writeFile(
    join(rootDir, "voxcpm/voxcpm.private.json"),
    `${JSON.stringify({
      schemaVersion: 2,
      baseUrl: "http://127.0.0.1:9880",
      timeoutMs: 120_000,
      modelId: "voxcpm-local",
      endpointPath: "/clone",
      parameters: {
        cfgValue: 2,
        inferenceTimesteps: 10,
        minLen: 2,
        maxLen: 4096,
        normalize: true,
        denoise: true,
        retryBadcase: true,
        retryBadcaseMaxTimes: 3,
        retryBadcaseRatioThreshold: 6,
      },
      voiceProfiles: [
        {
          id: "voice-a",
          mode: "controllable-clone",
          referenceAudioPath: join(rootDir, "voxcpm/voice_profile/voice-a.wav"),
          controlInstruction: "自然。",
        },
      ],
    })}\n`,
    "utf8",
  );

  await runProducerConfigMigration({ rootDir });
  const destination = join(rootDir, "private/producer.config.json");
  const original = await readFile(destination, "utf8");
  await assert.rejects(
    runProducerConfigMigration({ rootDir }),
    /refused to overwrite/iu,
  );
  assert.equal(await readFile(destination, "utf8"), original);
});

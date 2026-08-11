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

import { buildProducerConfig } from "../../src/contracts";
import {
  readProducerConfig,
  resolveDefaultTtsProvider,
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

test("generic config projects the selected VoxCPM adapter without UI-only names", () => {
  const config = buildProducerConfig(validProducerConfigInput);
  const provider = resolveDefaultTtsProvider(config);
  const runtime = toVoxcpmPrivateConfig(provider);
  assert.equal(runtime.endpointPath, "/clone");
  assert.equal(runtime.voiceProfiles[0]?.id, "my-voice");
  assert.equal("name" in (runtime.voiceProfiles[0] ?? {}), false);
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
  const migrated = migrateVoxcpmConfigToProducerConfig({ legacy });
  assert.equal(migrated.tts.providers[0]?.connection.token, "private-token");
  assert.deepEqual(
    migrated.tts.providers[0]?.voiceProfiles.map(({ mode }) => mode),
    ["controllable-clone", "high-fidelity-clone"],
  );
  assert.deepEqual(migrated.tts.speech, {
    rate: 1,
    targetLoudnessLufs: -16,
  });
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
          referenceAudioPath: "/private/voice-a.wav",
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

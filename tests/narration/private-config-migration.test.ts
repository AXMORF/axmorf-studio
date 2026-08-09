import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  migrateVoxcpmPrivateConfigFile,
  migrateVoxcpmPrivateConfigValue,
  VoxcpmPrivateConfigMigrationBlocker,
} from "../../scripts/narration/adapters/private-config-migration";
import { encodeCanonicalPcmWav } from "../../scripts/narration/domain/pcm-wav";

const legacyConfig = ({ promptAudioPath, promptTextPath }: {
  readonly promptAudioPath: string;
  readonly promptTextPath: string;
}) => ({
  schemaVersion: 1,
  baseUrl: "http://127.0.0.1:8810",
  timeoutMs: 180_000,
  modelId: "VoxCPM2-local",
  endpointPath: "/clone",
  parameters: {
    cfgValue: 2,
    inferenceTimesteps: 10,
    normalize: true,
    denoise: false,
    retryBadcase: true,
  },
  voiceProfiles: [
    {
      id: "my-voice",
      mode: "controllable-clone",
      referenceAudioPath: promptAudioPath,
      controlInstruction: "fixture control",
    },
    {
      id: "confirmed-prompt-source",
      mode: "high-fidelity-clone",
      promptAudioPath,
      promptTextPath,
      promptTranscriptConfirmed: true,
    },
  ],
});

test("safe migration upgrades parameters and replaces only the target mode", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-voxcpm-migration-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const promptAudioPath = join(rootDir, "prompt.wav");
  const promptTextPath = join(rootDir, "prompt.txt");
  const configPath = join(rootDir, "voxcpm.private.json");
  await mkdir(rootDir, { recursive: true });
  await writeFile(promptAudioPath, "fixture audio");
  await writeFile(promptTextPath, "confirmed exact fixture transcript\n");
  await writeFile(
    configPath,
    `${JSON.stringify(legacyConfig({ promptAudioPath, promptTextPath }))}\n`,
    { mode: 0o600 },
  );

  const result = await migrateVoxcpmPrivateConfigFile({
    configPath,
    targetProfileId: "my-voice",
    normalizePromptAudio: async () =>
      encodeCanonicalPcmWav(Buffer.from([0, 0, 1, 0])),
  });
  assert.deepEqual(result, {
    status: "migrated",
    schemaVersion: 2,
    mode: "high-fidelity-clone",
  });
  const migrated = JSON.parse(await readFile(configPath, "utf8"));
  assert.equal(migrated.schemaVersion, 2);
  assert.deepEqual(migrated.parameters, {
    cfgValue: 2,
    denoise: false,
    inferenceTimesteps: 10,
    maxLen: 4096,
    minLen: 2,
    normalize: true,
    retryBadcase: true,
    retryBadcaseMaxTimes: 3,
    retryBadcaseRatioThreshold: 6,
  });
  const target = migrated.voiceProfiles.find(
    (profile: { id: string }) => profile.id === "my-voice",
  );
  assert.deepEqual(target, {
    id: "my-voice",
    mode: "high-fidelity-clone",
    promptAudioPath,
    promptTextPath,
    promptTranscriptConfirmed: true,
  });
});

test("safe migration blocks when no confirmed transcript is bound to the same audio", () => {
  const rawConfig = legacyConfig({
    promptAudioPath: "/fixture/prompt.wav",
    promptTextPath: "/fixture/prompt.txt",
  });
  assert.throws(
    () =>
      migrateVoxcpmPrivateConfigValue({
        rawConfig: {
          ...rawConfig,
          voiceProfiles: [rawConfig.voiceProfiles[0]],
        },
        targetProfileId: "my-voice",
      }),
    VoxcpmPrivateConfigMigrationBlocker,
  );
});

test("safe migration accepts an explicitly confirmed unique same-stem transcript", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-voxcpm-migration-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const promptAudioPath = join(rootDir, "prompt.wav");
  const promptTextPath = join(rootDir, "prompt.txt");
  const configPath = join(rootDir, "voxcpm.private.json");
  await writeFile(promptAudioPath, "fixture audio");
  await writeFile(promptTextPath, "confirmed exact fixture transcript\n");
  const rawConfig = legacyConfig({ promptAudioPath, promptTextPath });
  await writeFile(
    configPath,
    `${JSON.stringify({
      ...rawConfig,
      voiceProfiles: [rawConfig.voiceProfiles[0]],
    })}\n`,
    { mode: 0o600 },
  );

  const result = await migrateVoxcpmPrivateConfigFile({
    configPath,
    targetProfileId: "my-voice",
    confirmAdjacentTranscript: true,
    normalizePromptAudio: async () =>
      encodeCanonicalPcmWav(Buffer.from([0, 0, 1, 0])),
  });

  assert.deepEqual(result, {
    status: "migrated",
    schemaVersion: 2,
    mode: "high-fidelity-clone",
  });
  const migrated = JSON.parse(await readFile(configPath, "utf8"));
  const target = migrated.voiceProfiles.find(
    (profile: { id: string }) => profile.id === "my-voice",
  );
  assert.deepEqual(target, {
    id: "my-voice",
    mode: "high-fidelity-clone",
    promptAudioPath,
    promptTextPath,
    promptTranscriptConfirmed: true,
  });
});

test("safe migration rejects ambiguous adjacent transcript candidates", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-voxcpm-migration-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const promptAudioPath = join(rootDir, "prompt.wav");
  const promptTextPath = join(rootDir, "prompt.txt");
  const configPath = join(rootDir, "voxcpm.private.json");
  await writeFile(promptAudioPath, "fixture audio");
  await writeFile(promptTextPath, "confirmed exact fixture transcript\n");
  await writeFile(join(rootDir, "other.txt"), "ambiguous fixture transcript\n");
  const rawConfig = legacyConfig({ promptAudioPath, promptTextPath });
  await writeFile(
    configPath,
    `${JSON.stringify({
      ...rawConfig,
      voiceProfiles: [rawConfig.voiceProfiles[0]],
    })}\n`,
    { mode: 0o600 },
  );

  await assert.rejects(
    migrateVoxcpmPrivateConfigFile({
      configPath,
      targetProfileId: "my-voice",
      confirmAdjacentTranscript: true,
      normalizePromptAudio: async () =>
        encodeCanonicalPcmWav(Buffer.from([0, 0, 1, 0])),
    }),
    VoxcpmPrivateConfigMigrationBlocker,
  );
});

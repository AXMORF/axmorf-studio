import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createDesktopSettingsSnapshot,
  mergeDesktopSettingsSaveRequest,
} from "../../desktop/application/manage-settings";
import { createDesktopPrivateConfig } from "../../desktop/contracts/settings";
import { buildProducerConfig } from "../../src/contracts";

const producerConfig = buildProducerConfig({
  schemaVersion: 4,
  contractVersion: "producer-config-v4",
  renderDefaults: { width: 1080, height: 1920, fps: 30, locale: "zh-CN" },
  readability: { edgeInsetPx: 90 },
  sceneDefaults: {
    introSceneTemplateId: "axmorf-brand-reveal-v1",
    outroSceneTemplateId: "axmorf-source-follow-v1",
  },
  audioDefaults: { globalBgm: null },
  publishingCollections: [
    { id: "default", name: "默认合集", description: "默认发布合集" },
  ],
  tts: {
    defaultProviderId: "cloud",
    defaultVoiceProfileId: "alloy",
    speech: { rate: 1, targetLoudnessLufs: -16 },
    providers: [
      {
        id: "local",
        kind: "voxcpm",
        name: "Local VoxCPM",
        connection: {
          baseUrl: "http://127.0.0.1:9880",
          token: "local-private-token",
          timeoutMs: 120_000,
        },
        modelId: "voxcpm-1.5",
        routes: {
          controllableClone: "/clone",
          highFidelityClone: "/clone_with_prompt",
        },
        parameters: {
          cfgValue: 2,
          inferenceTimesteps: 10,
          minLen: 2,
          maxLen: 4096,
          normalize: true,
          denoise: false,
          retryBadcase: false,
          retryBadcaseMaxTimes: 0,
          retryBadcaseRatioThreshold: 6,
        },
        voiceProfiles: [
          {
            id: "local-voice",
            name: "Local voice",
            mode: "controllable-clone",
            referenceAudioPath: "voxcpm/voice_profile/reference.wav",
            controlInstruction: "自然、清晰。",
          },
        ],
      },
      {
        id: "cloud",
        kind: "speech-sdk",
        vendor: "openai",
        name: "OpenAI direct",
        connection: { apiKey: "cloud-private-key", timeoutMs: 60_000 },
        modelId: "gpt-4o-mini-tts",
        voiceProfiles: [
          {
            id: "alloy",
            name: "Alloy",
            voiceId: "alloy",
            source: "catalog",
          },
        ],
      },
    ],
  },
});

test("Desktop form snapshot never echoes secrets and blank fields preserve them", () => {
  const current = createDesktopPrivateConfig({ producerConfig });
  const snapshot = createDesktopSettingsSnapshot({ privateConfig: current });
  assert.doesNotMatch(
    JSON.stringify(snapshot),
    /local-private-token|cloud-private-key/u,
  );
  assert.deepEqual(
    snapshot.secrets.map(({ providerId, field, configured }) => ({
      providerId,
      field,
      configured,
    })),
    [
      { providerId: "local", field: "token", configured: true },
      { providerId: "cloud", field: "apiKey", configured: true },
    ],
  );

  const merged = mergeDesktopSettingsSaveRequest({
    current,
    request: {
      schemaVersion: 1,
      config: snapshot.config,
      executionPreferences: snapshot.executionPreferences,
      deliveryPolicy: snapshot.deliveryPolicy,
      clearedSecrets: [],
    },
  });
  const local = merged.producerConfig.tts.providers.find(
    ({ id }) => id === "local",
  );
  const cloud = merged.producerConfig.tts.providers.find(
    ({ id }) => id === "cloud",
  );
  assert.equal(
    local?.kind === "voxcpm" ? local.connection.token : null,
    "local-private-token",
  );
  assert.equal(
    cloud?.kind === "speech-sdk" ? cloud.connection.apiKey : null,
    "cloud-private-key",
  );
});

test("Desktop form can explicitly clear an optional token and replace an API key", () => {
  const current = createDesktopPrivateConfig({ producerConfig });
  const snapshot = createDesktopSettingsSnapshot({ privateConfig: current });
  const draft = structuredClone(snapshot.config);
  const cloud = draft.tts.providers.find(({ id }) => id === "cloud");
  assert.equal(cloud?.kind, "speech-sdk");
  if (cloud?.kind === "speech-sdk") cloud.connection.apiKey = "new-cloud-key";
  const merged = mergeDesktopSettingsSaveRequest({
    current,
    request: {
      schemaVersion: 1,
      config: draft,
      executionPreferences: {
        ...snapshot.executionPreferences,
        creativeTaskExecution: { mode: "subagents", maxConcurrency: 3 },
      },
      deliveryPolicy: "automatic",
      clearedSecrets: [{ providerId: "local", field: "token" }],
    },
  });
  const local = merged.producerConfig.tts.providers.find(
    ({ id }) => id === "local",
  );
  const savedCloud = merged.producerConfig.tts.providers.find(
    ({ id }) => id === "cloud",
  );
  assert.equal(
    local?.kind === "voxcpm" ? local.connection.token : null,
    undefined,
  );
  assert.equal(
    savedCloud?.kind === "speech-sdk"
      ? savedCloud.connection.apiKey
      : null,
    "new-cloud-key",
  );
  assert.deepEqual(merged.executionPreferences.creativeTaskExecution, {
    mode: "subagents",
    maxConcurrency: 3,
  });
  assert.equal(merged.deliveryPolicy, "automatic");
});

test("Desktop renderer uses the shared forms and structured settings errors, not raw JSON", async () => {
  const [app, settings, tts, preload] = await Promise.all([
    readFile("desktop/renderer/App.tsx", "utf8"),
    readFile("desktop/renderer/SettingsPage.tsx", "utf8"),
    readFile("settings/client/features/config/TtsSettings.tsx", "utf8"),
    readFile("desktop/preload/shell.ts", "utf8"),
  ]);
  assert.match(app, /Preview[\s\S]*配置/u);
  assert.match(settings, /<General|<SafeArea|<SceneDefaults|<Collections/u);
  assert.match(settings, /<ExecutionSettings|<Tts/u);
  assert.match(settings, /SettingsErrorPanel/u);
  assert.match(settings, /error\.issues\.map/u);
  assert.match(settings, /保存并重启 Engine/u);
  assert.doesNotMatch(app, /ProducerConfig JSON|providerConfigJson/u);
  assert.doesNotMatch(settings, /JSON\.stringify\(config|localStorage/u);
  assert.match(tts, /已安全保存且不会回显/u);
  assert.match(tts, /onSecretClear/u);
  assert.match(preload, /getSettings/u);
  assert.match(preload, /saveSettings/u);
});

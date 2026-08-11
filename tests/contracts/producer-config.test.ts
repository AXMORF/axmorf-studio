import assert from "node:assert/strict";
import test from "node:test";

import {
  ProducerConfigSchema,
  buildProducerConfig,
  computePublishingCollectionCatalogFingerprint,
} from "../../src/contracts/producer-config";

export const validProducerConfigInput = {
  schemaVersion: 1,
  contractVersion: "producer-config-v1",
  renderDefaults: {
    width: 1080,
    height: 1920,
    fps: 30,
    locale: "zh-CN",
  },
  readability: { edgeInsetPx: 90 },
  publishingCollections: [
    {
      id: "ai-workflow",
      name: "AI 工作流",
      description: "AI 工具、工作流和系统重构相关的理性观点视频。",
    },
    {
      id: "tech-explained",
      name: "技术解释",
      description: "面向非专业观众的技术概念解释。",
    },
  ],
  tts: {
    defaultProviderId: "local-voxcpm",
    defaultVoiceProfileId: "my-voice",
    speech: { rate: 1, targetLoudnessLufs: -16 },
    providers: [
      {
        id: "local-voxcpm",
        kind: "voxcpm",
        name: "本地 VoxCPM",
        connection: {
          baseUrl: "http://127.0.0.1:9880",
          token: "visible-editable-token",
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
          denoise: true,
          retryBadcase: true,
          retryBadcaseMaxTimes: 3,
          retryBadcaseRatioThreshold: 6,
        },
        voiceProfiles: [
          {
            id: "my-voice",
            name: "我的声音",
            mode: "controllable-clone",
            referenceAudioPath: "/srv/private/my-voice.wav",
            controlInstruction: "自然、克制、清晰。",
          },
        ],
      },
    ],
  },
} as const;

test("one strict config owns render, readability, collections, and generic TTS", () => {
  const config = buildProducerConfig(validProducerConfigInput);
  assert.equal(config.renderDefaults.width, 1080);
  assert.equal(config.readability.edgeInsetPx, 90);
  assert.equal(config.publishingCollections.length, 2);
  assert.equal(config.tts.speech.rate, 1);
  assert.equal(config.tts.speech.targetLoudnessLufs, -16);
  assert.equal(config.tts.providers[0]?.kind, "voxcpm");
  assert.match(config.configFingerprint, /^sha256:[a-f0-9]{64}$/u);
});

test("token remains present in the parsed config for the local settings UI", () => {
  const config = buildProducerConfig(validProducerConfigInput);
  assert.equal(
    config.tts.providers[0]?.connection.token,
    "visible-editable-token",
  );
});

test("defaults and identifiers fail closed when they are ambiguous", () => {
  assert.throws(() =>
    buildProducerConfig({
      ...validProducerConfigInput,
      publishingCollections: [
        validProducerConfigInput.publishingCollections[0],
        validProducerConfigInput.publishingCollections[0],
      ],
    }),
  );
  assert.throws(() =>
    buildProducerConfig({
      ...validProducerConfigInput,
      tts: {
        ...validProducerConfigInput.tts,
        defaultProviderId: "missing-provider",
      },
    }),
  );
});

test("fingerprints reject drift and collection order is authority", () => {
  const config = buildProducerConfig(validProducerConfigInput);
  assert.throws(() =>
    ProducerConfigSchema.parse({
      ...config,
      readability: { edgeInsetPx: 120 },
    }),
  );
  assert.notEqual(
    computePublishingCollectionCatalogFingerprint(
      validProducerConfigInput.publishingCollections,
    ),
    computePublishingCollectionCatalogFingerprint(
      [...validProducerConfigInput.publishingCollections].reverse(),
    ),
  );
});

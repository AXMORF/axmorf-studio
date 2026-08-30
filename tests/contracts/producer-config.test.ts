import assert from "node:assert/strict";
import test from "node:test";

import {
  ProducerConfigSchema,
  buildProducerConfig,
  computePublishingCollectionCatalogFingerprint,
} from "@axmorf/studio/contracts";
import {
  EDGE_TTS_VOICE_DEFINITIONS,
  SPEECH_SDK_VENDORS,
  getEdgeTtsVoiceDefinition,
  getSpeechSdkVendorDefinition,
} from "@axmorf/studio/contracts";

export const validProducerConfigInput = {
  schemaVersion: 4,
  contractVersion: "producer-config-v4",
  renderDefaults: {
    width: 1080,
    height: 1920,
    fps: 30,
    locale: "zh-CN",
  },
  readability: { edgeInsetPx: 90 },
  sceneDefaults: {
    introSceneTemplateId: "axmorf-brand-reveal-v1",
    outroSceneTemplateId: "axmorf-source-follow-v1",
  },
  audioDefaults: {
    globalBgm: {
      sourcePath: "public/audio/default-bgm.mp3",
      volume: 0.15,
    },
  },
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
            referenceAudioPath: "voxcpm/voice_profile/my-voice.wav",
            controlInstruction: "自然、克制、清晰。",
          },
        ],
      },
    ],
  },
} as const;

test("one strict config owns render, Scene defaults, collections, and generic TTS", () => {
  const config = buildProducerConfig(validProducerConfigInput);
  assert.equal(config.renderDefaults.width, 1080);
  assert.equal(config.readability.edgeInsetPx, 90);
  assert.deepEqual(config.sceneDefaults, {
    introSceneTemplateId: "axmorf-brand-reveal-v1",
    outroSceneTemplateId: "axmorf-source-follow-v1",
  });
  assert.deepEqual(config.audioDefaults?.globalBgm, {
    sourcePath: "public/audio/default-bgm.mp3",
    volume: 0.15,
  });
  assert.equal(config.publishingCollections.length, 2);
  assert.equal(config.tts.speech.rate, 1);
  assert.equal(config.tts.speech.targetLoudnessLufs, -16);
  assert.equal(config.tts.providers[0]?.kind, "voxcpm");
  assert.match(config.configFingerprint, /^sha256:[a-f0-9]{64}$/u);
});

test("mixed local and SpeechSDK OpenAI providers keep strict provider and voice defaults", () => {
  const cloud = {
    id: "openai-direct",
    kind: "speech-sdk",
    vendor: "openai",
    name: "OpenAI direct",
    connection: {
      apiKey: "private-openai-key",
      baseUrl: "https://api.openai.com/v1",
      timeoutMs: 60_000,
    },
    modelId: "gpt-4o-mini-tts",
    voiceProfiles: [
      {
        id: "cloud-voice",
        name: "Cloud voice",
        voiceId: "alloy",
        source: "catalog",
      },
    ],
  } as const;
  const config = buildProducerConfig({
    ...validProducerConfigInput,
    tts: {
      ...validProducerConfigInput.tts,
      defaultProviderId: cloud.id,
      defaultVoiceProfileId: "cloud-voice",
      providers: [validProducerConfigInput.tts.providers[0], cloud],
    },
  });
  assert.deepEqual(
    config.tts.providers.map(({ kind }) => kind),
    ["voxcpm", "speech-sdk"],
  );
  assert.equal(config.tts.defaultProviderId, "openai-direct");
  assert.throws(() =>
    buildProducerConfig({
      ...validProducerConfigInput,
      tts: {
        ...validProducerConfigInput.tts,
        defaultProviderId: cloud.id,
        defaultVoiceProfileId: "my-voice",
        providers: [validProducerConfigInput.tts.providers[0], cloud],
      },
    }),
  );
  assert.throws(() =>
    buildProducerConfig({
      ...validProducerConfigInput,
      tts: {
        ...validProducerConfigInput.tts,
        defaultProviderId: cloud.id,
        defaultVoiceProfileId: "cloud-voice",
        providers: [
          validProducerConfigInput.tts.providers[0],
          {
            ...cloud,
            vendor: "unsupported",
            fallbackProviderId: "local-voxcpm",
          },
        ],
      },
    }),
  );
});

test("all enabled SpeechSDK direct vendors and Edge keep strict model and voice bindings", () => {
  for (const vendor of SPEECH_SDK_VENDORS) {
    const definition = getSpeechSdkVendorDefinition(vendor);
    const config = buildProducerConfig({
      ...validProducerConfigInput,
      tts: {
        ...validProducerConfigInput.tts,
        defaultProviderId: `${vendor}-direct`,
        defaultVoiceProfileId: "remote-voice",
        providers: [
          {
            id: `${vendor}-direct`,
            kind: "speech-sdk",
            vendor,
            name: `${definition.label} direct`,
            connection: { apiKey: "private-key", timeoutMs: 60_000 },
            modelId: definition.defaultModel,
            voiceProfiles: [
              {
                id: "remote-voice",
                name: "Remote voice",
                voiceId: "provider-voice-id",
                source: "catalog",
              },
            ],
          },
        ],
      },
    });
    assert.equal(config.tts.providers[0]?.kind, "speech-sdk");
  }

  const edge = buildProducerConfig({
    ...validProducerConfigInput,
    tts: {
      ...validProducerConfigInput.tts,
      defaultProviderId: "edge-free",
      defaultVoiceProfileId: "edge-voice",
      providers: [
        {
          id: "edge-free",
          kind: "edge-tts",
          service: "microsoft-edge-read-aloud",
          name: "Edge free",
          connection: { timeoutMs: 60_000 },
          modelId: "edge-read-aloud",
          voiceProfiles: [
            {
              id: "edge-voice",
              name: "晓晓",
              voiceId: "zh-CN-XiaoxiaoNeural",
              locale: "zh-CN",
            },
          ],
        },
      ],
    },
  });
  assert.equal(edge.tts.providers[0]?.kind, "edge-tts");

  assert.equal(EDGE_TTS_VOICE_DEFINITIONS.length, 14);
  assert.equal(
    getEdgeTtsVoiceDefinition("zh-TW-HsiaoYuNeural")?.locale,
    "zh-TW",
  );
  for (const profile of [
    {
      id: "edge-voice",
      name: "Unknown",
      voiceId: "zh-CN-NotARealVoiceNeural",
      locale: "zh-CN",
    },
    {
      id: "edge-voice",
      name: "Mismatched locale",
      voiceId: "zh-CN-XiaoxiaoNeural",
      locale: "zh-TW",
    },
  ] as const) {
    assert.throws(() =>
      buildProducerConfig({
        ...validProducerConfigInput,
        tts: {
          ...validProducerConfigInput.tts,
          defaultProviderId: "edge-free",
          defaultVoiceProfileId: "edge-voice",
          providers: [
            {
              id: "edge-free",
              kind: "edge-tts",
              service: "microsoft-edge-read-aloud",
              name: "Edge free",
              connection: { timeoutMs: 60_000 },
              modelId: "edge-read-aloud",
              voiceProfiles: [profile],
            },
          ],
        },
      }),
    );
  }

  for (const vendor of ["fal", "google", "gateway"] as const) {
    assert.throws(() =>
      buildProducerConfig({
        ...validProducerConfigInput,
        tts: {
          ...validProducerConfigInput.tts,
          providers: [
            {
              id: `${vendor}-direct`,
              kind: "speech-sdk",
              vendor,
              name: vendor,
              connection: { apiKey: "private-key", timeoutMs: 60_000 },
              modelId: "default",
              voiceProfiles: [
                {
                  id: "remote-voice",
                  name: "Remote",
                  voiceId: "voice",
                  source: "catalog",
                },
              ],
            },
          ],
        },
      }),
    );
  }
});

test("voice and BGM files must use safe repository-relative paths", () => {
  assert.throws(() =>
    buildProducerConfig({
      ...validProducerConfigInput,
      audioDefaults: {
        globalBgm: { sourcePath: "/srv/audio/bgm.mp3", volume: 0.15 },
      },
    }),
  );
  assert.throws(() =>
    buildProducerConfig({
      ...validProducerConfigInput,
      tts: {
        ...validProducerConfigInput.tts,
        providers: [
          {
            ...validProducerConfigInput.tts.providers[0],
            voiceProfiles: [
              {
                ...validProducerConfigInput.tts.providers[0].voiceProfiles[0],
                referenceAudioPath: "../private/my-voice.wav",
              },
            ],
          },
        ],
      },
    }),
  );
});

test("token remains present in the parsed config for the local settings UI", () => {
  const config = buildProducerConfig(validProducerConfigInput);
  const provider = config.tts.providers[0];
  assert.equal(provider?.kind, "voxcpm");
  if (provider?.kind !== "voxcpm") throw new Error("Expected VoxCPM fixture.");
  assert.equal(provider.connection.token, "visible-editable-token");
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

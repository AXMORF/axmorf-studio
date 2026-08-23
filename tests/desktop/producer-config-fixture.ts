import { buildProducerConfig } from "../../src/contracts";

export const desktopProducerConfigFixture = buildProducerConfig({
  schemaVersion: 4,
  contractVersion: "producer-config-v4",
  renderDefaults: { width: 1920, height: 1080, fps: 30, locale: "zh-CN" },
  readability: { edgeInsetPx: 64 },
  sceneDefaults: {
    introSceneTemplateId: null,
    outroSceneTemplateId: null,
  },
  publishingCollections: [
    { id: "default", name: "Default", description: "Default" },
  ],
  tts: {
    defaultProviderId: "edge",
    defaultVoiceProfileId: "zh-cn-xiaoxiao",
    speech: { rate: 1, targetLoudnessLufs: -16 },
    providers: [
      {
        id: "edge",
        kind: "edge-tts",
        service: "microsoft-edge-read-aloud",
        name: "Edge",
        connection: { timeoutMs: 1_000 },
        modelId: "edge-read-aloud",
        voiceProfiles: [
          {
            id: "zh-cn-xiaoxiao",
            name: "Voice",
            voiceId: "zh-CN-XiaoxiaoNeural",
            locale: "zh-CN",
          },
        ],
      },
    ],
  },
});

/** A valid private producer config used by narration and film tests. */
export const validProducerConfig = {
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
    introSceneTemplateId: null,
    outroSceneTemplateId: null,
  },
  audioDefaults: { globalBgm: null },
  publishingCollections: [
    {
      id: "ai-workflow",
      name: "AI 工作流",
      description: "AI 工具、工作流和系统重构相关的理性观点视频。",
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

export const SPEECH_SDK_VENDOR_DEFINITIONS = {
  cartesia: {
    label: "Cartesia",
    models: ["sonic-3.5", "sonic-3", "sonic-2"],
    defaultModel: "sonic-3.5",
    maxInputChars: 2_000,
    voiceCapabilities: ["catalog", "remote-clone"],
  },
  deepgram: {
    label: "Deepgram",
    models: ["aura-2"],
    defaultModel: "aura-2",
    maxInputChars: 2_000,
    voiceCapabilities: ["catalog"],
  },
  elevenlabs: {
    label: "ElevenLabs",
    models: [
      "eleven_v3",
      "eleven_multilingual_v2",
      "eleven_flash_v2_5",
      "eleven_flash_v2",
    ],
    defaultModel: "eleven_multilingual_v2",
    maxInputChars: 5_000,
    voiceCapabilities: ["catalog", "remote-clone", "remote-designed"],
  },
  "fish-audio": {
    label: "Fish Audio",
    models: ["s2-pro"],
    defaultModel: "s2-pro",
    maxInputChars: 2_000,
    voiceCapabilities: ["catalog", "remote-clone", "remote-designed"],
  },
  gradium: {
    label: "Gradium",
    models: ["default"],
    defaultModel: "default",
    maxInputChars: 20_000,
    voiceCapabilities: ["catalog", "remote-clone"],
  },
  hume: {
    label: "Hume",
    models: ["octave-2", "octave-1"],
    defaultModel: "octave-2",
    maxInputChars: 5_000,
    voiceCapabilities: ["catalog", "remote-designed"],
  },
  inworld: {
    label: "Inworld",
    models: [
      "inworld-tts-1.5-max",
      "inworld-tts-1.5-mini",
      "inworld-tts-2",
    ],
    defaultModel: "inworld-tts-1.5-max",
    maxInputChars: 2_000,
    voiceCapabilities: ["catalog", "remote-clone", "remote-designed"],
  },
  minimax: {
    label: "MiniMax",
    models: ["speech-2.8-hd", "speech-2.8-turbo"],
    defaultModel: "speech-2.8-hd",
    maxInputChars: 3_000,
    voiceCapabilities: ["catalog", "remote-clone", "remote-designed"],
  },
  mistral: {
    label: "Mistral",
    models: ["voxtral-mini-tts-2603"],
    defaultModel: "voxtral-mini-tts-2603",
    maxInputChars: 2_000,
    voiceCapabilities: ["catalog", "remote-clone"],
  },
  murf: {
    label: "Murf",
    models: ["GEN2", "FALCON"],
    defaultModel: "GEN2",
    maxInputChars: 2_000,
    voiceCapabilities: ["catalog"],
  },
  openai: {
    label: "OpenAI",
    models: ["gpt-4o-mini-tts", "tts-1", "tts-1-hd"],
    defaultModel: "gpt-4o-mini-tts",
    maxInputChars: 4_096,
    voiceCapabilities: ["catalog"],
  },
  resemble: {
    label: "Resemble",
    models: ["default"],
    defaultModel: "default",
    maxInputChars: 2_000,
    voiceCapabilities: ["catalog", "remote-designed"],
  },
  "smallest-ai": {
    label: "SmallestAI",
    models: ["lightning_v3.1", "lightning_v3.1_pro"],
    defaultModel: "lightning_v3.1",
    maxInputChars: 2_000,
    voiceCapabilities: ["catalog", "remote-clone"],
  },
  speechify: {
    label: "Speechify",
    models: ["simba-english", "simba-3.0", "simba-multilingual"],
    defaultModel: "simba-english",
    maxInputChars: 2_000,
    voiceCapabilities: ["catalog"],
  },
  xai: {
    label: "xAI",
    models: ["grok-tts"],
    defaultModel: "grok-tts",
    maxInputChars: 15_000,
    voiceCapabilities: ["catalog", "remote-clone"],
  },
} as const;

export type SpeechSdkVendor = keyof typeof SPEECH_SDK_VENDOR_DEFINITIONS;
export type SpeechSdkVoiceSource =
  (typeof SPEECH_SDK_VENDOR_DEFINITIONS)[SpeechSdkVendor]["voiceCapabilities"][number];

export const SPEECH_SDK_VENDORS = Object.keys(
  SPEECH_SDK_VENDOR_DEFINITIONS,
) as SpeechSdkVendor[];

export const SPEECH_SDK_VOICE_SOURCES = [
  "catalog",
  "remote-clone",
  "remote-designed",
] as const;

export const UNSUPPORTED_SPEECH_SDK_DIRECT_VENDORS = {
  fal: "generation performs a second network request to download the audio asset",
  google:
    "generation may rewrite terse input and issue a second synthesis request when audio is missing",
  gateway: "hosted routing and cross-provider behavior are outside BYOK direct mode",
} as const;

// Keep this deliberately narrower than the Azure Speech catalog. This is the
// Chinese subset returned by Edge Read Aloud voice metadata for the protocol
// version used by node-edge-tts@1.2.10; catalog entries that are not returned
// by Edge are not accepted as interchangeable IDs.
export const EDGE_TTS_VOICE_DEFINITIONS = [
  { id: "zh-CN-XiaoxiaoNeural", locale: "zh-CN", label: "晓晓（女）" },
  { id: "zh-CN-XiaoyiNeural", locale: "zh-CN", label: "晓伊（女）" },
  { id: "zh-CN-YunxiNeural", locale: "zh-CN", label: "云希（男）" },
  { id: "zh-CN-YunjianNeural", locale: "zh-CN", label: "云健（男）" },
  { id: "zh-CN-YunyangNeural", locale: "zh-CN", label: "云扬（男）" },
  { id: "zh-CN-YunxiaNeural", locale: "zh-CN", label: "云夏（男）" },
  {
    id: "zh-CN-liaoning-XiaobeiNeural",
    locale: "zh-CN-liaoning",
    label: "晓北（女，东北口音）",
  },
  {
    id: "zh-CN-shaanxi-XiaoniNeural",
    locale: "zh-CN-shaanxi",
    label: "晓妮（女，陕西口音）",
  },
  { id: "zh-HK-HiuMaanNeural", locale: "zh-HK", label: "曉曼（女，粤语）" },
  { id: "zh-HK-HiuGaaiNeural", locale: "zh-HK", label: "曉佳（女，粤语）" },
  { id: "zh-HK-WanLungNeural", locale: "zh-HK", label: "雲龍（男，粤语）" },
  { id: "zh-TW-HsiaoChenNeural", locale: "zh-TW", label: "曉臻（女，台湾）" },
  { id: "zh-TW-HsiaoYuNeural", locale: "zh-TW", label: "曉雨（女，台湾）" },
  { id: "zh-TW-YunJheNeural", locale: "zh-TW", label: "雲哲（男，台湾）" },
] as const;

export type EdgeTtsVoiceId = (typeof EDGE_TTS_VOICE_DEFINITIONS)[number]["id"];

export const getEdgeTtsVoiceDefinition = (voiceId: string) =>
  EDGE_TTS_VOICE_DEFINITIONS.find(({ id }) => id === voiceId);

export const getSpeechSdkVendorDefinition = (vendor: SpeechSdkVendor) =>
  SPEECH_SDK_VENDOR_DEFINITIONS[vendor];

const MODEL_INPUT_LIMIT_OVERRIDES: Readonly<
  Partial<Record<SpeechSdkVendor, Readonly<Record<string, number>>>>
> = {
  elevenlabs: {
    eleven_v3: 5_000,
    eleven_multilingual_v2: 10_000,
    eleven_flash_v2_5: 40_000,
    eleven_flash_v2: 30_000,
  },
};

export const getSpeechSdkModelMaxInputChars = (
  vendor: SpeechSdkVendor,
  modelId: string,
) =>
  MODEL_INPUT_LIMIT_OVERRIDES[vendor]?.[modelId] ??
  getSpeechSdkVendorDefinition(vendor).maxInputChars;

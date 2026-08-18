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

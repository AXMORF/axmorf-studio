export const validVideoBrief = {
  schemaVersion: 1,
  storyId: "story-example",
  title: "A deterministic narration example",
  sourceMaterial: "Explain why cumulative PCM boundaries prevent frame drift.",
  audience: "Developers building narrated video systems",
  targetDurationSeconds: 10,
  deliveryConstraints: [
    "Narration and captions must remain understandable without Scene visuals.",
  ],
} as const;

export const validStorySpec = {
  schemaVersion: 1,
  storyId: "story-example",
  title: "A deterministic narration example",
  beats: [
    {
      meaningId: "opening",
      narrativePurpose: "State the timing problem.",
      ttsChunks: [{ chunkId: "opening-01", ttsText: "A" }],
      explicitPauses: [{ afterChunkId: "opening-01", pauseMs: 250 }],
    },
    {
      meaningId: "conclusion",
      narrativePurpose: "State the deterministic result.",
      ttsChunks: [{ chunkId: "conclusion-01", ttsText: "B" }],
      explicitPauses: [],
    },
  ],
} as const;

export const validNarrationSpec = {
  schemaVersion: 1,
  voiceProfileId: "primary-voice",
  mode: "voice-clone",
  seed: 42,
} as const;

export const validRenderSpec = {
  schemaVersion: 1,
  compositionId: "StoryExample",
  fps: 30,
  width: 1920,
  height: 1080,
  locale: "zh-CN",
  leadInFrames: 15,
  tailFrames: 12,
  captionSafeAreaPx: { top: 72, right: 96, bottom: 72, left: 96 },
  output: {
    container: "mp4",
    videoCodec: "h264",
    audioCodec: "aac",
    audioChannels: 2,
  },
} as const;

export const validProjectSource = {
  brief: validVideoBrief,
  story: validStorySpec,
  narration: validNarrationSpec,
  render: validRenderSpec,
} as const;

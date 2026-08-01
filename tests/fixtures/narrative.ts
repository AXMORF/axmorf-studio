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

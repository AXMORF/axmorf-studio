import { computeGenerationInputFingerprint } from "@axmorf/studio/contracts";
import { NarrationSpecSchema } from "@axmorf/studio/contracts";
import {
  computeSealedNarrationFingerprint,
  SealedNarrationManifestSchema,
} from "@axmorf/studio/contracts";
import { StorySpecSchema } from "@axmorf/studio/contracts";

export const validVideoBrief = {
  schemaVersion: 1,
  storyId: "story-example",
  title: "A deterministic narration example",
  sourceMaterial: "Explain why cumulative PCM boundaries prevent frame drift.",
  sourceReferences: [
    {
      title: "Remotion documentation",
      url: "https://www.remotion.dev/docs/",
    },
  ],
  audience: "Developers building narrated video systems",
  targetDurationSeconds: 10,
  deliveryConstraints: [
    "Narration and captions must remain understandable without Scene visuals.",
  ],
} as const;

export const validStorySpec = {
  schemaVersion: 3,
  storyId: "story-example",
  title: "A deterministic narration example",
  beats: [
    {
      kind: "narrated-scene",
      meaningId: "opening",
      narrativePurpose: "State the timing problem.",
      ttsChunks: [{ chunkId: "opening-01", ttsText: "A" }],
      explicitPauses: [{ afterChunkId: "opening-01", pauseMs: 250 }],
    },
    {
      kind: "narrated-scene",
      meaningId: "conclusion",
      narrativePurpose: "State the deterministic result.",
      ttsChunks: [{ chunkId: "conclusion-01", ttsText: "B" }],
      explicitPauses: [],
    },
  ],
} as const;

export const validNarrationSpec = {
  schemaVersion: 2,
  voiceProfileId: "primary-voice",
  mode: "voice-clone",
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

export const buildValidSealedNarrationManifest = () => {
  const story = StorySpecSchema.parse(validStorySpec);
  const narration = NarrationSpecSchema.parse(validNarrationSpec);
  const pcm = {
    sampleRate: 48000,
    channelLayout: "mono",
    sampleFormat: "s16le",
  } as const;
  const input = {
    schemaVersion: 1,
    storyId: "story-example",
    narrationSpec: validNarrationSpec,
    generationInputFingerprint: computeGenerationInputFingerprint(
      story,
      narration,
    ),
    normalizationAlgorithmId: "pcm-s16le-normalize-v1",
    assemblyAlgorithmId: "ordered-pcm-concat-v1",
    canonicalPcm: pcm,
    segments: [
      {
        kind: "chunk",
        chunkId: "opening-01",
        meaningId: "opening",
        ttsText: "A",
        localPath:
          "public/projects/story-example/narration/chunks/opening-01.wav",
        checksum: `sha256:${"a".repeat(64)}`,
        pcm,
        sampleFrameCount: 52800,
      },
      {
        kind: "pause",
        afterChunkId: "opening-01",
        meaningId: "opening",
        pauseMs: 250,
        sampleFrameCount: 12000,
      },
      {
        kind: "chunk",
        chunkId: "conclusion-01",
        meaningId: "conclusion",
        ttsText: "B",
        localPath:
          "public/projects/story-example/narration/chunks/conclusion-01.wav",
        checksum: `sha256:${"b".repeat(64)}`,
        pcm,
        sampleFrameCount: 45600,
      },
    ],
    completeAudio: {
      localPath: "public/projects/story-example/narration/complete.wav",
      checksum: `sha256:${"c".repeat(64)}`,
      pcm,
      sampleFrameCount: 110400,
    },
  } as const;

  return SealedNarrationManifestSchema.parse({
    ...input,
    sealedNarrationFingerprint: computeSealedNarrationFingerprint(input),
  });
};

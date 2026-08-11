import assert from "node:assert/strict";
import test from "node:test";

import { NarrationSpecSchema } from "../../src/contracts/narration";
import { RenderSpecSchema } from "../../src/contracts/render";
import {
  computeSealedNarrationFingerprint,
  SealedNarrationManifestSchema,
} from "../../src/contracts/sealed-narration";
import {
  generateSemanticTiming,
  pauseMsToSampleFrames,
  sampleFrameToFrame,
  SemanticTimingSchema,
} from "../../src/contracts/semantic-timing";
import { StorySpecSchema } from "../../src/contracts/story";
import {
  buildValidSealedNarrationManifest,
  validNarrationSpec,
  validRenderSpec,
  validStorySpec,
} from "../fixtures/narrative";

test("pcm-cumulative-ceil-v1 reproduces the authority example", () => {
  const timing = generateSemanticTiming({
    story: StorySpecSchema.parse(validStorySpec),
    narration: NarrationSpecSchema.parse(validNarrationSpec),
    render: RenderSpecSchema.parse(validRenderSpec),
    sealedNarration: buildValidSealedNarrationManifest(),
  });

  assert.deepEqual(
    timing.segments.map((segment) => segment.frameRange),
    [
      { startFrame: 15, endFrame: 48 },
      { startFrame: 48, endFrame: 56 },
      { startFrame: 56, endFrame: 84 },
    ],
  );
  assert.deepEqual(timing.captionCues, [
    {
      chunkId: "opening-01",
      meaningId: "opening",
      text: "A",
      startFrame: 15,
      endFrame: 48,
    },
    {
      chunkId: "conclusion-01",
      meaningId: "conclusion",
      text: "B",
      startFrame: 56,
      endFrame: 84,
    },
  ]);
  assert.deepEqual(timing.storyBeats, [
    { meaningId: "opening", startFrame: 15, endFrame: 56 },
    { meaningId: "conclusion", startFrame: 56, endFrame: 84 },
  ]);
  assert.equal(timing.durationInFrames, 96);
});

test("pause milliseconds use integer round-half-up sample conversion", () => {
  assert.equal(pauseMsToSampleFrames(0, 48000), 0);
  assert.equal(pauseMsToSampleFrames(250, 48000), 12000);
  assert.equal(pauseMsToSampleFrames(1, 44100), 44);
  assert.throws(() => pauseMsToSampleFrames(1, 1));
});

test("sample boundaries ceil once and reject unsafe output", () => {
  assert.equal(
    sampleFrameToFrame({ sampleFrame: 64800, fps: 30, sampleRate: 48000 }),
    41,
  );
  assert.throws(() =>
    sampleFrameToFrame({
      sampleFrame: Number.MAX_SAFE_INTEGER,
      fps: Number.MAX_SAFE_INTEGER,
      sampleRate: 1,
    }),
  );
});

test("a TTSChunk that quantizes to zero frames fails closed", () => {
  const original = buildValidSealedNarrationManifest();
  const resizedInput = {
    schemaVersion: original.schemaVersion,
    storyId: original.storyId,
    narrationSpec: original.narrationSpec,
    generationInputFingerprint: original.generationInputFingerprint,
    normalizationAlgorithmId: original.normalizationAlgorithmId,
    assemblyAlgorithmId: original.assemblyAlgorithmId,
    canonicalPcm: original.canonicalPcm,
    segments: original.segments.map((segment, index) =>
      index === 2 && segment.kind === "chunk"
        ? { ...segment, sampleFrameCount: 1 }
        : segment,
    ),
    completeAudio: {
      ...original.completeAudio,
      checksum: `sha256:${"d".repeat(64)}`,
      sampleFrameCount: 64801,
    },
  };
  const resized = SealedNarrationManifestSchema.parse({
    ...resizedInput,
    sealedNarrationFingerprint: computeSealedNarrationFingerprint(resizedInput),
  });

  assert.throws(() =>
    generateSemanticTiming({
      story: StorySpecSchema.parse(validStorySpec),
      narration: NarrationSpecSchema.parse(validNarrationSpec),
      render: RenderSpecSchema.parse(validRenderSpec),
      sealedNarration: resized,
    }),
  );
});

test("a positive pause keeps PCM samples even when its frame range is zero", () => {
  const original = buildValidSealedNarrationManifest();
  const oneMillisecondPauseStory = StorySpecSchema.parse({
    ...validStorySpec,
    beats: [
      {
        ...validStorySpec.beats[0],
        explicitPauses: [{ afterChunkId: "opening-01", pauseMs: 1 }],
      },
      validStorySpec.beats[1],
    ],
  });
  const resizedInput = {
    schemaVersion: original.schemaVersion,
    storyId: original.storyId,
    narrationSpec: original.narrationSpec,
    generationInputFingerprint: original.generationInputFingerprint,
    normalizationAlgorithmId: original.normalizationAlgorithmId,
    assemblyAlgorithmId: original.assemblyAlgorithmId,
    canonicalPcm: original.canonicalPcm,
    segments: original.segments.map((segment, index) => {
      if (index === 0 && segment.kind === "chunk") {
        return { ...segment, sampleFrameCount: 52000 };
      }
      if (segment.kind === "pause") {
        return { ...segment, pauseMs: 1, sampleFrameCount: 48 };
      }
      return segment;
    }),
    completeAudio: {
      ...original.completeAudio,
      checksum: `sha256:${"e".repeat(64)}`,
      sampleFrameCount: 97648,
    },
  };
  const resized = SealedNarrationManifestSchema.parse({
    ...resizedInput,
    sealedNarrationFingerprint: computeSealedNarrationFingerprint(resizedInput),
  });
  const timing = generateSemanticTiming({
    story: oneMillisecondPauseStory,
    narration: NarrationSpecSchema.parse(validNarrationSpec),
    render: RenderSpecSchema.parse(validRenderSpec),
    sealedNarration: resized,
  });

  assert.deepEqual(timing.segments[1].frameRange, {
    startFrame: 48,
    endFrame: 48,
  });
  assert.deepEqual(timing.segments[1].sampleRange, {
    startSampleFrame: 52000,
    endSampleFrame: 52048,
  });
});

test("a zero pause keeps an explicit zero-length owned segment", () => {
  const original = buildValidSealedNarrationManifest();
  const zeroPauseStory = StorySpecSchema.parse({
    ...validStorySpec,
    beats: [
      {
        ...validStorySpec.beats[0],
        explicitPauses: [{ afterChunkId: "opening-01", pauseMs: 0 }],
      },
      validStorySpec.beats[1],
    ],
  });
  const zeroPauseInput = {
    schemaVersion: original.schemaVersion,
    storyId: original.storyId,
    narrationSpec: original.narrationSpec,
    generationInputFingerprint: original.generationInputFingerprint,
    normalizationAlgorithmId: original.normalizationAlgorithmId,
    assemblyAlgorithmId: original.assemblyAlgorithmId,
    canonicalPcm: original.canonicalPcm,
    segments: original.segments.map((segment) =>
      segment.kind === "pause"
        ? { ...segment, pauseMs: 0, sampleFrameCount: 0 }
        : segment,
    ),
    completeAudio: {
      ...original.completeAudio,
      checksum: `sha256:${"f".repeat(64)}`,
      sampleFrameCount: 98400,
    },
  };
  const sealedNarration = SealedNarrationManifestSchema.parse({
    ...zeroPauseInput,
    sealedNarrationFingerprint:
      computeSealedNarrationFingerprint(zeroPauseInput),
  });
  const timing = generateSemanticTiming({
    story: zeroPauseStory,
    narration: NarrationSpecSchema.parse(validNarrationSpec),
    render: RenderSpecSchema.parse(validRenderSpec),
    sealedNarration,
  });

  assert.deepEqual(timing.segments[1].frameRange, {
    startFrame: 48,
    endFrame: 48,
  });
  assert.deepEqual(timing.segments[1].sampleRange, {
    startSampleFrame: 52800,
    endSampleFrame: 52800,
  });
});

test("timing fingerprint ignores RenderSpec non-timing fields", () => {
  const input = {
    story: StorySpecSchema.parse(validStorySpec),
    narration: NarrationSpecSchema.parse(validNarrationSpec),
    sealedNarration: buildValidSealedNarrationManifest(),
  };
  const original = generateSemanticTiming({
    ...input,
    render: RenderSpecSchema.parse(validRenderSpec),
  });
  const localeOnly = generateSemanticTiming({
    ...input,
    render: RenderSpecSchema.parse({
      ...validRenderSpec,
      locale: "en-US",
    }),
  });
  const changedFps = generateSemanticTiming({
    ...input,
    render: RenderSpecSchema.parse({ ...validRenderSpec, fps: 24 }),
  });

  assert.equal(original.fingerprint, localeOnly.fingerprint);
  assert.notEqual(original.fingerprint, changedFps.fingerprint);
});

test("persisted SemanticTiming rejects inconsistent derived relationships", () => {
  const timing = generateSemanticTiming({
    story: StorySpecSchema.parse(validStorySpec),
    narration: NarrationSpecSchema.parse(validNarrationSpec),
    render: RenderSpecSchema.parse(validRenderSpec),
    sealedNarration: buildValidSealedNarrationManifest(),
  });

  assert.throws(() =>
    SemanticTimingSchema.parse({
      ...timing,
      captionCues: timing.captionCues.slice(1),
    }),
  );
  assert.throws(() =>
    SemanticTimingSchema.parse({
      ...timing,
      durationInFrames: timing.durationInFrames + 1,
    }),
  );
  assert.throws(() =>
    SemanticTimingSchema.parse({
      ...timing,
      storyBeats: timing.storyBeats.map((beat, index) =>
        index === 0 ? { ...beat, endFrame: beat.endFrame - 1 } : beat,
      ),
    }),
  );
  assert.throws(() =>
    SemanticTimingSchema.parse({
      ...timing,
      segments: timing.segments.map((segment, index) =>
        index === 1
          ? {
              ...segment,
              sampleRange: {
                ...segment.sampleRange,
                startSampleFrame: segment.sampleRange.startSampleFrame + 1,
              },
            }
          : segment,
      ),
    }),
  );
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  CanonicalMeasuredChunkSchema,
  NarrationGenerationProgressSchema,
} from "../../../../scripts/narration/domain/candidate-progress";
import {
  encodeCanonicalPcmWav,
  measureCanonicalPcmWav,
  sha256Bytes,
} from "../../../../scripts/narration/domain/pcm-wav";
import { buildNarrationSeal } from "../../../../scripts/narration/domain/seal";
import { computeChunkRequestFingerprint } from "../../../../scripts/narration/domain/provider-input";
import {
  computeGenerationInputFingerprint,
  flattenTtsChunks,
  NarrationSpecSchema,
  StorySpecSchema,
} from "../../../contracts";
import gpsNarrationJson from "../narration.json";
import gpsStoryJson from "../story.json";
import { createWavFixture } from "../../../../tests/fixtures/wav";

const providerAttemptFingerprint = `sha256:${"7".repeat(64)}`;
const story = StorySpecSchema.parse(gpsStoryJson);
const narration = NarrationSpecSchema.parse(gpsNarrationJson);

const createFixture = (currentStory = story) => {
  const generationInputFingerprint = computeGenerationInputFingerprint(
    currentStory,
    narration,
  );
  const normalizedChunks = new Map<string, Buffer>();
  const progressChunks = flattenTtsChunks(currentStory).map((chunk, index) => {
    const rawChecksum = sha256Bytes(Buffer.from(`raw-${chunk.chunkId}`));
    const digest = rawChecksum.slice("sha256:".length);
    const normalized = encodeCanonicalPcmWav(
      Buffer.alloc((100 + index) * 2, index + 1),
    );
    normalizedChunks.set(chunk.chunkId, normalized);
    const requestEnvelope = {
      generationInputFingerprint,
      providerAttemptFingerprint,
      chunkId: chunk.chunkId,
      meaningId: chunk.meaningId,
      ttsText: chunk.ttsText,
    };
    return CanonicalMeasuredChunkSchema.parse({
      stage: "measured",
      chunkId: chunk.chunkId,
      meaningId: chunk.meaningId,
      ttsText: chunk.ttsText,
      requestFingerprint: computeChunkRequestFingerprint(requestEnvelope),
      candidateId: rawChecksum,
      rawChecksum,
      normalizedChecksum: sha256Bytes(normalized),
      pcm: {
        sampleRate: 48_000,
        channelLayout: "mono",
        sampleFormat: "s16le",
      },
      sampleFrameCount: 100 + index,
      rawRelativePath: `candidates/${chunk.chunkId}/${digest}/raw.wav`,
      normalizedRelativePath: `candidates/${chunk.chunkId}/${digest}/normalized.wav`,
    });
  });
  return {
    story: currentStory,
    narration,
    progress: NarrationGenerationProgressSchema.parse({
      schemaVersion: 1,
      storyId: currentStory.storyId,
      generationInputFingerprint,
      providerAttemptFingerprint,
      chunks: progressChunks,
    }),
    normalizedChunks,
  };
};

test("assembly interleaves authored chunks and explicit pauses exactly", () => {
  const seal = buildNarrationSeal(createFixture());
  assert.deepEqual(
    seal.manifest.segments.map((segment) => segment.kind),
    [
      "chunk",
      "chunk",
      "chunk",
      "chunk",
      "pause",
      "chunk",
      "chunk",
      "chunk",
      "chunk",
      "pause",
      "chunk",
      "chunk",
    ],
  );
  assert.equal(seal.chunkWavs.size, 10);
});

test("complete WAV sample frames equal all segment sample frames", () => {
  const seal = buildNarrationSeal(createFixture());
  const segmentTotal = seal.manifest.segments.reduce(
    (sum, segment) => sum + BigInt(segment.sampleFrameCount),
    0n,
  );
  assert.equal(
    segmentTotal,
    BigInt(seal.manifest.completeAudio.sampleFrameCount),
  );
  assert.equal(
    measureCanonicalPcmWav(seal.completeWav).sampleFrameCount,
    seal.manifest.completeAudio.sampleFrameCount,
  );
  assert.equal(seal.manifest.segments[4]?.sampleFrameCount, 14_400);
  assert.equal(seal.manifest.segments[9]?.sampleFrameCount, 19_200);
});

test("pause changes reuse candidates but invalidate seal bytes and fingerprint", () => {
  const originalFixture = createFixture();
  const changedStory = StorySpecSchema.parse({
    ...story,
    beats: story.beats.map((beat) =>
      beat.meaningId === "two-relativistic-effects"
        ? {
            ...beat,
            explicitPauses: [
              {
                afterChunkId: "two-relativistic-effects-02",
                pauseMs: 350,
              },
            ],
          }
        : beat,
    ),
  });
  const changedFixture = createFixture(changedStory);
  const originalSeal = buildNarrationSeal(originalFixture);
  const changedPauseSeal = buildNarrationSeal(changedFixture);

  assert.deepEqual(
    originalFixture.progress.chunks,
    changedFixture.progress.chunks,
  );
  assert.notEqual(
    sha256Bytes(originalSeal.completeWav),
    sha256Bytes(changedPauseSeal.completeWav),
  );
  assert.notEqual(
    originalSeal.manifest.sealedNarrationFingerprint,
    changedPauseSeal.manifest.sealedNarrationFingerprint,
  );
});

test("incomplete extra out-of-order and stale progress fail closed", () => {
  const fixture = createFixture();
  const invalidProgresses = [
    { ...fixture.progress, chunks: fixture.progress.chunks.slice(0, -1) },
    {
      ...fixture.progress,
      chunks: [
        ...fixture.progress.chunks,
        {
          ...fixture.progress.chunks[0],
          chunkId: "unexpected-01",
        },
      ],
    },
    {
      ...fixture.progress,
      chunks: [
        fixture.progress.chunks[1],
        fixture.progress.chunks[0],
        ...fixture.progress.chunks.slice(2),
      ],
    },
    {
      ...fixture.progress,
      generationInputFingerprint: `sha256:${"0".repeat(64)}`,
    },
  ];
  for (const progress of invalidProgresses) {
    assert.throws(() =>
      buildNarrationSeal({ ...fixture, progress: progress as never }),
    );
  }
});

test("stale identity checksum measurement and noncanonical WAV fail closed", () => {
  const mutations: ((fixture: ReturnType<typeof createFixture>) => void)[] = [
    (fixture) => {
      fixture.progress = NarrationGenerationProgressSchema.parse({
        ...fixture.progress,
        chunks: fixture.progress.chunks.map((chunk, index) =>
          index === 0 ? { ...chunk, ttsText: "stale text" } : chunk,
        ),
      });
    },
    (fixture) => {
      fixture.progress = NarrationGenerationProgressSchema.parse({
        ...fixture.progress,
        chunks: fixture.progress.chunks.map((chunk, index) =>
          index === 0 ? { ...chunk, meaningId: "net-drift" } : chunk,
        ),
      });
    },
    (fixture) => {
      fixture.normalizedChunks.set(
        fixture.progress.chunks[0]?.chunkId ?? "",
        encodeCanonicalPcmWav(Buffer.alloc(202, 3)),
      );
    },
    (fixture) => {
      fixture.normalizedChunks.set(
        fixture.progress.chunks[0]?.chunkId ?? "",
        createWavFixture({
          rawPcm: Buffer.alloc(200),
          sampleRate: 44_100,
        }),
      );
    },
    (fixture) => {
      fixture.normalizedChunks.set(
        fixture.progress.chunks[0]?.chunkId ?? "",
        encodeCanonicalPcmWav(Buffer.alloc(0)),
      );
    },
  ];

  for (const mutate of mutations) {
    const fixture = createFixture();
    mutate(fixture);
    assert.throws(() => buildNarrationSeal(fixture));
  }
});

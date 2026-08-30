import assert from "node:assert/strict";
import test from "node:test";

import {
  NarrationSpecSchema,
  StorySpecSchema,
  buildSilentScenePreset,
  computeGenerationInputFingerprint,
} from "@axmorf/studio/contracts";
import { NarrationGenerationProgressSchema } from "../../scripts/narration/domain/candidate-progress";
import { computeChunkRequestFingerprint } from "../../scripts/narration/domain/provider-input";
import {
  CANONICAL_NARRATION_PCM,
  measureCanonicalPcmWav,
  sha256Bytes,
} from "../../scripts/narration/domain/pcm-wav";
import { buildNarrationSeal } from "../../scripts/narration/domain/seal";
import { validNarrationSpec, validStorySpec } from "../fixtures/narrative";
import { createRawPcmFixture, createWavFixture } from "../fixtures/wav";

test("narration sealing consumes only narrated chunks when silent Scenes exist", () => {
  const silentPreset = buildSilentScenePreset({
    presetId: "generic-boundary-v1",
    durationInFrames: 30,
    visualIntent: "Render a generic silent Scene.",
    soundIntent: "No sound.",
    resourceIds: [],
    implementation: { kind: "scene-owner" },
  });
  const story = StorySpecSchema.parse({
    ...validStorySpec,
    beats: [
      {
        kind: "silent-scene",
        meaningId: "intro",
        narrativePurpose: "Open the Story.",
        preset: silentPreset,
      },
      ...validStorySpec.beats,
      {
        kind: "silent-scene",
        meaningId: "outro",
        narrativePurpose: "Close the Story.",
        preset: silentPreset,
      },
    ],
  });
  const narration = NarrationSpecSchema.parse(validNarrationSpec);
  const generationInputFingerprint = computeGenerationInputFingerprint(
    story,
    narration,
  );
  const providerAttemptFingerprint = `sha256:${"a".repeat(64)}` as const;
  const chunks = story.beats.flatMap((beat) =>
    beat.kind === "narrated-scene"
      ? beat.ttsChunks.map((chunk) => ({ ...chunk, meaningId: beat.meaningId }))
      : [],
  );
  const normalizedChunks = new Map(
    chunks.map((chunk, index) => [
      chunk.chunkId,
      createWavFixture({
        rawPcm: createRawPcmFixture([100 + index, -(100 + index)]),
      }),
    ]),
  );
  const progress = NarrationGenerationProgressSchema.parse({
    schemaVersion: 1,
    storyId: story.storyId,
    generationInputFingerprint,
    providerAttemptFingerprint,
    chunks: chunks.map((chunk) => {
      const wav = normalizedChunks.get(chunk.chunkId)!;
      const checksum = sha256Bytes(wav);
      return {
        stage: "measured",
        ...chunk,
        requestFingerprint: computeChunkRequestFingerprint({
          generationInputFingerprint,
          providerAttemptFingerprint,
          ...chunk,
        }),
        candidateId: checksum,
        rawChecksum: checksum,
        normalizedChecksum: checksum,
        pcm: CANONICAL_NARRATION_PCM,
        sampleFrameCount: measureCanonicalPcmWav(wav).sampleFrameCount,
        rawRelativePath: `candidates/${chunk.chunkId}/${checksum.slice("sha256:".length)}/raw.wav`,
        normalizedRelativePath: `candidates/${chunk.chunkId}/${checksum.slice("sha256:".length)}/normalized.wav`,
      };
    }),
  });

  const seal = buildNarrationSeal({
    story,
    narration,
    progress,
    normalizedChunks,
  });
  assert.deepEqual(
    seal.manifest.segments.map((segment) => segment.meaningId),
    ["opening", "opening", "conclusion"],
  );
  assert.deepEqual([...seal.chunkWavs.keys()], ["opening-01", "conclusion-01"]);
  assert.equal(
    seal.manifest.segments.some(
      ({ meaningId }) => meaningId === "intro" || meaningId === "outro",
    ),
    false,
  );
});

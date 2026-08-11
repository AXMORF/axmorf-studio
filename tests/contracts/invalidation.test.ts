import assert from "node:assert/strict";
import test from "node:test";

import {
  computeGenerationInputFingerprint,
  computeSealedNarrationFingerprint,
  generateSemanticTiming,
  NarrationSpecSchema,
  RenderSpecSchema,
  StorySpecSchema,
  validateM1ArtifactBundle,
} from "../../src/contracts";
import {
  buildValidSealedNarrationManifest,
  validNarrationSpec,
  validProjectSource,
  validRenderSpec,
  validStorySpec,
} from "../fixtures/narrative";

const buildBundle = () => {
  const story = StorySpecSchema.parse(validStorySpec);
  const narration = NarrationSpecSchema.parse(validNarrationSpec);
  const render = RenderSpecSchema.parse(validRenderSpec);
  const sealedNarration = buildValidSealedNarrationManifest();
  const semanticTiming = generateSemanticTiming({
    story,
    narration,
    render,
    sealedNarration,
  });
  return { projectSource: validProjectSource, sealedNarration, semanticTiming };
};

test("M1 aggregate accepts a mutually matching source, seal, and timing set", () => {
  assert.equal(
    validateM1ArtifactBundle(buildBundle()).semanticTiming.durationInFrames,
    96,
  );
});

test("ttsText and voice-profile changes invalidate generation and all sealed downstream", () => {
  const bundle = buildBundle();
  const changedStory = StorySpecSchema.parse({
    ...validStorySpec,
    beats: [
      {
        ...validStorySpec.beats[0],
        ttsChunks: [{ chunkId: "opening-01", ttsText: "Changed" }],
      },
      validStorySpec.beats[1],
    ],
  });
  assert.notEqual(
    computeGenerationInputFingerprint(
      changedStory,
      NarrationSpecSchema.parse(validNarrationSpec),
    ),
    bundle.sealedNarration.generationInputFingerprint,
  );
  assert.throws(() =>
    validateM1ArtifactBundle({
      ...bundle,
      projectSource: { ...validProjectSource, story: changedStory },
    }),
  );
  assert.throws(() =>
    validateM1ArtifactBundle({
      ...bundle,
      projectSource: {
        ...validProjectSource,
        narration: {
          ...validNarrationSpec,
          voiceProfileId: "replacement-voice",
        },
      },
    }),
  );
});

test("pause changes retain generation input but invalidate sealed narration and timing", () => {
  const bundle = buildBundle();
  const changedPauseStory = StorySpecSchema.parse({
    ...validStorySpec,
    beats: [
      {
        ...validStorySpec.beats[0],
        explicitPauses: [{ afterChunkId: "opening-01", pauseMs: 500 }],
      },
      validStorySpec.beats[1],
    ],
  });
  assert.equal(
    computeGenerationInputFingerprint(
      changedPauseStory,
      NarrationSpecSchema.parse(validNarrationSpec),
    ),
    bundle.sealedNarration.generationInputFingerprint,
  );
  const { sealedNarrationFingerprint: currentFingerprint, ...sealedInput } =
    bundle.sealedNarration;
  assert.notEqual(
    computeSealedNarrationFingerprint({
      ...sealedInput,
      segments: bundle.sealedNarration.segments.map((segment) =>
        segment.kind === "pause"
          ? { ...segment, pauseMs: 500, sampleFrameCount: 24000 }
          : segment,
      ),
      completeAudio: {
        ...bundle.sealedNarration.completeAudio,
        sampleFrameCount: 122400,
      },
    }),
    currentFingerprint,
  );
  assert.throws(() =>
    validateM1ArtifactBundle({
      ...bundle,
      projectSource: { ...validProjectSource, story: changedPauseStory },
    }),
  );
});

test("RenderSpec timing changes invalidate timing while non-timing fields do not", () => {
  const bundle = buildBundle();
  const source = {
    story: StorySpecSchema.parse(validStorySpec),
    narration: NarrationSpecSchema.parse(validNarrationSpec),
    sealedNarration: bundle.sealedNarration,
  };
  const changedLocale = generateSemanticTiming({
    ...source,
    render: RenderSpecSchema.parse({
      ...validRenderSpec,
      locale: "en-US",
    }),
  });
  const changedLeadIn = generateSemanticTiming({
    ...source,
    render: RenderSpecSchema.parse({ ...validRenderSpec, leadInFrames: 30 }),
  });

  assert.equal(changedLocale.fingerprint, bundle.semanticTiming.fingerprint);
  assert.notEqual(changedLeadIn.fingerprint, bundle.semanticTiming.fingerprint);
  assert.doesNotThrow(() =>
    validateM1ArtifactBundle({
      ...bundle,
      projectSource: {
        ...validProjectSource,
        render: { ...validRenderSpec, locale: "en-US" },
      },
    }),
  );
  assert.throws(() =>
    validateM1ArtifactBundle({
      ...bundle,
      projectSource: {
        ...validProjectSource,
        render: { ...validRenderSpec, leadInFrames: 30 },
      },
    }),
  );
});

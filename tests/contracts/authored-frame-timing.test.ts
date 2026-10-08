import assert from "node:assert/strict";
import test from "node:test";

import { ProjectCreateStorySchema } from "../../packages/studio/src/contracts/project-create";
import { validateNarrativeArtifactBundle } from "../../packages/studio/src/contracts/narrative-artifact-bundle";
import {
  AuthoredFrameTimingSchema,
  generateAuthoredFrameTiming,
  generateSemanticTiming,
  resolveSemanticContentFrameRange,
} from "../../packages/studio/src/contracts/semantic-timing";
import {
  StorySpecSchema,
  buildSilentScenePreset,
} from "../../packages/studio/src/contracts/story";
import { NarrationSpecSchema } from "../../packages/studio/src/contracts/narration";
import { VideoBriefSchema } from "../../packages/studio/src/contracts/brief";
import { deriveGlobalVisualLayerPolicy } from "../../packages/studio/src/contracts/global-visual";
import { buildProjectDurationBudget } from "../../packages/studio/src/contracts/duration-budget";
import { RenderSpecSchema } from "../../packages/studio/src/contracts/render";
import {
  validVideoBrief,
  validNarrationSpec,
  validRenderSpec,
  validStorySpec,
  buildValidSealedNarrationManifest,
} from "../fixtures/narrative";

const visualBeat = (meaningId: string, durationInFrames: number) => ({
  kind: "silent-scene" as const,
  meaningId,
  narrativePurpose: `Express ${meaningId} through continuous motion.`,
  preset: buildSilentScenePreset({
    presetId: meaningId,
    durationInFrames,
    visualIntent: "Express the concept through a moving subject.",
    soundIntent: "Use only authored non-narration sounds.",
    resourceIds: [],
    implementation: { kind: "scene-owner" },
  }),
});

const boundaryBeat = (meaningId: string, durationInFrames: number) => ({
  ...visualBeat(meaningId, durationInFrames),
  preset: buildSilentScenePreset({
    presetId: meaningId,
    durationInFrames,
    visualIntent: "A fixed boundary.",
    soundIntent: "No sound.",
    resourceIds: [],
    implementation: {
      kind: "template-copy",
      templateId: "boundary",
      templateFingerprint: `sha256:${"a".repeat(64)}`,
      instanceFingerprint: `sha256:${"b".repeat(64)}`,
      rendererSourceFingerprint: `sha256:${"c".repeat(64)}`,
      soundCues: [],
    },
  }),
});

const story = StorySpecSchema.parse({
  schemaVersion: 3,
  storyId: validStorySpec.storyId,
  title: "A purely visual film",
  timingSource: "authored-frames",
  beats: [
    boundaryBeat("intro", 11),
    visualBeat("gather", 28),
    visualBeat("resolve", 43),
    boundaryBeat("outro", 9),
  ],
});
const render = RenderSpecSchema.parse(validRenderSpec);

test("authored-frame timing uses declared durations without PCM, captions or narrated segments", () => {
  const timing = generateAuthoredFrameTiming({ story, render });
  assert.equal(timing.algorithmId, "authored-cumulative-frames-v1");
  assert.equal(timing.sampleRate, null);
  assert.equal(timing.narrationStartFrame, null);
  assert.deepEqual(timing.captionCues, []);
  assert.deepEqual(timing.segments, []);
  assert.deepEqual(
    timing.storyBeats.map(({ startFrame, endFrame }) => ({
      startFrame,
      endFrame,
    })),
    [
      { startFrame: 15, endFrame: 26 },
      { startFrame: 26, endFrame: 54 },
      { startFrame: 54, endFrame: 97 },
      { startFrame: 97, endFrame: 106 },
    ],
  );
  assert.equal(timing.durationInFrames, 118);
  assert.deepEqual(resolveSemanticContentFrameRange(timing), {
    startFrame: 26,
    endFrame: 97,
  });
  const source = {
    brief: VideoBriefSchema.parse(validVideoBrief),
    story,
    narration: NarrationSpecSchema.parse(validNarrationSpec),
    render,
  };
  assert.deepEqual(
    validateNarrativeArtifactBundle({
      projectSource: source,
      sealedNarration: null,
      semanticTiming: timing,
    }).semanticTiming,
    timing,
  );
});

test("create accepts only the visual Beat type selected by the explicit timing source", () => {
  const content = { ...story, beats: story.beats.slice(1, 3) };
  assert.deepEqual(ProjectCreateStorySchema.parse(content), content);
  assert.throws(() =>
    ProjectCreateStorySchema.parse({ ...content, timingSource: undefined }),
  );
  assert.throws(() =>
    ProjectCreateStorySchema.parse({ ...content, beats: [story.beats[0]] }),
  );
  assert.throws(() =>
    ProjectCreateStorySchema.parse({ ...content, beats: validStorySpec.beats }),
  );
  assert.doesNotThrow(() => ProjectCreateStorySchema.parse(validStorySpec));
});

test("authored timing rejects mixed narration, interior templates and Stories without visual content", () => {
  assert.throws(() =>
    StorySpecSchema.parse({
      ...story,
      beats: [visualBeat("visual", 20), ...validStorySpec.beats],
    }),
  );
  assert.throws(() =>
    StorySpecSchema.parse({
      ...story,
      beats: [
        visualBeat("start", 20),
        boundaryBeat("middle", 10),
        visualBeat("end", 20),
      ],
    }),
  );
  assert.throws(() =>
    StorySpecSchema.parse({
      ...story,
      beats: [boundaryBeat("intro", 10), boundaryBeat("outro", 10)],
    }),
  );
  assert.throws(() =>
    generateAuthoredFrameTiming({
      story: StorySpecSchema.parse(validStorySpec),
      render,
    }),
  );
  assert.throws(() =>
    generateSemanticTiming({
      story,
      narration: NarrationSpecSchema.parse(validNarrationSpec),
      render,
      sealedNarration: buildValidSealedNarrationManifest(),
    }),
  );
  assert.throws(() =>
    generateSemanticTiming({
      story: StorySpecSchema.parse(validStorySpec),
      narration: NarrationSpecSchema.parse(validNarrationSpec),
      render,
      sealedNarration: null,
    }),
  );
});

test("authored timing validates derived boundaries, content windows and safe integer totals", () => {
  const timing = generateAuthoredFrameTiming({ story, render });
  assert.throws(() =>
    AuthoredFrameTimingSchema.parse({
      ...timing,
      durationInFrames: timing.durationInFrames + 1,
    }),
  );
  assert.throws(() =>
    AuthoredFrameTimingSchema.parse({
      ...timing,
      contentFrameRange: { startFrame: 27, endFrame: 97 },
    }),
  );
  assert.throws(() =>
    AuthoredFrameTimingSchema.parse({ ...timing, sampleRate: 48000 }),
  );
  assert.throws(() =>
    AuthoredFrameTimingSchema.parse({ ...timing, narrationStartFrame: 0 }),
  );
  assert.throws(() =>
    AuthoredFrameTimingSchema.parse({
      ...timing,
      captionCues: [
        {
          chunkId: "fake",
          meaningId: "gather",
          text: "Fake narration",
          startFrame: 26,
          endFrame: 54,
        },
      ],
    }),
  );
  const changed = StorySpecSchema.parse({
    ...story,
    beats: [visualBeat("overlarge", Number.MAX_SAFE_INTEGER)],
  });
  assert.throws(() => generateAuthoredFrameTiming({ story: changed, render }));
});

test("authored timing fingerprints track frame authority and retain identity across non-timing render choices", () => {
  const timing = generateAuthoredFrameTiming({ story, render });
  const locale = generateAuthoredFrameTiming({
    story,
    render: RenderSpecSchema.parse({ ...render, locale: "en-US" }),
  });
  assert.equal(timing.fingerprint, locale.fingerprint);
  const changed = StorySpecSchema.parse({
    ...story,
    beats: [visualBeat("gather", 29), visualBeat("resolve", 43)],
  });
  assert.notEqual(
    generateAuthoredFrameTiming({ story: changed, render }).fingerprint,
    timing.fingerprint,
  );
});

test("authored content drives GlobalVisual decoration and duration diagnostics without a narration budget", () => {
  const timing = generateAuthoredFrameTiming({ story, render });
  const layers = deriveGlobalVisualLayerPolicy(timing);
  assert.deepEqual(layers.decorationFrameRange, {
    startFrame: 26,
    endFrame: 97,
  });
  assert.deepEqual(layers.baseFrameRange, { startFrame: 0, endFrame: 118 });
  const before = buildProjectDurationBudget({
    brief: VideoBriefSchema.parse(validVideoBrief),
    story,
    render,
  });
  assert.equal(before.boundarySeconds, 20 / 30);
  assert.equal(before.availableNarratedSeconds, 0);
  assert.equal(before.budgetState, "no-narration-budget");
  assert.equal(before.measurement, "not-yet-materialized");
  const measured = buildProjectDurationBudget({
    brief: VideoBriefSchema.parse(validVideoBrief),
    story,
    render,
    timing,
  });
  assert.equal(measured.measurement, "authored-frame-timing");
  assert.equal(measured.actualTotalSeconds, 118 / 30);
});

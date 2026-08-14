import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_INTRO_SCENE_PRESET,
  DEFAULT_OUTRO_SCENE_PRESET,
  StorySpecSchema,
  buildGenerationInput,
  buildSilentScenePreset,
  computeGenerationInputFingerprint,
  computeStoryFingerprint,
  generateSemanticTiming,
  NarrationSpecSchema,
  RenderSpecSchema,
} from "../../src/contracts";
import {
  buildValidSealedNarrationManifest,
  validNarrationSpec,
  validRenderSpec,
} from "../fixtures/narrative";

const narratedBeat = {
  kind: "narrated-scene" as const,
  meaningId: "opening",
  narrativePurpose: "Explain the real content.",
  ttsChunks: [{ chunkId: "opening-01", ttsText: "A" }],
  explicitPauses: [{ afterChunkId: "opening-01", pauseMs: 250 }],
};

const conclusionBeat = {
  kind: "narrated-scene" as const,
  meaningId: "conclusion",
  narrativePurpose: "Conclude the real content.",
  ttsChunks: [{ chunkId: "conclusion-01", ttsText: "B" }],
  explicitPauses: [],
};

const silentBeat = (
  sceneRole: "intro" | "outro",
  preset =
    sceneRole === "intro"
      ? DEFAULT_INTRO_SCENE_PRESET
      : DEFAULT_OUTRO_SCENE_PRESET,
) => ({
  kind: "silent-scene" as const,
  sceneRole,
  meaningId: sceneRole,
  narrativePurpose: `Render the ${sceneRole} as a normal ScenePackage.`,
  preset,
});

const storyWithDefaultBookends = () =>
  StorySpecSchema.parse({
    schemaVersion: 2,
    storyId: "story-example",
    title: "Unified ScenePackage timeline",
    bookends: {
      intro: { mode: "scene", meaningId: "intro" },
      outro: { mode: "scene", meaningId: "outro" },
    },
    beats: [
      silentBeat("intro"),
      narratedBeat,
      conclusionBeat,
      silentBeat("outro"),
    ],
  });

const narration = NarrationSpecSchema.parse(validNarrationSpec);
const render = RenderSpecSchema.parse(validRenderSpec);

test("default intro and outro presets bind role visual sound duration and resources", () => {
  for (const preset of [
    DEFAULT_INTRO_SCENE_PRESET,
    DEFAULT_OUTRO_SCENE_PRESET,
  ]) {
    assert.ok(preset.visualIntent.length > 0);
    assert.ok(preset.soundIntent.length > 0);
    assert.ok(preset.durationInFrames > 0);
    assert.ok(preset.resourceIds.length > 0);
    assert.match(preset.presetFingerprint, /^sha256:[0-9a-f]{64}$/u);
  }
  assert.equal(DEFAULT_INTRO_SCENE_PRESET.sceneRole, "intro");
  assert.equal(DEFAULT_OUTRO_SCENE_PRESET.sceneRole, "outro");
});

test("StorySpec strictly discriminates narrated and silent Scenes", () => {
  const story = storyWithDefaultBookends();
  assert.deepEqual(
    buildGenerationInput(story, narration).chunks,
    [
      { chunkId: "opening-01", meaningId: "opening", ttsText: "A" },
      { chunkId: "conclusion-01", meaningId: "conclusion", ttsText: "B" },
    ],
  );

  assert.throws(() =>
    StorySpecSchema.parse({
      ...story,
      bookends: {
        intro: { mode: "scene", meaningId: "intro" },
        outro: { mode: "disabled" },
      },
      beats: [
        { ...silentBeat("intro"), ttsChunks: [], explicitPauses: [] },
        narratedBeat,
      ],
    }),
  );
  assert.throws(() =>
    StorySpecSchema.parse({
      ...story,
      bookends: {
        intro: { mode: "scene", meaningId: "intro" },
        outro: { mode: "scene", meaningId: "outro" },
      },
      beats: [silentBeat("intro"), silentBeat("outro")],
    }),
  );
  assert.throws(() =>
    StorySpecSchema.parse({
      ...story,
      bookends: {
        intro: { mode: "scene", meaningId: "intro" },
        outro: { mode: "disabled" },
      },
      beats: [narratedBeat, silentBeat("intro"), conclusionBeat],
    }),
  );
});

test("replacing or disabling a bookend is explicit and never changes narration generation", () => {
  const original = storyWithDefaultBookends();
  const replacementPreset = buildSilentScenePreset({
    sceneRole: "intro",
    presetId: "project-intro-fast-v1",
    durationInFrames: 45,
    visualIntent: "Use the Project-specific fast intro visual.",
    soundIntent: "Use only the Project-specific fast intro chime.",
    resourceIds: ["asset.project-intro-fast-chime"],
  });
  const replaced = StorySpecSchema.parse({
    ...original,
    beats: [
      silentBeat("intro", replacementPreset),
      narratedBeat,
      conclusionBeat,
      silentBeat("outro"),
    ],
  });
  const disabled = StorySpecSchema.parse({
    ...original,
    bookends: {
      intro: { mode: "disabled" },
      outro: { mode: "disabled" },
    },
    beats: [narratedBeat, conclusionBeat],
  });

  assert.notEqual(
    computeStoryFingerprint(original),
    computeStoryFingerprint(replaced),
  );
  assert.notEqual(
    computeStoryFingerprint(original),
    computeStoryFingerprint(disabled),
  );
  assert.equal(
    computeGenerationInputFingerprint(original, narration),
    computeGenerationInputFingerprint(replaced, narration),
  );
  assert.equal(
    computeGenerationInputFingerprint(original, narration),
    computeGenerationInputFingerprint(disabled, narration),
  );
});

test("SemanticTiming resolves intro narrated Scenes outro and true padding once", () => {
  const timing = generateSemanticTiming({
    story: storyWithDefaultBookends(),
    narration,
    render,
    sealedNarration: buildValidSealedNarrationManifest(),
  });

  assert.equal(timing.schemaVersion, 2);
  assert.equal(timing.narrationStartFrame, 75);
  assert.deepEqual(timing.storyBeats, [
    {
      kind: "silent-scene",
      sceneRole: "intro",
      meaningId: "intro",
      presetFingerprint: DEFAULT_INTRO_SCENE_PRESET.presetFingerprint,
      presetDurationInFrames: DEFAULT_INTRO_SCENE_PRESET.durationInFrames,
      startFrame: 15,
      endFrame: 75,
    },
    {
      kind: "narrated-scene",
      meaningId: "opening",
      startFrame: 75,
      endFrame: 116,
    },
    {
      kind: "narrated-scene",
      meaningId: "conclusion",
      startFrame: 116,
      endFrame: 144,
    },
    {
      kind: "silent-scene",
      sceneRole: "outro",
      meaningId: "outro",
      presetFingerprint: DEFAULT_OUTRO_SCENE_PRESET.presetFingerprint,
      presetDurationInFrames: DEFAULT_OUTRO_SCENE_PRESET.durationInFrames,
      startFrame: 144,
      endFrame: 384,
    },
  ]);
  assert.deepEqual(timing.captionCues, [
    {
      chunkId: "opening-01",
      meaningId: "opening",
      text: "A",
      startFrame: 75,
      endFrame: 108,
    },
    {
      chunkId: "conclusion-01",
      meaningId: "conclusion",
      text: "B",
      startFrame: 116,
      endFrame: 144,
    },
  ]);
  assert.equal(timing.durationInFrames, 396);
  assert.equal(
    timing.segments.some((segment) => segment.meaningId === "intro"),
    false,
  );
  assert.equal(
    timing.segments.some((segment) => segment.meaningId === "outro"),
    false,
  );
});

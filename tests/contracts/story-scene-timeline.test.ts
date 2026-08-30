import assert from "node:assert/strict";
import test from "node:test";

import {
  NarrationSpecSchema,
  RenderSpecSchema,
  StorySpecSchema,
  buildGenerationInput,
  buildSilentScenePreset,
  computeGenerationInputFingerprint,
  computeStoryFingerprint,
  generateSemanticTiming,
} from "@axmorf/studio/contracts";
import {
  buildValidSealedNarrationManifest,
  validNarrationSpec,
  validRenderSpec,
} from "../fixtures/narrative";

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;

const copiedPreset = (templateId: string, durationInFrames: number) =>
  buildSilentScenePreset({
    presetId: templateId,
    durationInFrames,
    visualIntent: `Render copied template ${templateId}.`,
    soundIntent: "Use only its copied sound-effect contribution.",
    resourceIds: [`asset.story-example.${templateId}.chime`],
    implementation: {
      kind: "template-copy",
      templateId,
      templateFingerprint: sha("a"),
      instanceFingerprint: sha("b"),
      rendererSourceFingerprint: sha("c"),
      soundCues: [
        {
          cueId: "chime",
          resourceId: `asset.story-example.${templateId}.chime`,
          anchorId: "start",
          offsetFrames: 0,
          durationInFrames: 10,
          volume: 0.8,
        },
      ],
    },
  });

const firstPreset = copiedPreset("brand-reveal-v1", 60);
const lastPreset = copiedPreset("source-follow-v1", 240);
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
const silentBeat = (meaningId: string, preset = firstPreset) => ({
  kind: "silent-scene" as const,
  meaningId,
  narrativePurpose: "Render a configured reusable Scene copy.",
  preset,
});
const storyWithCopiedBoundaryScenes = () =>
  StorySpecSchema.parse({
    schemaVersion: 3,
    storyId: "story-example",
    title: "Unified ScenePackage timeline",
    beats: [
      silentBeat("first-scene"),
      narratedBeat,
      conclusionBeat,
      silentBeat("last-scene", lastPreset),
    ],
  });

const narration = NarrationSpecSchema.parse(validNarrationSpec);
const render = RenderSpecSchema.parse(validRenderSpec);

test("generic silent Scene presets bind copied identity without placement semantics", () => {
  assert.equal(firstPreset.implementation.kind, "template-copy");
  assert.equal("sceneRole" in firstPreset, false);
  assert.match(firstPreset.presetFingerprint, /^sha256:[0-9a-f]{64}$/u);
  const changedTemplate = buildSilentScenePreset({
    presetId: firstPreset.presetId,
    durationInFrames: firstPreset.durationInFrames,
    visualIntent: firstPreset.visualIntent,
    soundIntent: firstPreset.soundIntent,
    resourceIds: firstPreset.resourceIds,
    implementation: {
      ...firstPreset.implementation,
      instanceFingerprint: sha("d"),
    },
  });
  assert.notEqual(
    changedTemplate.presetFingerprint,
    firstPreset.presetFingerprint,
  );
});

test("StorySpec accepts silent Scenes only at timeline boundaries", () => {
  const story = storyWithCopiedBoundaryScenes();
  assert.deepEqual(buildGenerationInput(story, narration).chunks, [
    { chunkId: "opening-01", meaningId: "opening", ttsText: "A" },
    { chunkId: "conclusion-01", meaningId: "conclusion", ttsText: "B" },
  ]);
  assert.throws(() =>
    StorySpecSchema.parse({
      ...story,
      beats: [narratedBeat, silentBeat("middle"), conclusionBeat],
    }),
  );
  assert.throws(() =>
    StorySpecSchema.parse({
      ...story,
      beats: [silentBeat("one"), silentBeat("two")],
    }),
  );
});

test("selecting, replacing, or disabling a boundary Scene never changes narration generation", () => {
  const original = storyWithCopiedBoundaryScenes();
  const replacementPreset = buildSilentScenePreset({
    presetId: "project-fast-v1",
    durationInFrames: 45,
    visualIntent: "Use the Project-specific Scene visual.",
    soundIntent: "Use only its Project-specific Scene sound.",
    resourceIds: [],
    implementation: { kind: "scene-owner" },
  });
  const replaced = StorySpecSchema.parse({
    ...original,
    beats: [
      silentBeat("first-scene", replacementPreset),
      narratedBeat,
      conclusionBeat,
      silentBeat("last-scene", lastPreset),
    ],
  });
  const disabled = StorySpecSchema.parse({
    ...original,
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

test("SemanticTiming uses timeline order rather than intro or outro roles", () => {
  const timing = generateSemanticTiming({
    story: storyWithCopiedBoundaryScenes(),
    narration,
    render,
    sealedNarration: buildValidSealedNarrationManifest(),
  });

  assert.equal(timing.schemaVersion, 3);
  assert.equal(timing.narrationStartFrame, 75);
  assert.deepEqual(timing.storyBeats, [
    {
      kind: "silent-scene",
      meaningId: "first-scene",
      presetFingerprint: firstPreset.presetFingerprint,
      presetDurationInFrames: 60,
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
      meaningId: "last-scene",
      presetFingerprint: lastPreset.presetFingerprint,
      presetDurationInFrames: 240,
      startFrame: 144,
      endFrame: 384,
    },
  ]);
  assert.equal(timing.durationInFrames, 396);
});

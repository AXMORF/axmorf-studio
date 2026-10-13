import assert from "node:assert/strict";
import test from "node:test";

import {
  NarrationSpecSchema,
  RenderSpecSchema,
  StorySpecSchema,
  buildProjectSoundPlan,
  generateSemanticTiming,
} from "@axmorf/studio/contracts";

import { snapProducerFrameToBeat } from "../../packages/studio/src/remotion/capabilities/motion";
import {
  mergeSpeechRanges,
  resolveSpeechDuckingGain,
} from "../../packages/studio/src/remotion/runtime/sound-design/audio-playback";
import { resolveNarrationSpeechRanges } from "../../packages/studio/src/remotion/runtime/sound-design/SoundDesignTrack";
import {
  buildValidSealedNarrationManifest,
  validNarrationSpec,
  validRenderSpec,
  validStorySpec,
} from "../fixtures/narrative";

test("speech ranges merge across short breaths and become contribution-local", () => {
  assert.deepEqual(
    mergeSpeechRanges(
      [
        [130, 160],
        [100, 120],
        [200, 240],
      ],
      8,
      40,
    ),
    [
      [60, 120],
      [160, 200],
    ],
  );
});

test("ducking ramps into speech, holds under it and recovers after", () => {
  const ducking = {
    volume: 0.06,
    rampFrames: 10,
    ranges: [[100, 200]] as const,
  };
  const gain = (frame: number) =>
    resolveSpeechDuckingGain(frame, 0.24, ducking);
  assert.equal(gain(50), 1);
  assert.equal(gain(90), 1);
  assert.ok(Math.abs(gain(95) - (1 + 0.5 * (0.25 - 1))) < 1e-9);
  assert.equal(gain(100), 0.25);
  assert.equal(gain(199), 0.25);
  assert.ok(gain(205) > 0.25 && gain(205) < 1);
  assert.equal(gain(210), 1);
  assert.equal(resolveSpeechDuckingGain(150, 0, ducking), 1);
});

test("a frozen ducking volume cannot exceed the contribution volume", () => {
  const contribution = {
    contributionId: "background-music",
    resourceId: "asset.story.background-music",
    descriptorFingerprint: `sha256:${"a".repeat(64)}`,
    volume: 0.2,
    loop: true,
    playbackScope: "content-window" as const,
  };
  assert.doesNotThrow(() =>
    buildProjectSoundPlan({
      storyId: "story",
      contributions: [
        { ...contribution, speechDucking: { volume: 0.08, rampFrames: 8 } },
      ],
    }),
  );
  assert.throws(
    () =>
      buildProjectSoundPlan({
        storyId: "story",
        contributions: [
          { ...contribution, speechDucking: { volume: 0.3, rampFrames: 8 } },
        ],
      }),
    /cannot raise music/u,
  );
});

test("beat snapping moves landings only within the shift and permitted window", () => {
  const grid = [0, 15, 30, 45, 60];
  assert.equal(snapProducerFrameToBeat(33, grid), 30);
  assert.equal(snapProducerFrameToBeat(38, grid), 38, "too far from any beat");
  assert.equal(snapProducerFrameToBeat(38, grid, { maxShiftFrames: 8 }), 45);
  assert.equal(
    snapProducerFrameToBeat(33, grid, { minFrame: 32 }),
    33,
    "the nearest beat lies outside the permitted window",
  );
  assert.throws(() => snapProducerFrameToBeat(Number.NaN, grid));
});

test("measured narration chunks become the ducking ranges", () => {
  const timing = generateSemanticTiming({
    story: StorySpecSchema.parse(validStorySpec),
    narration: NarrationSpecSchema.parse(validNarrationSpec),
    render: RenderSpecSchema.parse(validRenderSpec),
    sealedNarration: buildValidSealedNarrationManifest(),
  });
  assert.ok("segments" in timing);
  const chunks = timing.segments.filter(({ kind }) => kind === "chunk");
  const ranges = resolveNarrationSpeechRanges(timing);
  assert.equal(ranges.length, chunks.length);
  assert.ok(ranges.length > 0);
  assert.deepEqual(ranges[0], [
    chunks[0]!.frameRange.startFrame,
    chunks[0]!.frameRange.endFrame,
  ]);
  assert.deepEqual(resolveNarrationSpeechRanges(null), []);
});

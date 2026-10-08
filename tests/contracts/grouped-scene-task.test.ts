import assert from "node:assert/strict";
import test from "node:test";
import {
  SceneTaskInputSchema,
  aggregateSceneStoryBeat,
  aggregateSceneTimingBeat,
  buildSceneTaskInputV8,
  buildSilentScenePreset,
  computeSceneTaskInputFingerprint,
  StoryBeatSchema,
} from "@axmorf/studio/contracts";
import { createScenePackageInput } from "../fixtures/scene/package-input";

const groupedTask = (silent: boolean) => {
  const base = createScenePackageInput().task;
  const beats = ["meaning-one", "meaning-two"].map((meaningId) =>
    StoryBeatSchema.parse(
      silent
        ? {
            kind: "silent-scene",
            meaningId,
            narrativePurpose: meaningId,
            preset: buildSilentScenePreset({
              presetId: meaningId,
              durationInFrames: 60,
              visualIntent: "One continuous world.",
              soundIntent: "Event sound only.",
              resourceIds: [],
              implementation: { kind: "scene-owner" },
            }),
          }
        : {
            kind: "narrated-scene",
            meaningId,
            narrativePurpose: meaningId,
            ttsChunks: [{ chunkId: `${meaningId}-01`, ttsText: meaningId }],
            explicitPauses: [],
          },
    ),
  );
  const timings = beats.map((beat, index) => {
    const range = {
      meaningId: beat.meaningId,
      startFrame: 20 + index * 60,
      endFrame: 80 + index * 60,
    };
    return beat.kind === "silent-scene"
      ? {
          kind: "silent-scene" as const,
          ...range,
          presetFingerprint: beat.preset.presetFingerprint,
          presetDurationInFrames: 60,
        }
      : { kind: "narrated-scene" as const, ...range };
  });
  const storyBeat = aggregateSceneStoryBeat(beats);
  return buildSceneTaskInputV8({
    ...base,
    ...(silent ? { allowedResourceIds: [] } : {}),
    storyBeat,
    timingBeat: aggregateSceneTimingBeat(
      timings,
      beats.map(({ meaningId }) => meaningId),
      storyBeat,
    ),
    coveredBeats: beats.map((storyBeat, index) => ({
      storyBeat,
      timingBeat: timings[index],
    })),
  });
};

test("grouped task binds every original narrated Beat and one continuous window", () => {
  const task = groupedTask(false);
  assert.equal(task.schemaVersion, 8);
  assert.equal(task.storyBeat.kind, "narrated-scene");
  assert.equal(task.storyBeat.ttsChunks.length, 2);
  assert.equal(task.timingBeat.endFrame - task.timingBeat.startFrame, 120);
  const changed = {
    ...task,
    coveredBeats: task.coveredBeats!.map((member, index) =>
      index === 1
        ? { ...member, timingBeat: { ...member.timingBeat, startFrame: 81 } }
        : member,
    ),
  };
  assert.equal(
    SceneTaskInputSchema.safeParse({
      ...changed,
      taskInputFingerprint: computeSceneTaskInputFingerprint(changed),
    }).success,
    false,
  );
  const truncated = {
    ...task,
    storyBeat: {
      ...task.storyBeat,
      ttsChunks: task.storyBeat.ttsChunks.slice(0, 1),
    },
  };
  assert.equal(
    SceneTaskInputSchema.safeParse({
      ...truncated,
      taskInputFingerprint: computeSceneTaskInputFingerprint(truncated),
    }).success,
    false,
  );
});

test("grouped authored-frame task binds individual presets and the summed owner duration", () => {
  const task = groupedTask(true);
  assert.equal(task.storyBeat.kind, "silent-scene");
  assert.equal(task.storyBeat.preset.durationInFrames, 120);
  const preset = task.storyBeat.preset;
  assert.equal(task.timingBeat.kind, "silent-scene");
  assert.equal(
    task.timingBeat.presetFingerprint,
    task.storyBeat.preset.presetFingerprint,
  );
  const changed = {
    ...task,
    coveredBeats: task.coveredBeats!.map((member, index) =>
      index === 1
        ? {
            ...member,
            storyBeat: StoryBeatSchema.parse({ ...member.storyBeat, preset }),
          }
        : member,
    ),
  };
  assert.equal(
    SceneTaskInputSchema.safeParse({
      ...changed,
      taskInputFingerprint: computeSceneTaskInputFingerprint(changed),
    }).success,
    false,
  );
});

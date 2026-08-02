import assert from "node:assert/strict";
import test from "node:test";

import { SceneTaskInputSchema } from "../../src/contracts/scene-task";
import { createM6SceneTaskInput } from "../fixtures/scene/m6-scene-input";

test("SceneTaskInput binds exact StoryBeat timing shared identities allowlists continuity and directories", () => {
  const task = createM6SceneTaskInput();
  assert.equal(task.storyBeat.meaningId, task.meaningId);
  assert.equal(task.timingBeat.endFrame - task.timingBeat.startFrame, 120);
  assert.equal(
    task.allowedDirectories.sceneRoot,
    "src/projects/synthetic-proof/scenes/meaning-one",
  );
  assert.equal(
    SceneTaskInputSchema.parse(task).taskInputFingerprint,
    task.taskInputFingerprint,
  );
});

test("SceneTaskInput fails closed on meaning timing snapshot directory and fingerprint drift", () => {
  const task = createM6SceneTaskInput();
  for (const mutation of [
    { ...task, meaningId: "meaning-two" },
    { ...task, timingBeat: { ...task.timingBeat, meaningId: "meaning-two" } },
    { ...task, allowedSnapshots: [] },
    {
      ...task,
      allowedDirectories: {
        ...task.allowedDirectories,
        sceneRoot: "src/projects/synthetic-proof/scenes/another",
      },
    },
    { ...task, storyFingerprint: `sha256:${"f".repeat(64)}` },
  ]) {
    assert.throws(() => SceneTaskInputSchema.parse(mutation));
  }
});

test("SceneTaskInput rejects historical Scene and arbitrary output fields", () => {
  const task = createM6SceneTaskInput();
  assert.throws(() =>
    SceneTaskInputSchema.parse({
      ...task,
      historicalScenePath: "src/projects/old/scenes/meaning-one/Renderer.tsx",
    }),
  );
  assert.throws(() =>
    SceneTaskInputSchema.parse({
      ...task,
      allowedDirectories: {
        ...task.allowedDirectories,
        arbitraryOutput: "/tmp/output",
      },
    }),
  );
});

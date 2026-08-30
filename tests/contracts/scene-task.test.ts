import assert from "node:assert/strict";
import test from "node:test";

import { SceneTaskInputSchema } from "@axmorf/studio/contracts";
import { createSceneTaskInput } from "../fixtures/scene/scene-input";

test("SceneTaskInput binds exact StoryBeat timing shared identities allowlists continuity and directories", () => {
  const task = createSceneTaskInput();
  assert.equal(task.schemaVersion, 7);
  assert.equal(task.sceneViewport.coordinateSpace, "scene-safe-area-local");
  assert.equal(task.sceneViewport.width, 1740);
  assert.equal(task.sceneViewport.height, 630);
  assert.equal(
    "readabilityPolicyFingerprint" in task.sceneViewport,
    false,
    "Scene viewport must not expose the Composition policy identity",
  );
  assert.equal(
    "readabilityPolicy" in task,
    false,
    "Scene task must not expose Composition-owned insets",
  );
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
  const task = createSceneTaskInput();
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
    {
      ...task,
      sourceReferences: [
        { title: "Changed visible source", url: "https://example.com/source" },
      ],
    },
    { ...task, storyFingerprint: `sha256:${"f".repeat(64)}` },
    {
      ...task,
      sceneViewport: { ...task.sceneViewport, width: 1920 },
    },
  ]) {
    assert.throws(() => SceneTaskInputSchema.parse(mutation));
  }
});

test("SceneTaskInput rejects historical Scene and arbitrary output fields", () => {
  const task = createSceneTaskInput();
  assert.throws(() =>
    SceneTaskInputSchema.parse({
      ...task,
      historicalScenePath: "src/projects/old/scenes/meaning-one/Renderer.tsx",
    }),
  );
  assert.throws(() =>
    SceneTaskInputSchema.parse({
      ...task,
      semanticTimingFingerprint: `sha256:${"a".repeat(64)}`,
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

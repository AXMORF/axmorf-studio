import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("default Project build has no Run owner watcher or detached launch dependency", async () => {
  const sources = await Promise.all([
    readFile("scripts/project-build/application/build.ts", "utf8"),
    readFile("scripts/project-build/application/prepare.ts", "utf8"),
  ]);
  const combined = sources.join("\n");
  assert.doesNotMatch(combined, /\.producer-runs|owner-receipt|watcher|runId/iu);
  assert.doesNotMatch(combined, /launchDetached|render-launch/iu);
});

test("current generated Composition is authoring-bound rather than Run-bound", async () => {
  const { renderProjectAuthoringBuildScaffold } = await import(
    "../../scripts/production/application/project-scaffold"
  );
  const source = renderProjectAuthoringBuildScaffold({
    storyId: "story-example",
  });
  assert.doesNotMatch(source, /production-render-plan|renderPlan|runId/u);
  assert.match(source, /Production GlobalVisual authoring identity/u);
  assert.match(source, /masteredNarration\.sourceAudio\.checksum/u);
});

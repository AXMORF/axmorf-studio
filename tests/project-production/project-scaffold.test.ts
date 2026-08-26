import assert from "node:assert/strict";
import test from "node:test";

import {
  renderProjectAuthoringBuildScaffold,
  renderReadabilityAwareProductionSceneRuntime,
} from "../../scripts/project-production/application/project-scaffold";

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;

test("production Scene runtime guards current package and task schema versions", () => {
  const source = renderReadabilityAwareProductionSceneRuntime({
    storyId: "story-example",
    meaningIds: ["opening"],
    runtimeInputFingerprint: sha("a"),
  });
  assert.match(source, /scenePackage\.schemaVersion !== 6/u);
  assert.match(source, /task\.schemaVersion !== 7/u);
  assert.doesNotMatch(source, /task\.schemaVersion !== 6/u);
  assert.doesNotMatch(source, /width: render\.width|height: render\.height/u);
  assert.match(source, /readabilityPolicy: requirements\.readabilityPolicy/u);
  assert.match(
    source,
    /resolveSceneViewport\(requirements\.readabilityPolicy\)/u,
  );
  assert.match(source, /scene\.task\.sceneViewport\.viewportFingerprint/u);
});

test("production scaffold source binds the complete runtime input identity for Studio refresh", () => {
  const first = renderReadabilityAwareProductionSceneRuntime({
    storyId: "story-example",
    meaningIds: ["opening"],
    runtimeInputFingerprint: sha("a"),
  });
  const second = renderReadabilityAwareProductionSceneRuntime({
    storyId: "story-example",
    meaningIds: ["opening"],
    runtimeInputFingerprint: sha("b"),
  });
  const composition = renderProjectAuthoringBuildScaffold({
    storyId: "story-example",
    runtimeInputFingerprint: sha("a"),
  });

  assert.notEqual(first, second);
  assert.match(first, new RegExp(sha("a"), "u"));
  assert.match(composition, new RegExp(sha("a"), "u"));
  assert.match(composition, /<ProductionGlobalVisualBaseLayer\/>/u);
  assert.match(
    composition,
    /<Sequence from=\{globalVisualLayerPolicy\.decorationLayerFrameRange\.startFrame\}[^>]+layout="none"><ProductionGlobalVisualDecorationLayers\/><\/Sequence>/u,
  );
});

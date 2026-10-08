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
  assert.match(source, /scenePackage\.schemaVersion === 7/u);
  assert.match(source, /task\.schemaVersion === 8/u);
  assert.doesNotMatch(source, /task\.schemaVersion !== 6/u);
  assert.doesNotMatch(source, /width: render\.width|height: render\.height/u);
  assert.match(source, /readabilityPolicy: requirements\.readabilityPolicy/u);
  assert.match(
    source,
    /resolveSceneViewport\(requirements\.readabilityPolicy\)/u,
  );
  assert.match(source, /scene\.task\.sceneViewport\.viewportFingerprint/u);
});

test("authored-frame scaffold owns no narration file or invented audio", () => {
  const source = renderProjectAuthoringBuildScaffold({
    storyId: "story-example",
    runtimeInputFingerprint: sha("a"),
    timingSource: "authored-frames",
  });
  assert.doesNotMatch(
    source,
    /import .* from "\.\/generated\/(?:sealed|mastered)-narration/u,
  );
  assert.match(source, /const completeNarrationSrc = null/u);
  assert.match(source, /const sealedNarration = null/u);
  assert.match(
    source,
    /projectSource\.story\.timingSource !== "authored-frames"/u,
  );
  assert.doesNotMatch(
    source,
    /\bstaticFile\b|MasteredNarrationManifestSchema|SealedNarrationManifestSchema|const masteredNarration/u,
  );
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
  assert.match(
    composition,
    /globalVisualBackgroundLayers=\{visualStyle\.theme === undefined \? <ProductionGlobalVisualBaseLayer\/> : <ThemedGlobalVisualBackground theme=\{visualStyle\.theme\}>\{decorationLayers\}<\/ThemedGlobalVisualBackground>\}/u,
  );
  assert.match(composition, /VisualStyleSpecSchema\.parse\(visualStyleJson\)/u);
  assert.match(composition, /visualStyle\.storyId !== storyId/u);
  assert.match(
    composition,
    /const decorationLayers = <Sequence from=\{globalVisualLayerPolicy\.decorationFrameRange\.startFrame\}[^>]+layout="absolute-fill"><ProductionGlobalVisualDecorationLayers\/><\/Sequence>/u,
  );
});

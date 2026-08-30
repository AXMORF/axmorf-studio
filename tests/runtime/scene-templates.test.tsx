import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  AxmorfIntroScene,
  AxmorfOutroScene,
} from "@axmorf/studio/remotion";
import { resolveBrandFollowLockupLayout } from "@axmorf/studio/remotion";
import {
  SCENE_TEMPLATE_DEFINITIONS,
  renderCopiedSceneRenderer,
} from "@axmorf/studio/remotion";

test("reusable Scene template renderers remain visual-only", async () => {
  assert.equal(typeof AxmorfIntroScene, "function");
  assert.equal(typeof AxmorfOutroScene, "function");
  const sources = await Promise.all(
    [
      "../../packages/studio/src/remotion/capabilities/scene-templates/axmorf/AxmorfIntroScene.tsx",
      "../../packages/studio/src/remotion/capabilities/scene-templates/axmorf/AxmorfOutroScene.tsx",
      "../../packages/studio/src/remotion/capabilities/scene-templates/axmorf/SourceCreditsScene.tsx",
      "../../packages/studio/src/remotion/capabilities/scene-templates/axmorf/BrandFollowScene.tsx",
    ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
  );
  for (const source of sources) {
    assert.doesNotMatch(
      source,
      /@remotion\/media|<Audio\b|<Html5Audio\b|<OffthreadVideo\b/iu,
    );
  }
});

test("copied Scene template renderers adapt the local SceneViewport to template dimensions", () => {
  for (const definition of SCENE_TEMPLATE_DEFINITIONS) {
    const source = renderCopiedSceneRenderer(definition);
    assert.match(source, /viewportWidth: number;/u);
    assert.match(source, /viewportHeight: number;/u);
    assert.match(source, /width=\{viewportWidth\}/u);
    assert.match(source, /height=\{viewportHeight\}/u);
    assert.doesNotMatch(source, /\n {2}width: number;/u);
    assert.doesNotMatch(source, /\n {2}height: number;/u);
  }
});

test("outro brand lockup stays centered in portrait and landscape viewports", () => {
  for (const viewport of [
    { width: 1080, height: 1920 },
    { width: 1920, height: 1080 },
  ]) {
    const layout = resolveBrandFollowLockupLayout(viewport);
    assert.equal(
      layout.lockupLeft + layout.lockupWidth / 2,
      viewport.width / 2,
    );
    assert.equal(
      layout.markCenteredLeft + layout.markSize / 2,
      layout.lockupWidth / 2,
    );
    assert.ok(layout.lockupLeft >= 0);
    assert.ok(layout.lockupLeft + layout.lockupWidth <= viewport.width);
  }
});

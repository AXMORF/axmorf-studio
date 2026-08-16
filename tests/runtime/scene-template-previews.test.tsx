import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  BrandRevealTemplatePreview,
  SourceFollowTemplatePreview,
  SYSTEM_SCENE_TEMPLATE_PREVIEW_SPECS,
} from "../../src/remotion/compositions/scene-template-previews/SceneTemplatePreviews";

test("System Scene template previews play configured contributions from frame zero", async () => {
  assert.equal(typeof BrandRevealTemplatePreview, "function");
  assert.equal(typeof SourceFollowTemplatePreview, "function");
  assert.equal(SYSTEM_SCENE_TEMPLATE_PREVIEW_SPECS.intro.durationInFrames, 60);
  assert.equal(SYSTEM_SCENE_TEMPLATE_PREVIEW_SPECS.outro.durationInFrames, 240);
  const intro = SYSTEM_SCENE_TEMPLATE_PREVIEW_SPECS.intro.audio;
  const outro = SYSTEM_SCENE_TEMPLATE_PREVIEW_SPECS.outro.audio;
  if (intro !== null) {
    assert.equal(intro.startFrame, 0);
    assert.equal(intro.durationInFrames, 60);
    assert.equal(intro.role, "sound-effect");
  }
  if (outro !== null) {
    assert.equal(outro.startFrame, 0);
    assert.equal(outro.durationInFrames, 240);
    assert.equal(outro.role, "background-music");
  }
  const source = await readFile(
    new URL(
      "../../src/remotion/compositions/scene-template-previews/SceneTemplatePreviews.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(source, /<Html5Audio/u);
  assert.match(source, /staticFile\(/u);
  assert.doesNotMatch(source, /src=\{?["']https?:\/\//u);
});

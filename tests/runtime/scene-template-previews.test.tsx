import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  BrandRevealTemplatePreview,
  buildSceneTemplatePreviewSpecs,
  SourceFollowTemplatePreview,
  SYSTEM_SCENE_TEMPLATE_PREVIEW_SPECS,
} from "../../packages/studio/src/remotion/compositions/scene-template-previews/SceneTemplatePreviews";
import { DEFAULT_SCENE_TEMPLATE_AUDIO_PROJECTION } from "../../packages/studio/src/remotion/capabilities/scene-templates/registry";
import type { SceneTemplateAudioProjection } from "../../packages/studio/src/remotion/capabilities/scene-templates/template-audio";

test("System Scene template previews play packaged contributions from frame zero", async () => {
  assert.equal(typeof BrandRevealTemplatePreview, "function");
  assert.equal(typeof SourceFollowTemplatePreview, "function");
  assert.equal(SYSTEM_SCENE_TEMPLATE_PREVIEW_SPECS.intro.durationInFrames, 60);
  assert.equal(SYSTEM_SCENE_TEMPLATE_PREVIEW_SPECS.outro.durationInFrames, 240);
  const intro = SYSTEM_SCENE_TEMPLATE_PREVIEW_SPECS.intro.audio;
  const outro = SYSTEM_SCENE_TEMPLATE_PREVIEW_SPECS.outro.audio;
  assert.ok(intro);
  assert.equal(intro.startFrame, 0);
  assert.equal(intro.durationInFrames, 60);
  assert.equal(intro.role, "sound-effect");
  assert.equal(
    intro.publicPath,
    "public/assets/axmorf-shared/audio/sound-effects/mixkit-movie-trailer-epic-impact-2908-intro-2s.wav",
  );
  assert.ok(outro);
  assert.equal(outro.startFrame, 0);
  assert.equal(outro.durationInFrames, 240);
  assert.equal(outro.role, "background-music");
  assert.equal(
    outro.publicPath,
    "public/assets/axmorf-shared/audio/music/mixkit-deep-urban-623-outro-8s.mp3",
  );
  const source = await readFile(
    new URL(
      "../../packages/studio/src/remotion/compositions/scene-template-previews/SceneTemplatePreviews.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(source, /<Html5Audio/u);
  assert.match(source, /pauseWhenBuffering/u);
  assert.match(source, /preload="auto"/u);
  assert.match(source, /prefetch\(src, \{ method: "blob-url"/u);
  assert.match(source, /staticFile\(/u);
  assert.doesNotMatch(source, /src=\{?["']https?:\/\//u);
});

test("System Scene template previews honor the Workspace-local audio projection", () => {
  const defaultIntro = DEFAULT_SCENE_TEMPLATE_AUDIO_PROJECTION.intro;
  const defaultOutro = DEFAULT_SCENE_TEMPLATE_AUDIO_PROJECTION.outro;
  assert.ok(defaultIntro);
  assert.ok(defaultOutro);
  const workspaceProjection = {
    ...DEFAULT_SCENE_TEMPLATE_AUDIO_PROJECTION,
    intro: {
      ...defaultIntro,
      source: {
        ...defaultIntro.source,
        localPath: "public/assets/library/custom/original-intro.wav",
      },
    },
    outro: {
      ...defaultOutro,
      source: {
        ...defaultOutro.source,
        localPath: "public/assets/library/custom/original-outro.mp3",
      },
    },
  } satisfies SceneTemplateAudioProjection;

  const specs = buildSceneTemplatePreviewSpecs(workspaceProjection);
  assert.equal(
    specs.intro.audio?.publicPath,
    "public/assets/library/custom/original-intro.wav",
  );
  assert.equal(
    specs.outro.audio?.publicPath,
    "public/assets/library/custom/original-outro.mp3",
  );
});

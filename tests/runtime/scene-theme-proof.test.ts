import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveSceneReadabilityPolicy,
  resolveSceneViewport,
} from "../../packages/studio/src/contracts/scene-readability";
import {
  DECORATION_STRESS_CHECKPOINTS,
  REFERENCE_CASES,
  SCENE_THEME_CASES,
  SCENE_THEME_CHECKPOINTS,
  SCENE_THEME_PROOF,
  checkpointFileName,
} from "../../proofs/scene-theme/source/matrix";
import {
  collectProofSourceEvidence,
  collectRemotionVersions,
  inspectDecorationRaster,
} from "../../scripts/proofs/scene-theme/evidence";
import { VISUAL_THEME_PRESETS } from "../../packages/studio/src/contracts/visual-theme";

test("theme proof exercises production safe-area geometry in both orientations and themes", () => {
  assert.deepEqual(
    SCENE_THEME_CASES.map(({ themeName, width, height }) => [
      themeName,
      width,
      height,
    ]),
    [
      ["dark", 1920, 1080],
      ["dark", 1080, 1920],
      ["light", 1920, 1080],
      ["light", 1080, 1920],
    ],
  );
  for (const scenario of SCENE_THEME_CASES) {
    const viewport = resolveSceneViewport(
      resolveSceneReadabilityPolicy(scenario),
    );
    assert.deepEqual(
      [viewport.width, viewport.height],
      scenario.orientation === "landscape" ? [1740, 630] : [900, 1470],
    );
  }
});

test("theme proof retains maximum Logo zoom, handoff, fade, and complete animation checkpoints", () => {
  for (const frame of [104, 119, 120, 122, 132, 146, 165, 180, 214, 220, 239]) {
    assert.ok(
      SCENE_THEME_CHECKPOINTS.some(
        (checkpoint) =>
          checkpoint.section === "outro" && checkpoint.sceneFrame === frame,
      ),
      `Missing outro frame ${frame}`,
    );
  }
  assert.equal(
    new Set(SCENE_THEME_CHECKPOINTS.map(checkpointFileName)).size,
    SCENE_THEME_CHECKPOINTS.length,
  );
  assert.ok(
    SCENE_THEME_CHECKPOINTS.every(
      ({ frame }) => frame >= 0 && frame < SCENE_THEME_PROOF.durationInFrames,
    ),
  );
  assert.equal(
    SCENE_THEME_PROOF.durationInFrames,
    SCENE_THEME_PROOF.introFrames +
      SCENE_THEME_PROOF.bodyFrames +
      SCENE_THEME_PROOF.outroFrames,
  );
  assert.deepEqual(
    Object.values(REFERENCE_CASES).map((references) => references.length),
    [0, 1, 6],
  );
  assert.ok(REFERENCE_CASES["one-long"][0].title.length > 30);
  assert.ok(REFERENCE_CASES["one-long"][0].url.length > 80);
});

test("theme proof retains opaque black, white, and high-z-index SVG pressure windows", () => {
  assert.deepEqual(
    DECORATION_STRESS_CHECKPOINTS.map(([frame]) => frame),
    [0, 19, 20, 39, 40, 59],
  );
  assert.ok(
    SCENE_THEME_CHECKPOINTS.some(
      (checkpoint) =>
        checkpoint.section === "intro" && checkpoint.sceneFrame === 59,
    ),
  );
  assert.ok(
    SCENE_THEME_CHECKPOINTS.some(
      (checkpoint) =>
        checkpoint.section === "outro" && checkpoint.sceneFrame === 0,
    ),
  );
});

test("decoration raster checks reject escaped opaque paint and recolored foreground", () => {
  const theme = VISUAL_THEME_PRESETS.dark;
  const width = 64;
  const height = 64;
  const rgb = (hex: string) =>
    [0, 2, 4].map((offset) =>
      Number.parseInt(hex.slice(offset + 1, offset + 3), 16),
    );
  for (const sceneFrame of [0, 20, 40]) {
    const pixels = new Uint8Array(width * height * 4);
    for (let index = 0; index < width * height; index += 1) {
      const paint =
        sceneFrame === 0 || (sceneFrame === 40 && index % width < width / 2)
          ? 255
          : 0;
      pixels.set(
        [
          ...rgb(theme.background).map((channel) =>
            Math.round(channel * 0.92 + paint * 0.08),
          ),
          255,
        ],
        index * 4,
      );
    }
    for (const [roleIndex, role] of (
      ["primaryText", "secondaryText", "accent"] as const
    ).entries()) {
      for (
        let index = 1000 + roleIndex * 200;
        index < 1200 + roleIndex * 200;
        index += 1
      ) {
        pixels.set([...rgb(theme[role]), 255], index * 4);
      }
    }
    assert.doesNotThrow(() =>
      inspectDecorationRaster(pixels, width, height, theme, sceneFrame),
    );
    const escaped = pixels.slice();
    escaped.set([255, 255, 255, 255], (10 * width + 10) * 4);
    assert.throws(
      () => inspectDecorationRaster(escaped, width, height, theme, sceneFrame),
      /escaped its 8%/u,
    );
    const obscured = pixels.slice();
    for (let index = 1000; index < 1600; index += 1)
      obscured.set([255, 255, 255, 255], index * 4);
    assert.throws(
      () => inspectDecorationRaster(obscured, width, height, theme, sceneFrame),
      /obscured or recolored/u,
    );
  }
});

test("proof source evidence includes actual production templates and viewport rather than copied fixtures", async () => {
  const evidence = await collectProofSourceEvidence(process.cwd());
  const paths = evidence.files.map(({ localPath }) => localPath);
  for (const path of [
    "packages/studio/src/remotion/capabilities/scene-templates/axmorf/AxmorfIntroScene.tsx",
    "packages/studio/src/remotion/capabilities/scene-templates/axmorf/AxmorfOutroScene.tsx",
    "packages/studio/src/remotion/capabilities/scene-templates/axmorf/BrandFollowScene.tsx",
    "packages/studio/src/remotion/capabilities/scene-templates/axmorf/SourceCreditsScene.tsx",
    "packages/studio/src/remotion/runtime/readability/SceneViewport.tsx",
    "packages/studio/src/remotion/runtime/global-visual/ThemedGlobalVisualBackground.tsx",
    "packages/studio/src/contracts/visual-theme.ts",
  ])
    assert.ok(paths.includes(path), `Source evidence omitted ${path}`);
  assert.match(evidence.fingerprint, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(new Set(Object.values(await collectRemotionVersions())).size, 1);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import type { SceneRendererComponent } from "../../src/remotion/runtime/story-visual/types";
import { GPS_M7_MEANING_IDS } from "../../src/projects/gps-relativity/tools/verification/scene-inputs";
import {
  SceneSyncAnchorSetSchema,
  SceneTaskInputSchema,
  SceneVisualPlanSchema,
  ShotPlanSetSchema,
  StorySpecSchema,
  VisualStyleSpecSchema,
} from "../../src/contracts";

const rootDir = process.cwd();

const rendererLoaders = {
  "position-is-time": () =>
    import("../../src/projects/gps-relativity/scenes/position-is-time/Renderer"),
  "two-relativistic-effects": () =>
    import("../../src/projects/gps-relativity/scenes/two-relativistic-effects/Renderer"),
  "net-drift": () =>
    import("../../src/projects/gps-relativity/scenes/net-drift/Renderer"),
  "error-accumulation": () =>
    import("../../src/projects/gps-relativity/scenes/error-accumulation/Renderer"),
  "practical-conclusion": () =>
    import("../../src/projects/gps-relativity/scenes/practical-conclusion/Renderer"),
} as const;

const readJson = async (path: string): Promise<unknown> =>
  JSON.parse(await readFile(join(rootDir, path), "utf8"));

test("all formal Renderers are visual-only frame-driven and change perceptibly across probes", async () => {
  const [story, visualStyle] = await Promise.all([
    readJson("src/projects/gps-relativity/story.json").then(
      StorySpecSchema.parse,
    ),
    readJson("src/projects/gps-relativity/visual-style.json").then(
      VisualStyleSpecSchema.parse,
    ),
  ]);
  for (const meaningId of GPS_M7_MEANING_IDS) {
    const root = `src/projects/gps-relativity/scenes/${meaningId}`;
    const [task, visualPlan, shots, syncAnchors, rendererModule] =
      await Promise.all([
        readJson(`${root}/task-input.generated.json`).then(
          SceneTaskInputSchema.parse,
        ),
        readJson(`${root}/visual-plan.json`).then(SceneVisualPlanSchema.parse),
        readJson(`${root}/shot-plan.json`).then(ShotPlanSetSchema.parse),
        readJson(`${root}/sync-anchors.json`).then(
          SceneSyncAnchorSetSchema.parse,
        ),
        rendererLoaders[meaningId](),
      ]);
    const Renderer = rendererModule.default as SceneRendererComponent;
    const duration = task.timingBeat.endFrame - task.timingBeat.startFrame;
    const storyBeat = story.beats.find((beat) => beat.meaningId === meaningId);
    assert.ok(storyBeat);
    const baseProps = {
      storyId: "gps-relativity",
      meaningId,
      durationInFrames: duration,
      fps: 30,
      width: 1920,
      height: 1080,
      storyBeat,
      timingBeat: task.timingBeat,
      visualStyle,
      visualPlan,
      shots,
      syncAnchors,
      visualResources: [],
    } as const;
    const early = renderToStaticMarkup(
      <Renderer {...baseProps} sceneFrame={Math.floor(duration * 0.2)} />,
    );
    const late = renderToStaticMarkup(
      <Renderer {...baseProps} sceneFrame={Math.floor(duration * 0.72)} />,
    );
    assert.notEqual(
      early,
      late,
      `${meaningId} must visibly depend on sceneFrame`,
    );
    assert.doesNotMatch(early + late, /<audio|caption|subtitle/iu);
  }
});

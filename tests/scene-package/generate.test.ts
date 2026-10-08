import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  aggregateSceneStoryBeat,
  aggregateSceneTimingBeat,
  buildNotApplicableFidelityReceipt,
  buildSceneSoundPlan,
  buildSceneSyncAnchors,
  buildSceneTaskInputV8,
  buildSceneVisualPlan,
  buildSilentScenePreset,
  buildShotPlanSet,
  buildShotRecipeSelection,
  generateSemanticTiming,
  generateAuthoredFrameTiming,
  NarrationSpecSchema,
  RenderSpecSchema,
  serializeCanonicalJson,
  StorySpecSchema,
} from "@axmorf/studio/contracts";
import {
  generateSceneCoverageFromProjectFiles,
  generateScenePackage,
  generateScenePackageFromProjectFiles,
} from "../../scripts/scene-package/generate";
import { generateRendererRegistryFromProjectFiles } from "../../scripts/renderer-registry/generate";
import { createScenePackageInput } from "../fixtures/scene/package-input";
import {
  buildValidSealedNarrationManifest,
  validNarrationSpec,
  validRenderSpec,
  validStorySpec,
} from "../fixtures/narrative";

test("file-backed package generation fingerprints the complete Renderer source graph", async () => {
  const source = await readFile(
    fileURLToPath(
      new URL("../../scripts/scene-package/generate.ts", import.meta.url),
    ),
    "utf8",
  );
  assert.match(source, /collectRendererSourceGraph/u);
  assert.doesNotMatch(
    source,
    /readFile\(join\(sceneRoot, "Renderer\.tsx"\)\)/u,
  );
});

for (const authored of [false, true]) {
  test(`file-backed ${authored ? "authored-frame" : "narrated"} multi-Beat Scene uses one owner directory and current aggregated timing`, async (context) => {
    const rootDir = await mkdtemp(join(tmpdir(), "multi-beat-scene-package-"));
    context.after(() => rm(rootDir, { recursive: true, force: true }));
    const story = StorySpecSchema.parse({
      ...validStorySpec,
      ...(authored
        ? {
            timingSource: "authored-frames",
            beats: validStorySpec.beats.map((beat, index) => ({
              kind: "silent-scene",
              meaningId: beat.meaningId,
              narrativePurpose: beat.narrativePurpose,
              preset: buildSilentScenePreset({
                presetId: `${beat.meaningId}-visual`,
                durationInFrames: index === 0 ? 60 : 90,
                visualIntent: "Continue the same visual subject.",
                soundIntent: "Use independent sound contributions.",
                resourceIds: ["asset.proof-shape"],
                implementation: { kind: "scene-owner" },
              }),
            })),
          }
        : {}),
      visualScenes: [{ meaningIds: ["opening", "conclusion"] }],
    });
    const timing = authored
      ? generateAuthoredFrameTiming({
          story,
          render: RenderSpecSchema.parse(validRenderSpec),
        })
      : generateSemanticTiming({
          story,
          narration: NarrationSpecSchema.parse(validNarrationSpec),
          render: RenderSpecSchema.parse(validRenderSpec),
          sealedNarration: buildValidSealedNarrationManifest(),
        });
    const input = createScenePackageInput();
    const timingBeat = aggregateSceneTimingBeat(
      timing.storyBeats,
      ["opening", "conclusion"],
      aggregateSceneStoryBeat(story.beats),
    );
    const task = buildSceneTaskInputV8({
      ...input.task,
      storyId: story.storyId,
      meaningId: "opening",
      storyBeat: aggregateSceneStoryBeat(story.beats),
      timingBeat,
      ...(authored ? { allowedResourceIds: ["asset.proof-shape"] } : {}),
      coveredBeats: story.beats.map((storyBeat, index) => ({
        storyBeat,
        timingBeat: timing.storyBeats[index],
      })),
      allowedDirectories: {
        sceneRoot: "src/projects/story-example/scenes/opening",
        publicAssetRoot: "public/assets/library/story-example/opening",
      },
    });
    const duration = timingBeat.endFrame - timingBeat.startFrame;
    const secondCue = timing.captionCues.find(
      ({ meaningId }) => meaningId === "conclusion",
    )!;
    const syncFrame = authored
      ? timing.storyBeats[1].startFrame - timingBeat.startFrame
      : secondCue.startFrame - timingBeat.startFrame;
    const anchors = buildSceneSyncAnchors({
      ...input.anchors,
      meaningId: task.meaningId,
      taskInputFingerprint: task.taskInputFingerprint,
      sceneDurationInFrames: duration,
      anchors: [
        {
          eventId: "outline-closes",
          sceneLocalFrame: syncFrame,
          purpose: "The second Beat explains the result.",
        },
      ],
    });
    const shots = buildShotPlanSet({
      ...input.shots,
      meaningId: task.meaningId,
      taskInputFingerprint: task.taskInputFingerprint,
      sceneDurationInFrames: duration,
      shots: input.shots.shots.map((shot) => ({
        ...shot,
        primaryRange: { startFrame: 0, endFrame: duration },
      })),
      motionPlan: {
        schemaVersion: 2,
        objects: [{ objectId: "shape", meaning: "A continuous subject." }],
        actions: [
          {
            actionId: "change",
            shotId: "trace-shot",
            kind: "transform",
            explanatoryPurpose: "Explain both Beats with one evolving subject.",
            initialState: "Input",
            resultingState: "Result",
            objectIds: ["shape"],
            frameRange: { startFrame: 0, endFrame: duration },
            syncAnchorId: "outline-closes",
            readingHoldFrames: 0,
          },
        ],
        handoff: {
          kind: "end",
          reason: "The film ends.",
          incoming: [],
          outgoing: [],
        },
      },
    });
    const visual = buildSceneVisualPlan({
      ...input.visual,
      meaningId: task.meaningId,
      taskInputFingerprint: task.taskInputFingerprint,
    });
    const sound = buildSceneSoundPlan({
      ...input.sound,
      meaningId: task.meaningId,
      taskInputFingerprint: task.taskInputFingerprint,
      sceneDurationInFrames: duration,
    });
    const selection = buildShotRecipeSelection({
      taskInputFingerprint: task.taskInputFingerprint,
      selections: [],
    });
    const fidelity = buildNotApplicableFidelityReceipt({
      selectionFingerprint: selection.selectionFingerprint,
      reason: "empty",
    });
    const projectRoot = join(rootDir, "src/projects/story-example");
    const sceneRoot = join(projectRoot, "scenes/opening");
    await mkdir(join(sceneRoot, "generated"), { recursive: true });
    await mkdir(join(projectRoot, "generated"), { recursive: true });
    await writeFile(
      join(sceneRoot, "Renderer.tsx"),
      "export default () => <div />;\n",
    );
    const files = [
      [join(projectRoot, "story.json"), story],
      [join(projectRoot, "generated/semantic-timing.generated.json"), timing],
      [join(sceneRoot, "task-input.generated.json"), task],
      [join(sceneRoot, "visual-plan.json"), visual],
      [join(sceneRoot, "shot-plan.json"), shots],
      [join(sceneRoot, "sync-anchors.json"), anchors],
      [join(sceneRoot, "sound-plan.json"), sound],
      [join(sceneRoot, "shot-recipe-selection.json"), selection],
      [
        join(sceneRoot, "generated/reference-fidelity.generated.json"),
        fidelity,
      ],
      [
        join(sceneRoot, "selected-resources.json"),
        { schemaVersion: 1, selectedResources: input.selectedResources },
      ],
    ] as const;
    for (const [path, value] of files)
      await writeFile(path, `${serializeCanonicalJson(value)}\n`);
    const scenePackage = await generateScenePackageFromProjectFiles({
      rootDir,
      projectId: story.storyId,
      meaningId: task.meaningId,
      mode: "write",
    });
    assert.equal(scenePackage.schemaVersion, 7);
    assert.deepEqual(scenePackage.coveredMeaningIds, ["opening", "conclusion"]);
    assert.deepEqual(scenePackage.beatFrameRange, {
      startFrame: timingBeat.startFrame,
      endFrame: timingBeat.endFrame,
    });
    const coverage = await generateSceneCoverageFromProjectFiles({
      rootDir,
      projectId: story.storyId,
      mode: "write",
    });
    assert.deepEqual(
      coverage.entries.map(({ status }) => status),
      ["ready", "ready"],
    );
    const registry = await generateRendererRegistryFromProjectFiles({
      rootDir,
      projectId: story.storyId,
      mode: "write",
    });
    assert.equal(registry?.entries.length, 1);
    if (!authored) {
      const staleTask = buildSceneTaskInputV8({
        ...task,
        coveredBeats: task.coveredBeats!.map((member, index) => ({
          ...member,
          timingBeat: {
            ...member.timingBeat,
            ...(index === 0
              ? { endFrame: member.timingBeat.endFrame + 1 }
              : { startFrame: member.timingBeat.startFrame + 1 }),
          },
        })),
      });
      await writeFile(
        join(sceneRoot, "task-input.generated.json"),
        serializeCanonicalJson(staleTask),
      );
      await assert.rejects(
        generateScenePackageFromProjectFiles({
          rootDir,
          projectId: story.storyId,
          meaningId: task.meaningId,
          mode: "check",
        }),
        /Scene package SemanticTiming authority is cross-bound/u,
      );
    }
  });
}

test("ScenePackage write is pass-only atomic byte-stable and check is read-only", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-package-"));
  const destination = join(rootDir, "scene-package.generated.json");
  try {
    const input = createScenePackageInput();
    await generateScenePackage({ mode: "write", destination, input });
    const before = await readFile(destination, "utf8");
    const beforeMtime = (await stat(destination)).mtimeMs;
    await generateScenePackage({ mode: "write", destination, input });
    assert.equal((await stat(destination)).mtimeMs, beforeMtime);
    await generateScenePackage({ mode: "check", destination, input });
    await writeFile(destination, `${before} `, "utf8");
    await assert.rejects(() =>
      generateScenePackage({ mode: "check", destination, input }),
    );
    assert.equal(await readFile(destination, "utf8"), `${before} `);
    await writeFile(destination, before, "utf8");
    await assert.rejects(() =>
      generateScenePackage({
        mode: "write",
        destination,
        input: {
          ...input,
          current: { ...input.current, semanticTimingFingerprint: "invalid" },
        },
      }),
    );
    assert.equal(await readFile(destination, "utf8"), before);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("failed write keeps the last pass receipt bytes and mtime", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-package-fail-"));
  const destination = join(rootDir, "scene-package.generated.json");
  try {
    const input = createScenePackageInput();
    await generateScenePackage({ mode: "write", destination, input });
    const before = await readFile(destination, "utf8");
    const beforeMtime = (await stat(destination)).mtimeMs;
    await assert.rejects(() =>
      generateScenePackage({
        mode: "write",
        destination,
        input: {
          ...input,
          current: { ...input.current, visualRuntimeVersion: "stale" },
        },
      }),
    );
    assert.equal(await readFile(destination, "utf8"), before);
    assert.equal((await stat(destination)).mtimeMs, beforeMtime);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

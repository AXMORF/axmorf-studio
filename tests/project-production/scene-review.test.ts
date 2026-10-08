import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  NarrationSpecSchema,
  buildShotPlanSet,
  buildSceneSyncAnchors,
  aggregateSceneStoryBeat,
  aggregateSceneTimingBeat,
  RenderSpecSchema,
  StorySpecSchema,
  generateSemanticTiming,
  serializeCanonicalJson,
  type DeliveryPublish,
} from "@axmorf/studio/contracts";
import {
  parseSceneReviewArguments,
  isSceneReviewScriptEntrypoint,
} from "../../scripts/scene-review/cli";
import { generateSceneReview } from "../../scripts/scene-review/generate";
import { planSceneReview } from "../../scripts/scene-review/plan";
import {
  buildValidSealedNarrationManifest,
  validNarrationSpec,
  validRenderSpec,
  validStorySpec,
} from "../fixtures/narrative";

import { createAuthoredGroupedRuntimeFixture } from "../fixtures/scene/authored-grouped";

const timing = generateSemanticTiming({
  story: StorySpecSchema.parse(validStorySpec),
  narration: NarrationSpecSchema.parse(validNarrationSpec),
  render: RenderSpecSchema.parse(validRenderSpec),
  sealedNarration: buildValidSealedNarrationManifest(),
});
const delivery = {
  storyId: timing.storyId,
  fps: timing.fps,
  frameCount: timing.durationInFrames,
  publishing: {
    chapters: timing.storyBeats
      .filter((beat) => beat.kind === "narrated-scene")
      .map(({ meaningId, startFrame }) => ({ meaningId, startFrame })),
  },
};

test("Scene review samples the opening, middle, and final frame of each exact Beat", () => {
  const plan = planSceneReview(timing, delivery);
  assert.equal(plan.scenes.length, timing.storyBeats.length);
  for (const [index, beat] of timing.storyBeats.entries()) {
    const samples = plan.scenes[index]?.samples;
    assert.equal(samples?.opening.frame, beat.startFrame);
    assert.equal(samples?.result.frame, beat.endFrame - 1);
    assert.ok(samples?.change.frame !== undefined);
    assert.ok(samples.change.frame >= beat.startFrame);
    assert.ok(samples.change.frame < beat.endFrame);
    assert.match(samples.opening.image, /^frame-\d{4}\.png$/u);
  }
  assert.deepEqual(
    plan.frames,
    [...new Set(plan.frames)].sort((a, b) => a - b),
  );
});

test("Scene review rejects a delivery with stale chapter timing", () => {
  assert.throws(() =>
    planSceneReview(timing, {
      ...delivery,
      publishing: {
        chapters: delivery.publishing.chapters.map((chapter, index) =>
          index === 0
            ? { ...chapter, startFrame: chapter.startFrame + 1 }
            : chapter,
        ),
      },
    }),
  );
  assert.throws(() => planSceneReview(timing, { ...delivery, frameCount: 1 }));
});

test("Scene review accepts authored content chapters and still rejects stale starts", () => {
  const { semanticTiming: authored } = createAuthoredGroupedRuntimeFixture();
  const published = {
    storyId: authored.storyId,
    fps: authored.fps,
    frameCount: authored.durationInFrames,
    publishing: {
      chapters: authored.storyBeats.map(({ meaningId, startFrame }) => ({
        meaningId,
        startFrame,
      })),
    },
  };
  assert.equal(planSceneReview(authored, published).scenes.length, 2);
  assert.equal(
    planSceneReview(authored, { ...published, publishing: { chapters: [] } })
      .scenes.length,
    2,
  );
  assert.throws(
    () =>
      planSceneReview(authored, {
        ...published,
        publishing: {
          chapters: published.publishing.chapters.map((chapter, index) =>
            index === 1
              ? { ...chapter, startFrame: chapter.startFrame + 1 }
              : chapter,
          ),
        },
      }),
    /stale/u,
  );
});

test("Scene review CLI requires an exact Project argument", () => {
  assert.equal(
    parseSceneReviewArguments(["--project", "story-example"]).projectId,
    "story-example",
  );
  assert.throws(() => parseSceneReviewArguments([]));
  assert.throws(() => parseSceneReviewArguments(["--project", "../escape"]));
});

test("Scene review writes a separate contact sheet from a verified delivery", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "axmorf-scene-review-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const timingRoot = join(rootDir, "src/projects/story-example/generated");
  await mkdir(timingRoot, { recursive: true });
  await writeFile(
    join(timingRoot, "semantic-timing.generated.json"),
    `${serializeCanonicalJson(timing)}\n`,
  );
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==",
    "base64",
  );
  const extracted: string[] = [];
  const result = await generateSceneReview({
    rootDir,
    projectId: "story-example",
    inspectDelivery: async () =>
      ({
        ...delivery,
        deliveryBuildId: `delivery-${"a".repeat(64)}`,
      }) as unknown as DeliveryPublish,
    resolveTool: async ({ args }) => ({ command: "remotion", args }),
    runProcess: async (_command, args) => {
      const output = args.at(-1);
      assert.ok(output !== undefined);
      extracted.push(output);
      await writeFile(output, png);
      return { status: 0, stdout: "", stderr: "" };
    },
  });
  assert.equal(result.status, "scene-review-ready");
  assert.equal(result.sceneCount, timing.storyBeats.length);
  assert.equal(
    extracted.length,
    planSceneReview(timing, delivery).frames.length,
  );
  const html = await readFile(join(result.outputDir, "index.html"), "utf8");
  assert.match(html, /opening \(narrated-scene\)/u);
  assert.match(html, /conclusion \(narrated-scene\)/u);
  const manifest = JSON.parse(
    await readFile(join(result.outputDir, "review.json"), "utf8"),
  ) as { scenes: unknown[] };
  assert.equal(manifest.scenes.length, timing.storyBeats.length);
});

for (const grouped of [false, true]) {
  test(`Motion review exports audio-preserving ${grouped ? "multi-Beat owner" : "single-Beat Scene"} clips without claiming approval`, async (context) => {
    const rootDir = await mkdtemp(join(tmpdir(), "axmorf-motion-review-"));
    context.after(() => rm(rootDir, { recursive: true, force: true }));
    const timingRoot = join(rootDir, "src/projects/story-example/generated");
    await mkdir(timingRoot, { recursive: true });
    await writeFile(
      join(timingRoot, "semantic-timing.generated.json"),
      serializeCanonicalJson(timing),
    );
    const story = StorySpecSchema.parse({
      ...validStorySpec,
      ...(grouped
        ? { visualScenes: [{ meaningIds: ["opening", "conclusion"] }] }
        : {}),
    });
    await writeFile(
      join(timingRoot, "../story.json"),
      serializeCanonicalJson(story),
    );
    const beat = grouped
      ? aggregateSceneTimingBeat(
          timing.storyBeats,
          ["opening", "conclusion"],
          aggregateSceneStoryBeat(story.beats),
        )
      : timing.storyBeats[0];
    const duration = beat.endFrame - beat.startFrame;
    const syncFrame = grouped
      ? timing.captionCues.find((cue) => cue.meaningId === "conclusion")!
          .startFrame - beat.startFrame
      : 0;
    const sceneRoot = join(
      rootDir,
      "src/projects/story-example/scenes",
      beat.meaningId,
    );
    await mkdir(sceneRoot, { recursive: true });
    const fingerprint = `sha256:${"1".repeat(64)}`;
    const pose = (value: number) => ({
      x: 0.5,
      y: 0.5,
      scale: 1,
      rotation: 0,
      opacity: 1,
      reveal: 1,
      value,
    });
    await writeFile(
      join(sceneRoot, "shot-plan.json"),
      serializeCanonicalJson(
        buildShotPlanSet({
          taskInputFingerprint: fingerprint,
          meaningId: beat.meaningId,
          sceneDurationInFrames: duration,
          shots: [
            {
              shotId: "cause-shot",
              order: 0,
              primaryRange: { startFrame: 0, endFrame: duration },
              purpose: "Show a quantity",
              action: "Increase the quantity",
              visualResourceIds: [],
              syncAnchorIds: ["cause-start"],
            },
          ],
          motionPlan: {
            schemaVersion: 1,
            objects: [
              {
                objectId: "quantity",
                meaning: "Illustrative measured quantity",
                keyframes: [
                  { frame: 0, state: pose(0), easing: "linear" },
                  { frame: duration - 1, state: pose(1), easing: "linear" },
                ],
              },
            ],
            actions: [
              {
                actionId: "show-increase",
                shotId: "cause-shot",
                kind: "compare",
                explanatoryPurpose: "Show the cause <script>",
                initialState: "Zero",
                resultingState: "One",
                objectIds: ["quantity"],
                frameRange: { startFrame: 0, endFrame: duration },
                syncAnchorId: "cause-start",
                readingHoldFrames: 0,
              },
            ],
            handoff: {
              kind: "end",
              reason: "Conclude comparison",
              incoming: [],
              outgoing: [],
            },
          },
        }),
      ),
    );
    await writeFile(
      join(sceneRoot, "sync-anchors.json"),
      serializeCanonicalJson(
        buildSceneSyncAnchors({
          taskInputFingerprint: fingerprint,
          meaningId: beat.meaningId,
          sceneDurationInFrames: duration,
          anchors: [
            {
              eventId: "cause-start",
              sceneLocalFrame: syncFrame,
              purpose: "Narration starts",
            },
          ],
        }),
      ),
    );
    const png = Buffer.from("89504e470d0a1a0a", "hex");
    const mp4 = Buffer.from("000000186674797069736f6d00000200", "hex");
    const captured: string[][] = [];
    const result = await generateSceneReview({
      rootDir,
      projectId: "story-example",
      motion: true,
      inspectDelivery: async () =>
        ({
          ...delivery,
          deliveryBuildId: `delivery-${"a".repeat(64)}`,
        }) as unknown as DeliveryPublish,
      resolveTool: async ({ args }) => ({ command: "ffmpeg", args }),
      runProcess: async (_command, args) => {
        const output = args.at(-1);
        assert.ok(output);
        if (output.endsWith(".mp4")) {
          captured.push([...args]);
          assert.ok(args.includes("0:a:0?"));
          assert.ok(Number(args[args.indexOf("-t") + 1]) > 0);
        }
        await writeFile(output, output.endsWith(".mp4") ? mp4 : png);
        return { status: 0, stdout: "", stderr: "" };
      },
    });
    assert.equal(captured.length, (grouped ? 1 : timing.storyBeats.length) * 2);
    assert.equal(result.actionCount, 1);
    assert.match(captured.at(-1)?.at(-1) ?? "", /motion-action-/u);
    const html = await readFile(join(result.outputDir, "index.html"), "utf8");
    assert.match(html, /<video controls/u);
    assert.match(html, /does not approve motion/u);
    assert.match(html, /cause &lt;script&gt;/u);
    assert.match(html, /not delivery-attested/u);
    const feedback = JSON.parse(
      await readFile(join(result.outputDir, "revision-feedback.json"), "utf8"),
    );
    assert.equal(feedback.assessment, "not-assessed");
    assert.deepEqual(feedback.targets[0].meaningIds, [beat.meaningId]);
    const manifest = JSON.parse(
      await readFile(join(result.outputDir, "review.json"), "utf8"),
    ) as {
      scenes: unknown[];
      motion: {
        approval: string;
        clips: { kind: string; startFrame: number; endFrame: number }[];
      };
    };
    assert.equal(manifest.motion.approval, "not-assessed");
    assert.equal(manifest.motion.clips.length, captured.length);
    assert.equal(manifest.scenes.length, timing.storyBeats.length);
    if (grouped) {
      assert.equal(
        manifest.motion.clips.filter(({ kind }) => kind === "boundary").length,
        0,
      );
      const sceneClip = manifest.motion.clips.find(
        ({ kind }) => kind === "scene",
      );
      assert.equal(sceneClip?.startFrame, timing.storyBeats[0].startFrame);
      assert.equal(sceneClip?.endFrame, timing.storyBeats.at(-1)!.endFrame);
    }
  });
}

test("Only the source review script auto-runs; bundled npm main is routed once", () => {
  assert.equal(
    isSceneReviewScriptEntrypoint(
      "file:///tmp/work/scripts/scene-review/cli.ts",
      "/tmp/work/scripts/scene-review/cli.ts",
    ),
    true,
  );
  assert.equal(
    isSceneReviewScriptEntrypoint(
      "file:///tmp/work/node_modules/@axmorf/studio/dist/cli/main.js",
      "/tmp/work/node_modules/@axmorf/studio/dist/cli/main.js",
    ),
    false,
  );
  assert.equal(
    isSceneReviewScriptEntrypoint(
      "file:///tmp/work/scripts/scene-review/cli.ts",
      "/tmp/work/other.ts",
    ),
    false,
  );
  assert.equal(
    isSceneReviewScriptEntrypoint(
      "file:///tmp/work/scripts/scene-review/cli.ts",
      undefined,
    ),
    false,
  );
});

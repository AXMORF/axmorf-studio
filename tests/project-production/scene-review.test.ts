import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  NarrationSpecSchema,
  RenderSpecSchema,
  StorySpecSchema,
  generateSemanticTiming,
  serializeCanonicalJson,
  type DeliveryPublish,
} from "@axmorf/studio/contracts";
import { parseSceneReviewArguments } from "../../scripts/scene-review/cli";
import { generateSceneReview } from "../../scripts/scene-review/generate";
import { planSceneReview } from "../../scripts/scene-review/plan";
import {
  buildValidSealedNarrationManifest,
  validNarrationSpec,
  validRenderSpec,
  validStorySpec,
} from "../fixtures/narrative";

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

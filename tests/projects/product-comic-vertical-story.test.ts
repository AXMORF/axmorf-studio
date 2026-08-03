import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import {
  NarrationSpecSchema,
  RenderSpecSchema,
  StorySpecSchema,
  VideoBriefSchema,
  validateStoryCheckReport,
} from "../../src/contracts";

const projectId = "product-comic-vertical";
const projectRoot = join(process.cwd(), "src/projects", projectId);
const meaningIds = [
  "problem-hook",
  "problem-friction",
  "product-reveal",
  "core-capabilities",
  "workflow-input",
  "workflow-create",
  "workflow-result",
  "differentiated-value",
  "proof-and-fit",
  "call-to-action",
] as const;

const readJson = async (path: string) =>
  JSON.parse(await readFile(join(projectRoot, path), "utf8")) as unknown;

test("product story is a ten-beat authored Chinese narrative with fixed CTA", async () => {
  const [brief, story, narration, render, report, claims] = await Promise.all([
    readJson("brief.json").then((value) => VideoBriefSchema.parse(value)),
    readJson("story.json").then((value) => StorySpecSchema.parse(value)),
    readJson("narration.json").then((value) => NarrationSpecSchema.parse(value)),
    readJson("render.json").then((value) => RenderSpecSchema.parse(value)),
    readJson("reviews/story-check.json"),
    readJson("sources/claims.json") as Promise<{
      storyBindings: readonly {
        meaningId: string;
        claimIds: readonly string[];
        chunkBindings: readonly { chunkId: string; claimIds: readonly string[] }[];
      }[];
    }>,
  ]);
  assert.equal(brief.storyId, projectId);
  assert.ok(brief.targetDurationSeconds >= 120 && brief.targetDurationSeconds <= 180);
  assert.deepEqual(story.beats.map(({ meaningId }) => meaningId), meaningIds);
  assert.equal(narration.voiceProfileId, "m9-project-my-voice");
  assert.equal(narration.mode, "voice-clone");
  assert.deepEqual(render, {
    schemaVersion: 1,
    compositionId: "ProductComicVertical",
    fps: 30,
    width: 1080,
    height: 1920,
    locale: "zh-CN",
    leadInFrames: 15,
    tailFrames: 15,
    captionSafeAreaPx: { top: 120, right: 72, bottom: 300, left: 72 },
    output: {
      container: "mp4",
      videoCodec: "h264",
      audioCodec: "aac",
      audioChannels: 2,
    },
  });

  const chunks = story.beats.flatMap(({ ttsChunks }) => ttsChunks);
  assert.ok(chunks.length >= 20);
  assert.ok(chunks.every(({ ttsText }) => ttsText.length >= 16 && ttsText.length <= 72));
  assert.ok(chunks.filter(({ ttsText }) => /。.+[。！？]$/.test(ttsText)).length >= 4);
  assert.equal(
    story.beats.at(-1)?.ttsChunks.at(-1)?.ttsText,
    "从一份主题资料开始，按这条可验证生产链完成第一支作品。",
  );
  const narrationText = chunks.map(({ ttsText }) => ttsText).join("");
  for (const forbidden of [
    "客户",
    "收入",
    "准确率",
    "市场份额",
    "官网",
    "Git remote",
    "Logo",
    "自动导演",
    "已经完成第二主题",
    "发布到",
  ]) {
    assert.ok(!narrationText.includes(forbidden), forbidden);
  }
  assert.doesNotMatch(narrationText, /更快|最强|领先|零成本|百分之\d+/);

  assert.equal(claims.storyBindings.length, meaningIds.length);
  for (const [index, binding] of claims.storyBindings.entries()) {
    const beat = story.beats[index];
    assert.equal(binding.meaningId, beat.meaningId);
    assert.ok(binding.claimIds.length > 0);
    assert.deepEqual(
      binding.chunkBindings.map(({ chunkId }) => chunkId),
      beat.ttsChunks.map(({ chunkId }) => chunkId),
    );
    assert.ok(binding.chunkBindings.every(({ claimIds }) => claimIds.length > 0));
  }
  assert.equal(
    validateStoryCheckReport({ story, narration, report }).decision,
    "proceed",
  );
});

test("project narration contains no mechanical punctuation splitter or emotion control policy", async () => {
  const [story, voice] = await Promise.all([
    readJson("story.json").then((value) => StorySpecSchema.parse(value)),
    readJson("sources/voice-profile.json") as Promise<Record<string, unknown>>,
  ]);
  const chunks = story.beats.flatMap(({ ttsChunks }) => ttsChunks);
  assert.ok(chunks.some(({ ttsText }) => /。.+。/.test(ttsText)));
  assert.ok(story.beats.some(({ explicitPauses }) => explicitPauses.length > 0));
  assert.deepEqual(voice.forbiddenProviderFields, [
    "emotion",
    "control",
    "controlInstruction",
  ]);
  assert.equal(JSON.stringify(voice).includes("excited"), false);
});

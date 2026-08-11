import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  PublishingIntentSchema,
  ProductionRequirementsFreezeSchema,
  RenderSpecSchema,
  NarrationSpecSchema,
  computePublishingCollectionCatalogFingerprint,
} from "../../src/contracts";
import { writeProducerConfig } from "../../scripts/config/producer-config";
import { runProjectConfigure } from "../../scripts/projects/configure";
import { validProducerConfigInput } from "../contracts/producer-config.test";
import { validStorySpec, validVideoBrief } from "../fixtures/narrative";

const writeJson = async (path: string, value: unknown) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const draft = {
  schemaVersion: 1,
  render: {
    compositionId: "StoryExample",
    leadInFrames: 15,
    tailFrames: 12,
    audioChannels: 2,
  },
  publishing: {
    description: "A publishing description.",
    topics: ["one", "two", "three", "four", "five", "six"],
    collectionId: "ai-workflow",
    chapters: validStorySpec.beats.map(({ meaningId }, index) => ({
      meaningId,
      name: index === 0 ? "开场" : "结论",
    })),
  },
  storyCheck: {
    decision: "proceed",
    checks: [
      "story-beat-order",
      "narrative-completeness",
      "authored-tts-chunks",
      "voice-profile-selection",
      "pronunciation-risks",
    ].map((checkId) => ({
      checkId,
      status: "pass",
      note: `Checked ${checkId}.`,
    })),
  },
  production: {
    enhancementSelection: {
      storyVisual: "required",
      sceneLocalSound: "allowed",
      globalSound: "none",
      globalVisual: "required",
    },
    resourcePolicy: {
      selfAuthoredVisualsAllowed: true,
      unlistedThirdPartyResources: "deny",
    },
    additionalRequirements: [],
  },
} as const;

test("ProducerConfig freezes every production-connected default into one new Project", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-project-configure-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const projectDir = join(rootDir, "src/projects/story-example");
  const configPath = join(rootDir, "operator/producer.config.json");
  const inputPath = join(projectDir, "producer-input.json");
  const configInput = {
    ...validProducerConfigInput,
    renderDefaults: { width: 1080, height: 1920, fps: 25, locale: "zh-CN" },
    readability: { edgeInsetPx: 120 },
    tts: {
      ...validProducerConfigInput.tts,
      defaultVoiceProfileId: "my-voice",
      speech: { rate: 1.15, targetLoudnessLufs: -18 },
    },
  } as const;
  await writeProducerConfig({ configPath, value: configInput });
  await writeJson(join(projectDir, "brief.json"), validVideoBrief);
  await writeJson(join(projectDir, "story.json"), validStorySpec);
  await writeJson(inputPath, draft);

  const result = await runProjectConfigure({
    rootDir,
    projectId: "story-example",
    inputPath,
    env: { RSP_PRODUCER_CONFIG: configPath },
  });

  const narration = NarrationSpecSchema.parse(
    JSON.parse(await readFile(join(projectDir, "narration.json"), "utf8")),
  );
  const render = RenderSpecSchema.parse(
    JSON.parse(await readFile(join(projectDir, "render.json"), "utf8")),
  );
  const publishing = PublishingIntentSchema.parse(
    JSON.parse(
      await readFile(join(projectDir, "publishing-intent.json"), "utf8"),
    ),
  );
  const requirements = ProductionRequirementsFreezeSchema.parse(
    JSON.parse(
      await readFile(join(projectDir, "production/requirements.json"), "utf8"),
    ),
  );

  assert.equal(narration.voiceProfileId, "my-voice");
  assert.deepEqual(
    {
      width: render.width,
      height: render.height,
      fps: render.fps,
      locale: render.locale,
    },
    configInput.renderDefaults,
  );
  assert.deepEqual(publishing.collection, {
    id: "ai-workflow",
    name: "AI 工作流",
    catalogFingerprint: computePublishingCollectionCatalogFingerprint(
      configInput.publishingCollections,
    ),
  });
  assert.equal(requirements.readabilityPolicy.baseEdgeInsetPx, 120);
  assert.equal(
    result.requirementsFingerprint,
    requirements.requirementsFingerprint,
  );
  assert.doesNotMatch(
    JSON.stringify({ narration, render, publishing, requirements, result }),
    /visible-editable-token|\/srv\/private|127\.0\.0\.1|default-bgm/iu,
  );

  assert.deepEqual(
    await runProjectConfigure({
      rootDir,
      projectId: "story-example",
      inputPath,
      env: { RSP_PRODUCER_CONFIG: configPath },
    }),
    result,
  );

  const before = await Promise.all(
    [
      "narration.json",
      "render.json",
      "publishing-intent.json",
      "production/requirements.json",
    ].map((path) => readFile(join(projectDir, path))),
  );
  await writeProducerConfig({
    configPath,
    value: {
      ...configInput,
      renderDefaults: { ...configInput.renderDefaults, fps: 30 },
      readability: { edgeInsetPx: 150 },
    },
  });
  await assert.rejects(
    () =>
      runProjectConfigure({
        rootDir,
        projectId: "story-example",
        inputPath,
        env: { RSP_PRODUCER_CONFIG: configPath },
      }),
    /immutable|conflict|already frozen/iu,
  );
  const after = await Promise.all(
    [
      "narration.json",
      "render.json",
      "publishing-intent.json",
      "production/requirements.json",
    ].map((path) => readFile(join(projectDir, path))),
  );
  assert.deepEqual(after, before);
});

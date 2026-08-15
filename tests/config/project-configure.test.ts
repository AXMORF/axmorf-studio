import assert from "node:assert/strict";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
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
import { SCENE_TEMPLATE_DEFINITIONS } from "../../src/remotion/capabilities/scene-templates/registry";
import { validProducerConfigInput } from "../contracts/producer-config.test";
import { validStorySpec, validVideoBrief } from "../fixtures/narrative";

const writeJson = async (path: string, value: unknown) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const repositoryRoot = join(import.meta.dirname, "../..");

const copyOptionalRepositoryFile = async (
  rootDir: string,
  relativePath: string,
) => {
  const destination = join(rootDir, relativePath);
  await mkdir(dirname(destination), { recursive: true });
  try {
    await copyFile(join(repositoryRoot, relativePath), destination);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
};

const copySceneTemplateInputs = async (rootDir: string) => {
  const paths = new Set(
    SCENE_TEMPLATE_DEFINITIONS.flatMap((definition) => [
      ...definition.sourceFiles.map(({ sourcePath }) => sourcePath),
      ...definition.assets.map(({ sourcePath }) => sourcePath),
    ]),
  );
  for (const relativePath of paths) {
    const destination = join(rootDir, relativePath);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(join(repositoryRoot, relativePath), destination);
  }
  for (const relativePath of [
    "private/reference-assets/scene-template-sound-overrides.json",
    "private/reference-assets/assets.manifest.json",
    "private/reference-assets/MIXKIT_AUDIO_LICENSE.md",
  ]) {
    await copyOptionalRepositoryFile(rootDir, relativePath);
  }
  try {
    const localManifest = JSON.parse(
      await readFile(
        join(repositoryRoot, "private/reference-assets/assets.manifest.json"),
        "utf8",
      ),
    ) as { readonly assets: readonly { readonly localPath: string }[] };
    for (const { localPath } of localManifest.assets) {
      await copyOptionalRepositoryFile(rootDir, localPath);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
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

const writeProjectConfigureInputs = async ({
  rootDir,
  configPath,
  configInput = validProducerConfigInput,
}: {
  readonly rootDir: string;
  readonly configPath: string;
  readonly configInput?: typeof validProducerConfigInput;
}) => {
  const projectDir = join(rootDir, "src/projects/story-example");
  const inputPath = join(projectDir, "producer-input.json");
  await copySceneTemplateInputs(rootDir);
  await writeProducerConfig({ configPath, value: configInput });
  await writeJson(join(projectDir, "brief.json"), validVideoBrief);
  await writeJson(join(projectDir, "story.json"), validStorySpec);
  await writeJson(inputPath, draft);
  return { projectDir, inputPath };
};

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
  await copySceneTemplateInputs(rootDir);
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
  assert.deepEqual(result.copiedSceneMeaningIds, [
    "configured-intro-scene",
    "configured-outro-scene",
  ]);
  const copiedRenderer = await readFile(
    join(projectDir, "scenes/configured-intro-scene/Renderer.tsx"),
    "utf8",
  );
  assert.match(copiedRenderer, /from "\.\/AxmorfIntroScene"/u);
  assert.doesNotMatch(copiedRenderer, /remotion\/capabilities/u);
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

  const projectTemplateSourcePath = join(
    projectDir,
    "scenes/configured-intro-scene/AxmorfBrand.tsx",
  );
  const frozenProjectTemplateSource = await readFile(projectTemplateSourcePath);
  const sharedTemplateSourcePath = join(
    rootDir,
    "src/remotion/capabilities/scene-templates/axmorf/AxmorfBrand.tsx",
  );
  await writeFile(
    sharedTemplateSourcePath,
    `${await readFile(sharedTemplateSourcePath, "utf8")}\n`,
  );
  await writeProducerConfig({
    configPath,
    value: {
      ...configInput,
      sceneDefaults: {
        introSceneTemplateId: null,
        outroSceneTemplateId: "axmorf-brand-reveal-v1",
      },
    },
  });
  assert.deepEqual(
    await runProjectConfigure({
      rootDir,
      projectId: "story-example",
      inputPath,
      env: { RSP_PRODUCER_CONFIG: configPath },
    }),
    result,
  );
  assert.deepEqual(
    await readFile(projectTemplateSourcePath),
    frozenProjectTemplateSource,
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

test("Project configure detects downstream conflicts before copying Scene templates", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-project-conflict-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const configPath = join(rootDir, "operator/producer.config.json");
  const { projectDir, inputPath } = await writeProjectConfigureInputs({
    rootDir,
    configPath,
  });
  const originalStory = await readFile(join(projectDir, "story.json"));
  await writeJson(join(projectDir, "render.json"), { conflicting: true });

  await assert.rejects(
    () =>
      runProjectConfigure({
        rootDir,
        projectId: "story-example",
        inputPath,
        env: { RSP_PRODUCER_CONFIG: configPath },
      }),
    /conflict|already frozen/iu,
  );

  assert.deepEqual(
    await readFile(join(projectDir, "story.json")),
    originalStory,
  );
  await assert.rejects(
    readFile(join(projectDir, "scenes/configured-intro-scene/Renderer.tsx")),
    { code: "ENOENT" },
  );
  await assert.rejects(
    readFile(join(projectDir, "production/scene-template-instantiation.json")),
    { code: "ENOENT" },
  );
  await assert.rejects(readFile(join(projectDir, "assets.manifest.json")), {
    code: "ENOENT",
  });
});

test("Project configure rejects stale Scene template audio authority", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-project-audio-stale-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const configPath = join(rootDir, "operator/producer.config.json");
  const { inputPath } = await writeProjectConfigureInputs({
    rootDir,
    configPath,
  });
  const overridePath = join(
    rootDir,
    "private/reference-assets/scene-template-sound-overrides.json",
  );
  try {
    await rm(overridePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await writeJson(overridePath, {
      schemaVersion: 1,
      introResourceId: "asset.missing-intro",
      outroResourceId: "asset.missing-outro",
    });
  }

  await assert.rejects(
    () =>
      runProjectConfigure({
        rootDir,
        projectId: "story-example",
        inputPath,
        env: { RSP_PRODUCER_CONFIG: configPath },
      }),
    /Scene template audio (?:projection is stale|override is incompatible)/u,
  );
});

test("Project configure recovers an interrupted Scene template commit", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-project-reentry-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const configPath = join(rootDir, "operator/producer.config.json");
  const { projectDir, inputPath } = await writeProjectConfigureInputs({
    rootDir,
    configPath,
  });
  const input = {
    rootDir,
    projectId: "story-example",
    inputPath,
    env: { RSP_PRODUCER_CONFIG: configPath },
  } as const;
  const first = await runProjectConfigure(input);
  const rendererPath = join(
    projectDir,
    "scenes/configured-intro-scene/Renderer.tsx",
  );
  const instantiationPath = join(
    projectDir,
    "production/scene-template-instantiation.json",
  );
  await rm(rendererPath);
  await rm(instantiationPath);

  assert.deepEqual(await runProjectConfigure(input), first);
  assert.match(await readFile(rendererPath, "utf8"), /AxmorfIntroScene/u);
  assert.equal(
    JSON.parse(await readFile(instantiationPath, "utf8")).storyId,
    "story-example",
  );
});

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import {
  AuthoringRequirementsSchema,
  ProjectCreateInputSchema,
  ProjectSoundPlanSchema,
  SemanticTimingSchema,
  StorySpecSchema,
  computeNoNarrationFingerprint,
} from "@axmorf/studio/contracts";
import { writeProducerConfig } from "../../scripts/config/producer-config";
import { createProject } from "../../scripts/projects/application/create-project";
import {
  prepareProjectCreateFixture,
  validProjectCreateInput,
  validProjectCreateProducerConfig,
  writeProjectCreateJson,
} from "../fixtures/project-create";

const visualInput = ProjectCreateInputSchema.parse({
  ...validProjectCreateInput,
  story: {
    ...validProjectCreateInput.story,
    beats: [
      {
        kind: "visual-scene",
        meaningId: "opening",
        narrativePurpose: "Show the measured samples becoming a timeline.",
        durationInFrames: 120,
      },
      {
        kind: "visual-scene",
        meaningId: "result",
        narrativePurpose: "Hold the resulting frame boundaries for reading.",
        durationInFrames: 180,
      },
    ],
  },
  render: {
    ...validProjectCreateInput.render,
    leadInFrames: 0,
    tailFrames: 0,
  },
  scenes: [
    {
      ...validProjectCreateInput.scenes[0],
      soundIntent: "Use approved local sound only when it serves the action.",
    },
    {
      ...validProjectCreateInput.scenes[0],
      meaningId: "result",
      visualIntent: "Show the sample-derived boundaries at a stable scale.",
      motionIntent: "Let the boundaries settle into their resulting state.",
      soundIntent: "Use approved local sound only when it serves the action.",
    },
  ],
  publishing: {
    ...validProjectCreateInput.publishing,
    chapters: [
      { meaningId: "opening", name: "采样" },
      { meaningId: "result", name: "帧边界" },
    ],
  },
});

test("visual create freezes authored timing and null narration independently of voice settings", async (context) => {
  const fixture = await prepareProjectCreateFixture();
  context.after(() => rm(fixture.rootDir, { recursive: true, force: true }));
  await writeProjectCreateJson(fixture.inputPath, visualInput);
  const args = {
    rootDir: fixture.rootDir,
    projectId: visualInput.storyId,
    inputPath: fixture.inputPath,
    env: { RSP_PRODUCER_CONFIG: fixture.configPath },
    runtimeResources: fixture.runtimeResources,
  };
  const created = await createProject(args);
  assert.equal(created.status, "project-created");
  assert.equal(created.nextAction, "prepare-production");
  const projectRoot = join(
    fixture.rootDir,
    "src/projects",
    visualInput.storyId,
  );
  const nullBytes = await readFile(join(projectRoot, "narration.json"), "utf8");
  assert.equal(JSON.parse(nullBytes), null);
  for (const name of ["sealed-narration", "mastered-narration"]) {
    assert.equal(
      JSON.parse(
        await readFile(
          join(projectRoot, `generated/${name}.generated.json`),
          "utf8",
        ),
      ),
      null,
    );
  }
  const timingPath = join(
    projectRoot,
    "generated/semantic-timing.generated.json",
  );
  const timing = SemanticTimingSchema.parse(
    JSON.parse(await readFile(timingPath, "utf8")),
  );
  assert.equal(timing.algorithmId, "authored-frames-v1");
  assert.equal(timing.durationInFrames, 300);
  assert.equal(timing.sampleRate, null);
  assert.equal(timing.narrationStartFrame, null);
  assert.deepEqual(timing.captionCues, []);
  assert.deepEqual(timing.segments, []);
  assert.deepEqual(
    timing.storyBeats.map(({ startFrame, endFrame }) => [startFrame, endFrame]),
    [
      [0, 120],
      [120, 300],
    ],
  );
  const requirements = AuthoringRequirementsSchema.parse(
    JSON.parse(
      await readFile(join(projectRoot, "production/requirements.json"), "utf8"),
    ),
  );
  assert.equal(requirements.normalizedSummary.voiceProfileId, null);
  assert.equal(requirements.readabilityPolicy.captionMode, "none");
  assert.equal(
    requirements.sourceBindings.narrationSpec.fingerprint,
    computeNoNarrationFingerprint(),
  );
  assert.equal(
    requirements.sourceBindings.narrationSpec.checksum,
    `sha256:${createHash("sha256").update(nullBytes).digest("hex")}`,
  );
  for (const path of [
    `.narration-work/${visualInput.storyId}`,
    `.producer-attempts/${visualInput.storyId}`,
    `public/projects/${visualInput.storyId}/narration`,
    `public/projects/${visualInput.storyId}/narration-mastered`,
  ]) {
    await assert.rejects(stat(join(fixture.rootDir, path)), { code: "ENOENT" });
  }
  const before = await stat(timingPath);
  const alternateVoice = {
    ...validProjectCreateProducerConfig,
    tts: {
      ...validProjectCreateProducerConfig.tts,
      defaultProviderId: "unavailable-voxcpm",
      defaultVoiceProfileId: "another-voice",
      providers: validProjectCreateProducerConfig.tts.providers.map(
        (provider) => ({
          ...provider,
          id: "unavailable-voxcpm",
          modelId: "provider-never-called",
          connection: {
            ...provider.connection,
            baseUrl: "http://127.0.0.1:9988",
          },
          voiceProfiles: provider.voiceProfiles.map((voice) => ({
            ...voice,
            id: "another-voice",
          })),
        }),
      ),
    },
  };
  await writeProducerConfig({
    configPath: fixture.configPath,
    value: alternateVoice,
  });
  const current = await createProject(args);
  assert.equal(current.status, "project-create-current");
  assert.equal(current.creationIdentity, created.creationIdentity);
  assert.equal((await stat(timingPath)).mtimeMs, before.mtimeMs);
});

test("visual create preserves configured boundary inheritance and explicit render overrides", async (context) => {
  const fixture = await prepareProjectCreateFixture();
  context.after(() => rm(fixture.rootDir, { recursive: true, force: true }));
  await mkdir(join(fixture.rootDir, "public/audio"), { recursive: true });
  const bgmBytes = Buffer.from(
    "synthetic local music used only for authoring checks",
  );
  await writeFile(
    join(fixture.rootDir, "public/audio/visual-bgm.mp3"),
    bgmBytes,
  );
  await writeProducerConfig({
    configPath: fixture.configPath,
    value: {
      ...validProjectCreateProducerConfig,
      sceneDefaults: {
        introSceneTemplateId: "axmorf-brand-reveal-v1",
        outroSceneTemplateId: "axmorf-source-follow-v1",
      },
      audioDefaults: {
        globalBgm: { sourcePath: "public/audio/visual-bgm.mp3", volume: 0.2 },
      },
    },
  });
  await writeProjectCreateJson(fixture.inputPath, {
    ...visualInput,
    sceneTemplates: undefined,
    render: { ...visualInput.render, width: 1920, height: 1080, fps: 24 },
  });
  const configBefore = await readFile(fixture.configPath);
  const created = await createProject({
    rootDir: fixture.rootDir,
    projectId: visualInput.storyId,
    inputPath: fixture.inputPath,
    env: { RSP_PRODUCER_CONFIG: fixture.configPath },
    runtimeResources: fixture.runtimeResources,
  });
  const projectRoot = join(
    fixture.rootDir,
    "src/projects",
    visualInput.storyId,
  );
  const story = StorySpecSchema.parse(
    JSON.parse(await readFile(join(projectRoot, "story.json"), "utf8")),
  );
  assert.deepEqual(
    story.beats.map(({ kind }) => kind),
    ["silent-scene", "visual-scene", "visual-scene", "silent-scene"],
  );
  const timing = SemanticTimingSchema.parse(
    JSON.parse(
      await readFile(
        join(projectRoot, "generated/semantic-timing.generated.json"),
        "utf8",
      ),
    ),
  );
  const boundaryFrames = story.beats.reduce(
    (frames, beat) =>
      frames +
      (beat.kind === "silent-scene" ? beat.preset.durationInFrames : 0),
    0,
  );
  assert.equal(timing.durationInFrames, 300 + boundaryFrames);
  assert.equal(timing.fps, 24);
  assert.equal(created.render.width, 1920);
  assert.equal(created.render.height, 1080);
  assert.equal(created.render.fps, 24);
  assert.equal(created.copiedSceneMeaningIds?.length, 2);
  const sound = ProjectSoundPlanSchema.parse(
    JSON.parse(await readFile(join(projectRoot, "sound.json"), "utf8")),
  );
  assert.equal(sound.contributions[0].playbackScope, "composition");
  assert.deepEqual(
    await readFile(
      join(
        fixture.rootDir,
        "public/projects",
        visualInput.storyId,
        "sound/background-music.mp3",
      ),
    ),
    bgmBytes,
  );
  assert.deepEqual(await readFile(fixture.configPath), configBefore);
});

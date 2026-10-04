import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  access,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  AuthoringRequirementsSchema,
  AuthoringValidationError,
  ProjectCreateInputSchema,
  ProjectRevisionInputSchema,
  ProjectRevisionMaterializationRecordSchema,
  RenderSpecSchema,
  ScenePriorSourceIndexSchema,
  SCENE_PRIOR_SOURCE_PATH,
  StorySpecSchema,
  VISUAL_THEME_PRESETS,
  buildDeliveryPublish,
  buildDeliveryPublishing,
  buildProductionRevision,
  buildProjectSoundPlan,
  computeStoryFingerprint,
  ProjectSceneTemplateInstantiationSchema,
  buildNotApplicableFidelityReceipt,
  buildSceneSoundPlan,
  buildSceneSyncAnchors,
  buildSceneTaskInputV7,
  buildSceneVisualPlan,
  buildShotPlanSet,
  buildShotRecipeSelection,
  serializeCanonicalJson,
  createDeliveryBuildId,
  computeNoNarrationFingerprint,
  generateVisualSemanticTiming,
  type Sha256Digest,
} from "@axmorf/studio/contracts";
import {
  inspectCurrentDelivery,
  type CurrentDeliveryInspectionDependencies,
} from "../../scripts/project-production/adapters/current-delivery-inspection";
import { createProject } from "../../scripts/projects/application/create-project";
import {
  createProjectRevisionCandidate,
  readProjectRevisionContext,
  validateProjectRevisionAuthoring,
  type ProjectRevisionStateDependencies,
} from "../../scripts/projects/application/project-revision";
import {
  promoteProjectRevisionCandidate,
  type ProjectRevisionPromotionDependencies,
} from "../../scripts/projects/application/project-revision-promotion";
import {
  parseProjectRevisionCreateArguments,
  parseProjectRevisionValidateArguments,
  runProjectRevisionContextCli,
  runProjectRevisionCreateCli,
  runProjectRevisionValidateCli,
} from "../../scripts/projects/revision";
import { buildRuntimePolicyManifest } from "../../packages/studio/src/runtime/policy-manifest";
import { snapshotPolicyRoots } from "../../scripts/project-production/adapters/project-input-snapshot";
import { computeProjectRevisionCandidateId } from "../../packages/studio/src/contracts/project-revision";
import { createProjectRevisionProductionScope } from "../../scripts/project-production/application/production-scope";
import { collectRendererSourceGraph } from "../../scripts/renderer-registry/domain";
import { buildScenePackage } from "../../scripts/scene-package/domain";
import { createScenePackageInput } from "../fixtures/scene/package-input";
import {
  prepareProjectCreateFixture,
  validProjectCreateInput,
} from "../fixtures/project-create";

const sha = (character: string) =>
  `sha256:${character.repeat(64)}` as Sha256Digest;

const checksum = (bytes: string) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}` as Sha256Digest;

const revision = buildProductionRevision({
  storyId: validProjectCreateInput.storyId,
  storyFingerprint: sha("1"),
  narrationFingerprint: sha("2"),
  renderFingerprint: sha("3"),
  visualStyleFingerprint: sha("4"),
  publishingIntentFingerprint: sha("5"),
  projectSoundFingerprint: sha("6"),
  authoringRequirementsFingerprint: sha("7"),
  globalVisualBriefFingerprint: sha("8"),
  storyResourcePoolFingerprint: sha("9"),
  projectAssetManifestFingerprint: sha("a"),
  narrationGenerationFingerprint: sha("b"),
  scenes: [
    {
      meaningId: "opening",
      beatFingerprint: sha("c"),
      timingFingerprint: sha("d"),
      readabilityFingerprint: sha("e"),
      briefFingerprint: sha("f"),
      requirementsFingerprint: sha("1"),
      resourcePoolFingerprint: sha("2"),
      selectedResourcesFingerprint: sha("3"),
      templateInstanceFingerprint: null,
    },
  ],
  selectedResources: [],
  policyFingerprints: [{ id: "runtime-toolchain", fingerprint: sha("4") }],
});

const acceptFixtureMedia: CurrentDeliveryInspectionDependencies = {
  inspectVideo: async ({ expected }) => ({
    codec: "h264",
    audioCodec: "aac",
    audioChannels: expected.audioChannels,
    width: expected.width,
    height: expected.height,
    fps: expected.fps,
    frameCount: expected.frameCount,
    decodedToEof: true,
  }),
  inspectCover: async ({ expected }) => ({
    imageFormat: "png",
    width: expected.width,
    height: expected.height,
    decodedToEof: true,
  }),
};

const writeCurrentDelivery = async (
  rootDir: string,
  revisionId = revision.revisionId,
) => {
  const identity = {
    storyId: validProjectCreateInput.storyId,
    revisionId,
    artifactSetFingerprint: sha("5"),
    compositionId: validProjectCreateInput.render.compositionId,
    fps: 30,
    frameCount: 120,
    width: 1080,
    height: 1920,
    policyVersion: "revision-artifact-sync-delivery-v1",
  } as const;
  const deliveryBuildId = createDeliveryBuildId(identity);
  const directory = join(
    rootDir,
    "deliveries",
    validProjectCreateInput.storyId,
  );
  await mkdir(directory, { recursive: true });
  const files = {
    "video.mp4": "video-bytes",
    "cover-4x3.png": "wide-cover",
    "cover-3x4.png": "tall-cover",
  } as const;
  await Promise.all(
    Object.entries(files).map(([name, bytes]) =>
      writeFile(join(directory, name), bytes),
    ),
  );
  const file = (name: keyof typeof files) => ({
    repositoryPath: `deliveries/${validProjectCreateInput.storyId}/${name}`,
    checksum: checksum(files[name]),
    sizeBytes: Buffer.byteLength(files[name]),
  });
  const publishing = buildDeliveryPublishing({
    storyId: validProjectCreateInput.storyId,
    title: validProjectCreateInput.story.title,
    description: validProjectCreateInput.publishing.description,
    topics: validProjectCreateInput.publishing.topics,
    collection: "AI 工作流",
    outputFileName: "video.mp4",
    coverFileNames: {
      cover4x3: "cover-4x3.png",
      cover3x4: "cover-3x4.png",
    },
    fps: 30,
    frameCount: 120,
    plannedDurationSeconds: 4,
    chapters: [
      {
        meaningId: "opening",
        name: "开场",
        startFrame: 0,
        timecode: "00:00:00",
      },
    ],
  });
  const publish = buildDeliveryPublish({
    ...identity,
    deliveryBuildId,
    artifacts: {
      video: {
        ...file("video.mp4"),
        media: {
          codec: "h264",
          audioCodec: "aac",
          audioChannels: 2,
          width: 1080,
          height: 1920,
          fps: 30,
          frameCount: 120,
          decodedToEof: true,
        },
      },
      cover4x3: {
        ...file("cover-4x3.png"),
        media: {
          imageFormat: "png",
          width: 1600,
          height: 1200,
          decodedToEof: true,
        },
      },
      cover3x4: {
        ...file("cover-3x4.png"),
        media: {
          imageFormat: "png",
          width: 1200,
          height: 1600,
          decodedToEof: true,
        },
      },
    },
    publishing,
  });
  await writeFile(
    join(directory, "publish.json"),
    `${JSON.stringify(publish)}\n`,
  );
  return publish;
};

const fixture = async (
  context: {
    after: (callback: () => Promise<void>) => void;
  },
  boundaryTemplates = false,
) => {
  const prepared = await prepareProjectCreateFixture();
  context.after(() => rm(prepared.rootDir, { recursive: true, force: true }));
  if (boundaryTemplates)
    await writeFile(
      prepared.inputPath,
      JSON.stringify({
        ...validProjectCreateInput,
        sceneTemplates: {
          introSceneTemplateId: "axmorf-brand-reveal-v1",
          outroSceneTemplateId: "axmorf-source-follow-v1",
        },
      }),
    );
  await createProject({
    rootDir: prepared.rootDir,
    projectId: validProjectCreateInput.storyId,
    inputPath: prepared.inputPath,
    env: { RSP_PRODUCER_CONFIG: prepared.configPath },
    runtimeResources: prepared.runtimeResources,
  });
  await mkdir(
    join(prepared.rootDir, ".narration-work", validProjectCreateInput.storyId),
    { recursive: true },
  );
  await writeFile(
    join(
      prepared.rootDir,
      ".narration-work",
      validProjectCreateInput.storyId,
      "sealed-source.wav",
    ),
    "narration-work",
  );
  const publish = await writeCurrentDelivery(prepared.rootDir);
  const dependencies: ProjectRevisionStateDependencies = {
    readCurrentRevision: async () => revision,
    inspectDelivery: (input) =>
      inspectCurrentDelivery({ ...input, dependencies: acceptFixtureMedia }),
  };
  const input = {
    schemaVersion: 1,
    contractVersion: "project-revision-input-v1",
    storyId: validProjectCreateInput.storyId,
    baseRevisionId: revision.revisionId,
    baseDeliveryBuildId: publish.deliveryBuildId,
    patch: {
      story: {
        ...validProjectCreateInput.story,
        beats: [
          {
            ...validProjectCreateInput.story.beats[0],
            ttsChunks: [
              {
                chunkId: "opening-01",
                ttsText: "Measured audio remains the only timing authority.",
              },
            ],
          },
        ],
      },
    },
  } as const;
  return { ...prepared, dependencies, input, publish } as const;
};

const visualFixture = async (context: {
  after: (callback: () => Promise<void>) => void;
}) => {
  const prepared = await prepareProjectCreateFixture();
  context.after(() => rm(prepared.rootDir, { recursive: true, force: true }));
  const input = ProjectCreateInputSchema.parse({
    ...validProjectCreateInput,
    story: {
      ...validProjectCreateInput.story,
      beats: [
        {
          kind: "visual-scene",
          meaningId: "opening",
          narrativePurpose:
            "Show the samples becoming stable frame boundaries.",
          durationInFrames: 120,
        },
      ],
    },
    scenes: [
      { ...validProjectCreateInput.scenes[0], soundIntent: "No narration." },
    ],
    sceneTemplates: {
      introSceneTemplateId: "axmorf-brand-reveal-v1",
      outroSceneTemplateId: "axmorf-source-follow-v1",
    },
  });
  await writeFile(prepared.inputPath, JSON.stringify(input));
  await createProject({
    rootDir: prepared.rootDir,
    projectId: input.storyId,
    inputPath: prepared.inputPath,
    env: { RSP_PRODUCER_CONFIG: prepared.configPath },
    runtimeResources: prepared.runtimeResources,
  });
  const publish = await writeCurrentDelivery(prepared.rootDir);
  const dependencies: ProjectRevisionStateDependencies = {
    readCurrentRevision: async () => revision,
    inspectDelivery: (deliveryInput) =>
      inspectCurrentDelivery({
        ...deliveryInput,
        dependencies: acceptFixtureMedia,
      }),
  };
  const revisionContext = await readProjectRevisionContext({
    rootDir: prepared.rootDir,
    projectId: input.storyId,
    dependencies,
  });
  return { ...prepared, input, publish, dependencies, revisionContext };
};

const visualPromotionFixture = async (context: {
  after: (callback: () => Promise<void>) => void;
}) => {
  const current = await visualFixture(context);
  const storyId = current.input.storyId;
  const created = await createProjectRevisionCandidate({
    rootDir: current.rootDir,
    projectId: storyId,
    input: {
      schemaVersion: 1,
      contractVersion: "project-revision-input-v1",
      storyId,
      baseRevisionId: current.revisionContext.baseRevisionId,
      baseDeliveryBuildId: current.revisionContext.baseDeliveryBuildId,
      patch: {
        story: {
          ...current.revisionContext.editable.story,
          beats: current.revisionContext.editable.story.beats.map((beat) => ({
            ...beat,
            durationInFrames: 180,
          })),
        },
      },
    },
    env: { RSP_PRODUCER_CONFIG: current.configPath },
    dependencies: current.dependencies,
  });
  const scope = createProjectRevisionProductionScope({
    rootDir: current.rootDir,
    storyId,
    candidateId: created.candidateId,
  });
  const candidateRoot = join(scope.projectSourceRoot, storyId);
  const candidateStory = StorySpecSchema.parse(
    JSON.parse(await readFile(join(candidateRoot, "story.json"), "utf8")),
  );
  const render = RenderSpecSchema.parse(
    JSON.parse(await readFile(join(candidateRoot, "render.json"), "utf8")),
  );
  await writeFile(
    join(candidateRoot, "generated/semantic-timing.generated.json"),
    serializeCanonicalJson(
      generateVisualSemanticTiming({ story: candidateStory, render }),
    ),
  );
  for (const name of ["sealed-narration", "mastered-narration"])
    await writeFile(
      join(candidateRoot, `generated/${name}.generated.json`),
      "null\n",
    );
  const expectedRevisionId =
    `revision-${"e".repeat(64)}` as typeof revision.revisionId;
  const candidatePublish = await writeCurrentDelivery(
    scope.isolatedRoot,
    expectedRevisionId,
  );
  const promotionInput = {
    rootDir: current.rootDir,
    storyId,
    candidateId: created.candidateId,
    expectedRevisionId,
    expectedDeliveryBuildId: candidatePublish.deliveryBuildId,
  };
  // Media and production revision reads are fixtures; create/revise/promotion
  // and all filesystem safety, identity, source and rollback checks are real.
  const promotionDependencies: ProjectRevisionPromotionDependencies = {
    inspectDelivery: (deliveryInput) =>
      inspectCurrentDelivery({
        ...deliveryInput,
        dependencies: acceptFixtureMedia,
      }),
    readCandidateRevision: async () => ({ revisionId: expectedRevisionId }),
    readRevision: async ({ rootDir }) => {
      const story = StorySpecSchema.parse(
        JSON.parse(
          await readFile(
            join(rootDir, "src/projects", storyId, "story.json"),
            "utf8",
          ),
        ),
      );
      const beat = story.beats.find(({ kind }) => kind === "visual-scene");
      return {
        revisionId:
          beat?.kind === "visual-scene" && beat.durationInFrames === 180
            ? expectedRevisionId
            : revision.revisionId,
      };
    },
  };
  return {
    ...current,
    scope,
    candidateRoot,
    candidatePublish,
    promotionInput,
    promotionDependencies,
  };
};

test("visual create to revision promotion retains absent narration and a repeat is read-only current", async (context) => {
  const current = await visualPromotionFixture(context);
  const promoted = await promoteProjectRevisionCandidate(
    current.promotionInput,
    current.promotionDependencies,
  );
  assert.equal(promoted.status, "project-revision-promoted");
  const projectRoot = join(
    current.rootDir,
    "src/projects",
    current.input.storyId,
  );
  assert.equal(
    await readFile(join(projectRoot, "story.json"), "utf8"),
    await readFile(join(current.candidateRoot, "story.json"), "utf8"),
  );
  assert.equal(
    JSON.parse(await readFile(join(projectRoot, "narration.json"), "utf8")),
    null,
  );
  assert.deepEqual(
    await inspectCurrentDelivery({
      rootDir: current.rootDir,
      storyId: current.input.storyId,
      dependencies: acceptFixtureMedia,
    }),
    current.candidatePublish,
  );
  for (const narrationRoot of [
    join(current.rootDir, ".narration-work", current.input.storyId),
    join(current.scope.narrationWorkRoot, current.input.storyId),
  ])
    await assert.rejects(access(narrationRoot), { code: "ENOENT" });
  const storyBefore = await stat(join(projectRoot, "story.json"));
  assert.equal(
    (
      await promoteProjectRevisionCandidate(
        current.promotionInput,
        current.promotionDependencies,
      )
    ).status,
    "project-revision-current",
  );
  assert.equal(
    (await stat(join(projectRoot, "story.json"))).mtimeMs,
    storyBefore.mtimeMs,
  );
});

for (const failureCheckpoint of [
  "narration-installed",
  "verification-complete",
] as const) {
  test(`visual promotion rolls back at ${failureCheckpoint} without introducing narration`, async (context) => {
    const current = await visualPromotionFixture(context);
    const projectRoot = join(
      current.rootDir,
      "src/projects",
      current.input.storyId,
    );
    const liveStory = await readFile(join(projectRoot, "story.json"), "utf8");
    await assert.rejects(
      promoteProjectRevisionCandidate(current.promotionInput, {
        ...current.promotionDependencies,
        checkpoint: async (checkpoint) => {
          if (checkpoint === failureCheckpoint)
            throw new Error(`injected:${checkpoint}`);
        },
      }),
      new RegExp(`injected:${failureCheckpoint}`, "u"),
    );
    assert.equal(
      await readFile(join(projectRoot, "story.json"), "utf8"),
      liveStory,
    );
    assert.deepEqual(
      await inspectCurrentDelivery({
        rootDir: current.rootDir,
        storyId: current.input.storyId,
        dependencies: acceptFixtureMedia,
      }),
      current.publish,
    );
    await assert.rejects(
      access(join(current.rootDir, ".narration-work", current.input.storyId)),
      { code: "ENOENT" },
    );
    await access(join(current.candidateRoot, "story.json"));
  });
}

test("boundary and music revision retains immutable source bytes and isolates a 75-frame ending", async (context) => {
  const current = await visualFixture(context);
  const storyId = current.input.storyId;
  const projectRoot = join(current.rootDir, "src/projects", storyId);
  const originalStoryBytes = await readFile(
    join(projectRoot, "story.json"),
    "utf8",
  );
  const originalStory = StorySpecSchema.parse(JSON.parse(originalStoryBytes));
  const originalInstance = await readFile(
    join(
      projectRoot,
      "scenes/configured-outro-scene/scene-template-instance.json",
    ),
  );
  const originalRenderer = await readFile(
    join(projectRoot, "scenes/configured-outro-scene/Renderer.tsx"),
  );
  // State/media readers are injected in this authoring test; the audio identity is frozen as base input.
  const baseSound = buildProjectSoundPlan({
    storyId,
    contributions: [
      {
        contributionId: "existing-music",
        resourceId: `res-project-${storyId}-music`,
        descriptorFingerprint: sha("8"),
        volume: 0.16,
        loop: true,
        playbackScope: "content",
      },
    ],
  });
  await writeFile(
    join(projectRoot, "sound.json"),
    `${serializeCanonicalJson(baseSound)}\n`,
  );
  const revisionContext = await readProjectRevisionContext({
    rootDir: current.rootDir,
    projectId: storyId,
    dependencies: current.dependencies,
  });
  const { soundPlanFingerprint: _baseFingerprint, ...soundInput } = baseSound;
  void _baseFingerprint;
  const input = ProjectRevisionInputSchema.parse({
    schemaVersion: 1,
    contractVersion: "project-revision-input-v1",
    storyId,
    baseRevisionId: revisionContext.baseRevisionId,
    baseDeliveryBuildId: revisionContext.baseDeliveryBuildId,
    patch: {
      boundaryScenes: revisionContext.editable.boundaryScenes?.map((scene) => ({
        ...scene,
        playbackRange:
          scene.meaningId === "configured-outro-scene"
            ? {
                startFrame: 165,
                endFrame: 240,
                musicVolume: 0.44,
                musicFadeInFrames: 8,
                musicFadeOutFrames: 15,
              }
            : scene.playbackRange,
      })),
      sound: {
        ...soundInput,
        contributions: soundInput.contributions.map((track) => ({
          ...track,
          volume: 0.44,
          fadeInFrames: 10,
          fadeOutFrames: 15,
        })),
      },
    },
  });
  const created = await createProjectRevisionCandidate({
    rootDir: current.rootDir,
    projectId: storyId,
    input,
    env: { RSP_PRODUCER_CONFIG: current.configPath },
    dependencies: current.dependencies,
  });
  const scope = createProjectRevisionProductionScope({
    rootDir: current.rootDir,
    storyId,
    candidateId: created.candidateId,
  });
  const candidateRoot = join(scope.projectSourceRoot, storyId);
  const revised = StorySpecSchema.parse(
    JSON.parse(await readFile(join(candidateRoot, "story.json"), "utf8")),
  );
  assert.deepEqual(
    revised.beats.filter((beat) => beat.kind !== "silent-scene"),
    originalStory.beats.filter((beat) => beat.kind !== "silent-scene"),
  );
  const outro = revised.beats.at(-1);
  assert.ok(outro?.kind === "silent-scene");
  assert.equal(outro.preset.durationInFrames, 75);
  assert.deepEqual(
    await readFile(
      join(
        candidateRoot,
        "scenes/configured-outro-scene/scene-template-instance.json",
      ),
    ),
    originalInstance,
  );
  assert.deepEqual(
    await readFile(
      join(candidateRoot, "scenes/configured-outro-scene/Renderer.tsx"),
    ),
    originalRenderer,
  );
  const selection = ProjectSceneTemplateInstantiationSchema.parse(
    JSON.parse(
      await readFile(
        join(candidateRoot, "production/scene-template-instantiation.json"),
        "utf8",
      ),
    ),
  );
  assert.equal(
    selection.materializedStoryFingerprint,
    computeStoryFingerprint(revised),
  );
  assert.equal(
    selection.selections.outro?.presetFingerprint,
    outro.preset.presetFingerprint,
  );
  const revisedSound = JSON.parse(
    await readFile(join(candidateRoot, "sound.json"), "utf8"),
  );
  assert.equal(revisedSound.contributions[0].volume, 0.44);
  assert.equal(revisedSound.contributions[0].fadeInFrames, 10);
  assert.equal(
    await readFile(join(projectRoot, "story.json"), "utf8"),
    originalStoryBytes,
  );
  assert.deepEqual(
    JSON.parse(await readFile(join(projectRoot, "sound.json"), "utf8")),
    baseSound,
  );
  await assert.rejects(
    validateProjectRevisionAuthoring({
      rootDir: current.rootDir,
      dependencies: current.dependencies,
      input: {
        ...input,
        patch: {
          sound: {
            ...input.patch.sound,
            contributions: [
              {
                ...soundInput.contributions[0],
                resourceId: "res-unowned-music",
              },
            ],
          },
        },
      },
    }),
    /existing tracks only/u,
  );
  await assert.rejects(
    validateProjectRevisionAuthoring({
      rootDir: current.rootDir,
      dependencies: current.dependencies,
      input: {
        ...input,
        patch: {
          boundaryScenes: input.patch.boundaryScenes?.map((scene) => ({
            ...scene,
            playbackRange: { startFrame: 165, endFrame: 241 },
          })),
        },
      },
    }),
    /exceeds its immutable source/u,
  );
});

test("visual revision exposes authored content and isolates duration changes while retaining null narration and boundaries", async (context) => {
  const current = await visualFixture(context);
  const storyId = current.input.storyId;
  assert.equal(
    current.revisionContext.constraints.preserveContentMeaningIdsAndOrder,
    true,
  );
  assert.deepEqual(
    current.revisionContext.editable.story.beats.map(({ kind, meaningId }) => [
      kind,
      meaningId,
    ]),
    [["visual-scene", "opening"]],
  );
  assert.deepEqual(
    current.revisionContext.editable.scenes.map(({ meaningId }) => meaningId),
    ["opening"],
  );
  const projectRoot = join(current.rootDir, "src/projects", storyId);
  const liveStory = await readFile(join(projectRoot, "story.json"), "utf8");
  const liveTiming = await readFile(
    join(projectRoot, "generated/semantic-timing.generated.json"),
    "utf8",
  );
  const nullNarration = await readFile(
    join(projectRoot, "narration.json"),
    "utf8",
  );
  const input = ProjectRevisionInputSchema.parse({
    schemaVersion: 1,
    contractVersion: "project-revision-input-v1",
    storyId,
    baseRevisionId: current.revisionContext.baseRevisionId,
    baseDeliveryBuildId: current.revisionContext.baseDeliveryBuildId,
    patch: {
      story: {
        ...current.revisionContext.editable.story,
        beats: current.revisionContext.editable.story.beats.map((beat) => ({
          ...beat,
          durationInFrames: 180,
        })),
      },
    },
  });
  const args = {
    rootDir: current.rootDir,
    projectId: storyId,
    input,
    env: { RSP_PRODUCER_CONFIG: current.configPath },
    dependencies: current.dependencies,
  };
  const created = await createProjectRevisionCandidate(args);
  assert.equal(created.storyChanged, true);
  const scope = createProjectRevisionProductionScope({
    rootDir: current.rootDir,
    storyId,
    candidateId: created.candidateId,
  });
  const candidateRoot = join(scope.projectSourceRoot, storyId);
  const candidateStory = JSON.parse(
    await readFile(join(candidateRoot, "story.json"), "utf8"),
  );
  assert.deepEqual(
    candidateStory.beats.filter(
      (beat: { kind: string }) => beat.kind === "silent-scene",
    ),
    JSON.parse(liveStory).beats.filter(
      (beat: { kind: string }) => beat.kind === "silent-scene",
    ),
  );
  assert.equal(candidateStory.beats[1].durationInFrames, 180);
  assert.equal(
    await readFile(join(candidateRoot, "narration.json"), "utf8"),
    nullNarration,
  );
  const requirements = AuthoringRequirementsSchema.parse(
    JSON.parse(
      await readFile(
        join(candidateRoot, "production/requirements.json"),
        "utf8",
      ),
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
    checksum(nullNarration),
  );
  const materialization = ProjectRevisionMaterializationRecordSchema.parse(
    JSON.parse(
      await readFile(
        join(candidateRoot, "production/project-revision-candidate.json"),
        "utf8",
      ),
    ),
  );
  assert.equal(
    materialization.authoringFiles.find(
      ({ logicalPath }) =>
        logicalPath === `src/projects/${storyId}/narration.json`,
    )?.checksum,
    checksum(nullNarration),
  );
  await assert.rejects(
    access(join(candidateRoot, "generated/semantic-timing.generated.json")),
    { code: "ENOENT" },
  );
  await assert.rejects(access(join(scope.narrationWorkRoot, storyId)), {
    code: "ENOENT",
  });
  for (const boundary of ["configured-intro-scene", "configured-outro-scene"]) {
    const instancePath = `scenes/${boundary}/scene-template-instance.json`;
    assert.equal(
      await readFile(join(candidateRoot, instancePath), "utf8"),
      await readFile(join(projectRoot, instancePath), "utf8"),
    );
  }
  assert.equal(
    await readFile(join(projectRoot, "story.json"), "utf8"),
    liveStory,
  );
  assert.equal(
    await readFile(
      join(projectRoot, "generated/semantic-timing.generated.json"),
      "utf8",
    ),
    liveTiming,
  );
  assert.equal(
    await readFile(join(projectRoot, "narration.json"), "utf8"),
    nullNarration,
  );
  assert.deepEqual(
    await inspectCurrentDelivery({
      rootDir: current.rootDir,
      storyId,
      dependencies: acceptFixtureMedia,
    }),
    current.publish,
  );
  assert.equal(
    (await createProjectRevisionCandidate(args)).candidateId,
    created.candidateId,
  );
});

test("visual local brief revision retains authored timing and uses only isolated authoring", async (context) => {
  const current = await visualFixture(context);
  const storyId = current.input.storyId;
  const projectRoot = join(current.rootDir, "src/projects", storyId);
  const livePending = await readFile(
    join(projectRoot, "production/pending-scene-production-brief.json"),
    "utf8",
  );
  const timing = await readFile(
    join(projectRoot, "generated/semantic-timing.generated.json"),
    "utf8",
  );
  const created = await createProjectRevisionCandidate({
    rootDir: current.rootDir,
    projectId: storyId,
    input: {
      schemaVersion: 1,
      contractVersion: "project-revision-input-v1",
      storyId,
      baseRevisionId: current.revisionContext.baseRevisionId,
      baseDeliveryBuildId: current.revisionContext.baseDeliveryBuildId,
      patch: {
        scenes: current.revisionContext.editable.scenes.map((scene) => ({
          ...scene,
          motionIntent:
            "Hold the frame axis while samples resolve into boundaries, then let the result settle.",
        })),
      },
    },
    env: { RSP_PRODUCER_CONFIG: current.configPath },
    dependencies: current.dependencies,
  });
  assert.equal(created.storyChanged, false);
  const scope = createProjectRevisionProductionScope({
    rootDir: current.rootDir,
    storyId,
    candidateId: created.candidateId,
  });
  const candidateRoot = join(scope.projectSourceRoot, storyId);
  assert.equal(
    await readFile(
      join(candidateRoot, "generated/semantic-timing.generated.json"),
      "utf8",
    ),
    timing,
  );
  assert.equal(
    JSON.parse(await readFile(join(candidateRoot, "narration.json"), "utf8")),
    null,
  );
  assert.equal(
    await readFile(
      join(projectRoot, "production/pending-scene-production-brief.json"),
      "utf8",
    ),
    livePending,
  );
  await assert.rejects(
    access(join(current.rootDir, ".producer-attempts", storyId)),
    { code: "ENOENT" },
  );
});

test("revision does not turn visual content into narration without voice authoring", async (context) => {
  const current = await visualFixture(context);
  const storyId = current.input.storyId;
  await assert.rejects(
    createProjectRevisionCandidate({
      rootDir: current.rootDir,
      projectId: storyId,
      input: {
        schemaVersion: 1,
        contractVersion: "project-revision-input-v1",
        storyId,
        baseRevisionId: current.revisionContext.baseRevisionId,
        baseDeliveryBuildId: current.revisionContext.baseDeliveryBuildId,
        patch: { story: validProjectCreateInput.story },
      },
      env: { RSP_PRODUCER_CONFIG: current.configPath },
      dependencies: current.dependencies,
    }),
    /preserve its visual or narrated content mode/u,
  );
  assert.equal(
    JSON.parse(
      await readFile(
        join(current.rootDir, "src/projects", storyId, "narration.json"),
        "utf8",
      ),
    ),
    null,
  );
  await assert.rejects(
    access(join(current.rootDir, ".project-revisions", storyId)),
    { code: "ENOENT" },
  );
});

test("candidate authoring freezes verified current Scene bytes before narration cleanup and attests the input", async (context) => {
  const current = await fixture(context);
  const old = createScenePackageInput();
  const storyId = current.input.storyId;
  const meaningId = "opening";
  const sceneRoot = `src/projects/${storyId}/scenes/${meaningId}`;
  const task = buildSceneTaskInputV7({
    ...old.task,
    storyId,
    meaningId,
    storyBeat: validProjectCreateInput.story.beats[0],
    timingBeat: { ...old.task.timingBeat, meaningId },
    allowedDirectories: {
      sceneRoot,
      publicAssetRoot: `public/projects/${storyId}/scenes/${meaningId}`,
    },
  });
  const identity = {
    taskInputFingerprint: task.taskInputFingerprint,
    meaningId,
  };
  const visual = buildSceneVisualPlan({ ...old.visual, ...identity });
  const shots = buildShotPlanSet({ ...old.shots, ...identity });
  const anchors = buildSceneSyncAnchors({ ...old.anchors, ...identity });
  const sound = buildSceneSoundPlan({ ...old.sound, ...identity });
  const selection = buildShotRecipeSelection({
    taskInputFingerprint: task.taskInputFingerprint,
    selections: [],
  });
  const fidelityReceipt = buildNotApplicableFidelityReceipt({
    selectionFingerprint: selection.selectionFingerprint,
    reason: "empty",
  });
  const renderer =
    'import type {SceneRendererProps} from "@axmorf/studio/remotion";\nconst Renderer = ({viewportWidth}: SceneRendererProps) => <div style={{width: viewportWidth}} data-label="retain-base" />;\nexport default Renderer;\n';
  await mkdir(join(current.rootDir, sceneRoot, "generated"), {
    recursive: true,
  });
  await writeFile(join(current.rootDir, sceneRoot, "Renderer.tsx"), renderer);
  const graph = await collectRendererSourceGraph({
    rootDir: current.rootDir,
    projectId: storyId,
    rendererPath: `${sceneRoot}/Renderer.tsx`,
  });
  const scenePackage = buildScenePackage({
    task,
    visual,
    shots,
    anchors,
    sound,
    selection,
    fidelityReceipt,
    selectedResources: old.selectedResources,
    rendererBinding: {
      rendererId: `${storyId}-${meaningId}`,
      rendererSourceFingerprint: graph.sourceGraphFingerprint,
    },
    current: {
      ...old.current,
      timingBeat: task.timingBeat,
      rendererSourceFingerprint: graph.sourceGraphFingerprint,
    },
  });
  const declarations = {
    "task-input.generated.json": task,
    "generated/scene-package.generated.json": scenePackage,
    "visual-plan.json": visual,
    "shot-plan.json": shots,
    "sync-anchors.json": anchors,
    "sound-plan.json": sound,
    "shot-recipe-selection.json": selection,
    "generated/reference-fidelity.generated.json": fidelityReceipt,
    "selected-resources.json": {
      schemaVersion: 1,
      selectedResources: old.selectedResources,
    },
  };
  for (const [path, value] of Object.entries(declarations))
    await writeFile(
      join(current.rootDir, sceneRoot, path),
      `${serializeCanonicalJson(value)}\n`,
    );
  const created = await createProjectRevisionCandidate({
    rootDir: current.rootDir,
    projectId: storyId,
    input: current.input,
    env: { RSP_PRODUCER_CONFIG: current.configPath },
    dependencies: current.dependencies,
  });
  const scope = createProjectRevisionProductionScope({
    rootDir: current.rootDir,
    storyId,
    candidateId: created.candidateId,
  });
  const logicalPath = `src/projects/${storyId}/${SCENE_PRIOR_SOURCE_PATH}`;
  const bytes = await readFile(join(scope.isolatedRoot, logicalPath), "utf8");
  const index = ScenePriorSourceIndexSchema.parse(JSON.parse(bytes));
  assert.equal(index.scenes.length, 1);
  assert.equal(
    index.scenes[0].brief.compositionIntent,
    validProjectCreateInput.scenes[0].compositionIntent,
  );
  assert.equal(
    index.scenes[0].files.find(({ path }) => path === "Renderer.tsx")?.content,
    renderer,
  );
  assert.equal(
    index.scenes[0].scenePackageFingerprint,
    scenePackage.packageFingerprint,
  );
  assert.equal(
    await readFile(join(current.rootDir, sceneRoot, "Renderer.tsx"), "utf8"),
    renderer,
  );
  await assert.rejects(access(join(scope.isolatedRoot, sceneRoot)), /ENOENT/u);
  await assert.rejects(access(join(current.rootDir, logicalPath)), /ENOENT/u);
  const materialization = ProjectRevisionMaterializationRecordSchema.parse(
    JSON.parse(
      await readFile(
        join(
          scope.projectSourceRoot,
          storyId,
          "production/project-revision-candidate.json",
        ),
        "utf8",
      ),
    ),
  );
  assert.deepEqual(
    materialization.authoringFiles.find(
      (file) => file.logicalPath === logicalPath,
    ),
    {
      logicalPath,
      checksum: checksum(bytes),
      sizeBytes: Buffer.byteLength(bytes),
    },
  );
  const repeated = await createProjectRevisionCandidate({
    rootDir: current.rootDir,
    projectId: storyId,
    input: current.input,
    env: { RSP_PRODUCER_CONFIG: current.configPath },
    dependencies: current.dependencies,
  });
  assert.equal(repeated.candidateId, created.candidateId);
  assert.equal(
    await readFile(join(scope.isolatedRoot, logicalPath), "utf8"),
    bytes,
  );
});

test("theme revision preserves immutable boundaries and changes only the isolated candidate", async (context) => {
  const current = await fixture(context, true);
  const projectRoot = join(current.rootDir, "src/projects/story-example");
  const liveStyleBytes = await readFile(
    join(projectRoot, "visual-style.json"),
    "utf8",
  );
  const liveStyle = JSON.parse(liveStyleBytes);
  const result = await readProjectRevisionContext({
    rootDir: current.rootDir,
    projectId: current.input.storyId,
    dependencies: current.dependencies,
  });
  assert.deepEqual(
    result.editable.visualStyle.theme,
    VISUAL_THEME_PRESETS.dark,
  );
  const input = {
    ...current.input,
    patch: {
      visualStyle: { ...result.editable.visualStyle, theme: "light" },
    },
  };
  await createProjectRevisionCandidate({
    rootDir: current.rootDir,
    projectId: current.input.storyId,
    input,
    env: { RSP_PRODUCER_CONFIG: current.configPath },
    dependencies: current.dependencies,
  });
  const scope = createProjectRevisionProductionScope({
    rootDir: current.rootDir,
    storyId: current.input.storyId,
    candidateId: computeProjectRevisionCandidateId(input),
  });
  const candidateRoot = join(scope.projectSourceRoot, current.input.storyId);
  assert.deepEqual(
    JSON.parse(await readFile(join(candidateRoot, "visual-style.json"), "utf8"))
      .theme,
    VISUAL_THEME_PRESETS.light,
  );
  assert.equal(
    await readFile(join(projectRoot, "visual-style.json"), "utf8"),
    liveStyleBytes,
  );
  for (const boundary of ["configured-intro-scene", "configured-outro-scene"]) {
    const instancePath = `scenes/${boundary}/scene-template-instance.json`;
    const instance = JSON.parse(
      await readFile(join(projectRoot, instancePath), "utf8"),
    );
    assert.equal(
      await readFile(join(candidateRoot, instancePath), "utf8"),
      await readFile(join(projectRoot, instancePath), "utf8"),
    );
    for (const file of instance.copiedSourceFiles) {
      assert.equal(
        await readFile(join(scope.isolatedRoot, file.repositoryPath), "utf8"),
        await readFile(join(current.rootDir, file.repositoryPath), "utf8"),
      );
    }
  }
  await assert.rejects(
    validateProjectRevisionAuthoring({
      rootDir: current.rootDir,
      input: {
        ...current.input,
        patch: { visualStyle: validProjectCreateInput.visualStyle },
      },
      dependencies: current.dependencies,
    }),
    /preserve or replace.*theme/u,
  );
  // Simulate a pre-theme stored authoring document in this disposable fixture only.
  delete liveStyle.theme;
  await writeFile(
    join(projectRoot, "visual-style.json"),
    JSON.stringify(liveStyle),
  );
  await assert.rejects(
    validateProjectRevisionAuthoring({
      rootDir: current.rootDir,
      input,
      dependencies: current.dependencies,
    }),
    /incompatible with legacy immutable boundary templates/u,
  );
});

test("revision context fully binds the current Revision and exact Delivery", async (context) => {
  const current = await fixture(context);
  const result = await readProjectRevisionContext({
    rootDir: current.rootDir,
    projectId: validProjectCreateInput.storyId,
    dependencies: current.dependencies,
  });
  assert.equal(result.baseRevisionId, revision.revisionId);
  assert.equal(result.baseDeliveryBuildId, current.publish.deliveryBuildId);
  assert.deepEqual(
    result.editable.story.beats.map(({ meaningId }) => meaningId),
    ["opening"],
  );

  await writeFile(
    join(
      current.rootDir,
      "deliveries",
      validProjectCreateInput.storyId,
      "unknown.txt",
    ),
    "unknown",
  );
  await assert.rejects(
    readProjectRevisionContext({
      rootDir: current.rootDir,
      projectId: validProjectCreateInput.storyId,
      dependencies: current.dependencies,
    }),
    /exactly four regular files/u,
  );
});

test("public revision commands use installed runtime policy without Workspace contract sources", async (context) => {
  const runtimePolicyManifest = buildRuntimePolicyManifest({
    packageVersion: "0.1.11",
    files: [
      {
        logicalPath: "dist/contracts.js",
        bytes: Buffer.from("installed-runtime"),
        scopes: ["composition", "delivery", "global-visual", "scene"],
      },
    ],
  });
  const expected = await snapshotPolicyRoots({
    rootDir: "/unused",
    runtimePolicyManifest,
  });
  for (const action of ["context", "validate", "create"] as const) {
    const current = await fixture(context);
    await assert.rejects(access(join(current.rootDir, "src/contracts")), {
      code: "ENOENT",
    });
    await writeFile(
      join(current.rootDir, "revision-input.json"),
      JSON.stringify(current.input),
    );
    let revisionReads = 0;
    const cliContext = {
      rootDir: current.rootDir,
      env: { RSP_PRODUCER_CONFIG: current.configPath },
      stdout: () => undefined,
      runtimePolicyManifest,
      dependencies: {
        ...current.dependencies,
        readCurrentRevision: async (
          input: Parameters<
            NonNullable<ProjectRevisionStateDependencies["readCurrentRevision"]>
          >[0],
        ) => {
          assert.equal(await snapshotPolicyRoots(input), expected);
          revisionReads += 1;
          return revision;
        },
      },
    };
    if (action === "context") {
      const result = await runProjectRevisionContextCli(
        ["--project", current.input.storyId],
        cliContext,
      );
      assert.equal(result.baseRevisionId, revision.revisionId);
    } else if (action === "validate") {
      await runProjectRevisionValidateCli(
        ["--input", "revision-input.json"],
        cliContext,
      );
    } else {
      await runProjectRevisionCreateCli(
        ["--project", current.input.storyId, "--input", "revision-input.json"],
        cliContext,
      );
    }
    assert.ok(revisionReads >= 2);
  }
});

test("revision context rejects a Delivery that changes during inspection", async (context) => {
  const current = await fixture(context);
  let inspectionCount = 0;
  await assert.rejects(
    readProjectRevisionContext({
      rootDir: current.rootDir,
      projectId: validProjectCreateInput.storyId,
      dependencies: {
        ...current.dependencies,
        inspectDelivery: async (input) => {
          inspectionCount += 1;
          if (inspectionCount === 2) return null;
          return inspectCurrentDelivery({
            ...input,
            dependencies: acceptFixtureMedia,
          });
        },
      },
    }),
    /Delivery changed during context inspection/u,
  );
  assert.equal(inspectionCount, 2);
});

test("revision validation rejects a handoff beyond the last narrated Scene before candidate mutation", async (context) => {
  const current = await fixture(context, true);
  const authoringPath = join(
    current.rootDir,
    "src/projects",
    current.input.storyId,
    "production/pending-scene-production-brief.json",
  );
  const before = await readFile(authoringPath, "utf8");
  const edit = await readProjectRevisionContext({
    rootDir: current.rootDir,
    projectId: current.input.storyId,
    dependencies: current.dependencies,
  });
  await assert.rejects(
    validateProjectRevisionAuthoring({
      rootDir: current.rootDir,
      dependencies: current.dependencies,
      input: {
        ...current.input,
        patch: {
          scenes: edit.editable.scenes.map((scene) => ({
            ...scene,
            outgoingHandoff: { subject: "A source ribbon" },
          })),
        },
      },
    }),
    /following narrated/u,
  );
  assert.equal(await readFile(authoringPath, "utf8"), before);
});

test("revision validation rejects no-ops and reports caption paths below patch.story", async (context) => {
  const current = await fixture(context);
  await assert.rejects(
    validateProjectRevisionAuthoring({
      rootDir: current.rootDir,
      input: {
        ...current.input,
        patch: { story: validProjectCreateInput.story },
      },
      dependencies: current.dependencies,
    }),
    /does not change current authoring/u,
  );
  await assert.rejects(
    validateProjectRevisionAuthoring({
      rootDir: current.rootDir,
      input: {
        ...current.input,
        patch: {
          story: {
            ...validProjectCreateInput.story,
            beats: [
              {
                ...validProjectCreateInput.story.beats[0],
                ttsChunks: [
                  {
                    chunkId: "opening-01",
                    ttsText: "A".repeat(73),
                  },
                ],
              },
            ],
          },
        },
      },
      dependencies: current.dependencies,
    }),
    (error: unknown) => {
      assert.ok(error instanceof AuthoringValidationError);
      assert.equal(
        error.issues[0]?.path,
        "$.patch.story.beats[0].ttsChunks[0].ttsText",
      );
      return true;
    },
  );
});

test("revision create keeps live roots unchanged and installs an idempotent isolated candidate", async (context) => {
  const current = await fixture(context);
  const liveStoryPath = join(
    current.rootDir,
    "src/projects",
    validProjectCreateInput.storyId,
    "story.json",
  );
  const liveStoryBefore = await readFile(liveStoryPath, "utf8");
  const request = {
    rootDir: current.rootDir,
    projectId: validProjectCreateInput.storyId,
    input: current.input,
    env: { RSP_PRODUCER_CONFIG: current.configPath },
    dependencies: current.dependencies,
  } as const;
  const created = await createProjectRevisionCandidate(request);
  assert.equal(created.status, "project-revision-candidate-created");
  assert.equal(created.storyChanged, true);
  assert.equal(await readFile(liveStoryPath, "utf8"), liveStoryBefore);

  const scope = createProjectRevisionProductionScope({
    rootDir: current.rootDir,
    storyId: validProjectCreateInput.storyId,
    candidateId: computeProjectRevisionCandidateId(current.input),
  });
  const candidateStory = JSON.parse(
    await readFile(
      join(
        scope.projectSourceRoot,
        validProjectCreateInput.storyId,
        "story.json",
      ),
      "utf8",
    ),
  ) as { beats: Array<{ ttsChunks?: Array<{ ttsText: string }> }> };
  assert.equal(
    candidateStory.beats[0]?.ttsChunks?.[0]?.ttsText,
    "Measured audio remains the only timing authority.",
  );
  await assert.rejects(
    access(join(scope.narrationWorkRoot, validProjectCreateInput.storyId)),
    { code: "ENOENT" },
  );
  await assert.rejects(
    access(join(scope.deliveryRoot, validProjectCreateInput.storyId)),
    {
      code: "ENOENT",
    },
  );
  assert.deepEqual(
    (await readdir(join(scope.baseSnapshotRoot, "delivery"))).sort(),
    ["cover-3x4.png", "cover-4x3.png", "publish.json", "video.mp4"],
  );

  const evolvedFiles = [
    join(scope.producerWorkRoot, validProjectCreateInput.storyId, "work.json"),
    join(scope.outputRoot, validProjectCreateInput.storyId, "render.mp4"),
    join(scope.deliveryRoot, validProjectCreateInput.storyId, "video.mp4"),
    join(scope.isolatedRoot, "src/remotion/renderer-registry.generated.ts"),
  ];
  for (const [index, path] of evolvedFiles.entries()) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `production-evolution-${index}`);
  }
  const evolvedBefore = await Promise.all(
    evolvedFiles.map(async (path) => ({
      path,
      bytes: await readFile(path, "utf8"),
      mtimeMs: (await stat(path)).mtimeMs,
    })),
  );

  const repeated = await createProjectRevisionCandidate(request);
  assert.equal(repeated.status, "project-revision-candidate-current");
  assert.equal(repeated.authoringFingerprint, created.authoringFingerprint);
  assert.equal(await readFile(liveStoryPath, "utf8"), liveStoryBefore);
  for (const previous of evolvedBefore) {
    assert.equal(await readFile(previous.path, "utf8"), previous.bytes);
    assert.equal((await stat(previous.path)).mtimeMs, previous.mtimeMs);
  }

  await writeFile(
    join(
      scope.projectSourceRoot,
      validProjectCreateInput.storyId,
      "brief.json",
    ),
    "{}\n",
  );
  await assert.rejects(
    createProjectRevisionCandidate(request),
    /authored bytes differ|authored projection is stale/u,
  );
});

test("a scenes-only revision invalidates final Scene authoring and preserves live files", async (context) => {
  const current = await fixture(context);
  const liveProjectRoot = join(
    current.rootDir,
    "src/projects",
    validProjectCreateInput.storyId,
  );
  const liveFinalBriefPath = join(
    liveProjectRoot,
    "production/scene-production-brief.json",
  );
  const livePendingPath = join(
    liveProjectRoot,
    "production/pending-scene-production-brief.json",
  );
  const liveFinalBrief = "stale-final-scene-authoring\n";
  const livePending = await readFile(livePendingPath, "utf8");
  await writeFile(liveFinalBriefPath, liveFinalBrief);
  const input = {
    ...current.input,
    patch: {
      scenes: validProjectCreateInput.scenes.map((scene) => ({
        ...scene,
        visualIntent: "Show the revised Scene intent without changing Story.",
      })),
    },
  } as const;
  const created = await createProjectRevisionCandidate({
    rootDir: current.rootDir,
    projectId: validProjectCreateInput.storyId,
    input,
    env: { RSP_PRODUCER_CONFIG: current.configPath },
    dependencies: current.dependencies,
  });
  assert.deepEqual(created.changedSections, ["scenes"]);
  assert.equal(created.storyChanged, false);
  const scope = createProjectRevisionProductionScope({
    rootDir: current.rootDir,
    storyId: validProjectCreateInput.storyId,
    candidateId: computeProjectRevisionCandidateId(input),
  });
  await assert.rejects(
    access(
      join(
        scope.projectSourceRoot,
        validProjectCreateInput.storyId,
        "production/scene-production-brief.json",
      ),
    ),
    { code: "ENOENT" },
  );
  const candidatePending = JSON.parse(
    await readFile(
      join(
        scope.projectSourceRoot,
        validProjectCreateInput.storyId,
        "production/pending-scene-production-brief.json",
      ),
      "utf8",
    ),
  ) as { scenes: Array<{ visualIntent: string }> };
  assert.equal(
    candidatePending.scenes[0]?.visualIntent,
    "Show the revised Scene intent without changing Story.",
  );
  assert.equal(await readFile(liveFinalBriefPath, "utf8"), liveFinalBrief);
  assert.equal(await readFile(livePendingPath, "utf8"), livePending);
});

test("revision idempotency rejects an authored symlink parent without touching production outputs", async (context) => {
  const current = await fixture(context);
  const request = {
    rootDir: current.rootDir,
    projectId: validProjectCreateInput.storyId,
    input: current.input,
    env: { RSP_PRODUCER_CONFIG: current.configPath },
    dependencies: current.dependencies,
  } as const;
  await createProjectRevisionCandidate(request);
  const scope = createProjectRevisionProductionScope({
    rootDir: current.rootDir,
    storyId: validProjectCreateInput.storyId,
    candidateId: computeProjectRevisionCandidateId(current.input),
  });
  const productionOutput = join(
    scope.producerWorkRoot,
    validProjectCreateInput.storyId,
    "completed-output.json",
  );
  await mkdir(dirname(productionOutput), { recursive: true });
  await writeFile(productionOutput, "production-output\n");
  const authoredProductionRoot = join(
    scope.projectSourceRoot,
    validProjectCreateInput.storyId,
    "production",
  );
  const redirectedProductionRoot = join(
    current.rootDir,
    "redirected-candidate-production",
  );
  await rename(authoredProductionRoot, redirectedProductionRoot);
  await symlink(redirectedProductionRoot, authoredProductionRoot);

  await assert.rejects(
    createProjectRevisionCandidate(request),
    /authored parent must be a real directory/u,
  );
  assert.equal(await readFile(productionOutput, "utf8"), "production-output\n");
  assert.equal((await lstat(authoredProductionRoot)).isSymbolicLink(), true);
});

test("revision validation rejects a stale Delivery build binding", async (context) => {
  const current = await fixture(context);
  await assert.rejects(
    validateProjectRevisionAuthoring({
      rootDir: current.rootDir,
      input: {
        ...current.input,
        baseDeliveryBuildId: `delivery-${"f".repeat(64)}`,
      },
      dependencies: current.dependencies,
    }),
    /base is stale/u,
  );
});

test("public Scene revision example validates a local patch against the exact current base", async (context) => {
  const current = await fixture(context);
  const revisionContext = await readProjectRevisionContext({
    rootDir: current.rootDir,
    projectId: current.input.storyId,
    dependencies: current.dependencies,
  });
  const source = await readFile(
    join(
      process.cwd(),
      "packages/create-axmorf-studio/template/.agents/skills/axmorf-video/references/authoring.md",
    ),
    "utf8",
  );
  const example = /(\/\/ axmorf-scene-revision-input[\s\S]*?)\n```/u.exec(
    source,
  )?.[1];
  assert.ok(example, "The shipped revision example must be executable");
  const scene = revisionContext.editable.scenes[0];
  assert.ok(scene);
  const revisedCompositionIntent =
    "Keep the title above the bookshelf with a clear reading margin.";
  const execute = new Function(
    "ProjectRevisionInputSchema",
    "revisionContext",
    "targetMeaningId",
    "revisedCompositionIntent",
    `${example}\nreturn input;`,
  );
  const input = ProjectRevisionInputSchema.parse(
    execute(
      ProjectRevisionInputSchema,
      revisionContext,
      scene.meaningId,
      revisedCompositionIntent,
    ),
  );
  assert.deepEqual(Object.keys(input.patch), ["scenes"]);
  assert.deepEqual(input.patch.scenes, [
    { ...scene, compositionIntent: revisedCompositionIntent },
  ]);
  assert.equal(input.baseRevisionId, revisionContext.baseRevisionId);
  assert.equal(input.baseDeliveryBuildId, revisionContext.baseDeliveryBuildId);
  const inputPath = "inputs/scene-revision-example.json";
  await writeFile(
    join(current.rootDir, inputPath),
    `${JSON.stringify(input)}\n`,
  );
  const validated = await runProjectRevisionValidateCli(
    ["--input", inputPath],
    {
      rootDir: current.rootDir,
      env: { RSP_PRODUCER_CONFIG: current.configPath },
      stdout: () => undefined,
      dependencies: current.dependencies,
    },
  );
  assert.deepEqual(validated.changedSections, ["scenes"]);
  assert.equal(validated.candidateId, computeProjectRevisionCandidateId(input));
  assert.throws(() =>
    parseProjectRevisionValidateArguments([
      "--project",
      current.input.storyId,
      "--input",
      inputPath,
    ]),
  );
  assert.throws(() => parseProjectRevisionValidateArguments(["--schema"]));
  assert.throws(() =>
    ProjectRevisionInputSchema.parse({ ...input, patch: { cover: {} } }),
  );
});

test("revision npm CLI accepts only repository-relative raw input files", async (context) => {
  const current = await fixture(context);
  const inputPath = join(current.rootDir, "inputs", "project-revision.json");
  await writeFile(inputPath, `${JSON.stringify(current.input)}\n`);
  const output: string[] = [];
  const cliContext = {
    rootDir: current.rootDir,
    env: { RSP_PRODUCER_CONFIG: current.configPath },
    stdout: (line: string) => output.push(line),
    dependencies: current.dependencies,
  } as const;
  await runProjectRevisionContextCli(
    ["--project", validProjectCreateInput.storyId],
    cliContext,
  );
  await runProjectRevisionValidateCli(
    ["--input", "inputs/project-revision.json"],
    cliContext,
  );
  assert.equal(
    JSON.parse(output[0] ?? "{}").status,
    "project-revision-context",
  );
  assert.equal(JSON.parse(output[1] ?? "{}").status, "project-revision-valid");
  assert.throws(() =>
    parseProjectRevisionValidateArguments(["--input", "../outside.json"]),
  );
  assert.throws(() =>
    parseProjectRevisionCreateArguments([
      "--project",
      validProjectCreateInput.storyId,
      "--input",
      "/tmp/outside.json",
    ]),
  );
});

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  DELIVERY_BUILD_POLICY_VERSION,
  NARRATION_MASTERING_POLICY,
  NarrationSpecSchema,
  RenderSpecSchema,
  SealedNarrationManifestSchema,
  StorySpecSchema,
  buildDeliveryPublish,
  buildDeliveryPublishing,
  buildMasteredNarrationManifest,
  buildProducerTaskSpec,
  buildProjectSoundPlan,
  buildPublishingIntent,
  buildSceneTemplateInstance,
  buildSilentScenePreset,
  computeGenerationInputFingerprint,
  computeSealedNarrationFingerprint,
  createDeliveryBuildId,
  createFingerprint,
  generateSemanticTiming,
  serializeCanonicalJson,
  type ProducerTaskKind,
} from "@axmorf/studio/contracts";
import { createTaskWorkspace } from "../../scripts/project-production/adapters/task-workspace";
import { checkTaskByKind } from "../../scripts/project-production/application/check-task";
import { checkSceneTemplateWorkspaceBinding } from "../../scripts/project-production/application/fixed-task-check";
import {
  encodeCanonicalPcmWav,
  sha256Bytes,
} from "../../scripts/narration/domain/pcm-wav";
import { validNarrationSpec, validRenderSpec } from "../fixtures/narrative";

const digest = (value: string) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}` as const;
const fakeDigest = (character: string) =>
  `sha256:${character.repeat(64)}` as const;
const revisionId = `revision-${"1".repeat(64)}` as const;

const story = StorySpecSchema.parse({
  schemaVersion: 3,
  storyId: "fixed-task-proof",
  title: "Fixed task proof",
  beats: [
    {
      kind: "narrated-scene",
      meaningId: "opening",
      narrativePurpose: "Prove fixed task validation.",
      ttsChunks: [{ chunkId: "opening-01", ttsText: "验证" }],
      explicitPauses: [],
    },
  ],
});
const narration = NarrationSpecSchema.parse(validNarrationSpec);
const render = RenderSpecSchema.parse({
  ...validRenderSpec,
  compositionId: "FixedTaskProof",
});
const wav = encodeCanonicalPcmWav(Buffer.alloc(2_000));
const wavChecksum = sha256Bytes(wav);
const sealInput = {
  schemaVersion: 1,
  storyId: story.storyId,
  narrationSpec: narration,
  generationInputFingerprint: computeGenerationInputFingerprint(
    story,
    narration,
  ),
  normalizationAlgorithmId: "pcm-s16le-normalize-v1",
  assemblyAlgorithmId: "ordered-pcm-concat-v1",
  canonicalPcm: {
    sampleRate: 48_000,
    channelLayout: "mono",
    sampleFormat: "s16le",
  },
  segments: [
    {
      kind: "chunk",
      chunkId: "opening-01",
      meaningId: "opening",
      ttsText: "验证",
      localPath:
        "public/projects/fixed-task-proof/narration/chunks/opening-01.wav",
      checksum: wavChecksum,
      pcm: {
        sampleRate: 48_000,
        channelLayout: "mono",
        sampleFormat: "s16le",
      },
      sampleFrameCount: 1_000,
    },
  ],
  completeAudio: {
    localPath: "public/projects/fixed-task-proof/narration/complete.wav",
    checksum: wavChecksum,
    pcm: {
      sampleRate: 48_000,
      channelLayout: "mono",
      sampleFormat: "s16le",
    },
    sampleFrameCount: 1_000,
  },
} as const;
const sealed = SealedNarrationManifestSchema.parse({
  ...sealInput,
  sealedNarrationFingerprint: computeSealedNarrationFingerprint(sealInput),
});
const mastered = buildMasteredNarrationManifest({
  storyId: story.storyId,
  sealedNarrationFingerprint: sealed.sealedNarrationFingerprint,
  sourceAudio: sealed.completeAudio,
  masteringPolicy: NARRATION_MASTERING_POLICY,
  outputAudio: {
    ...sealed.completeAudio,
    localPath:
      "public/projects/fixed-task-proof/narration-mastered/pending/complete.wav",
  },
  measurements: {
    integratedLoudnessLufs: -16,
    truePeakDbtp: -2,
    loudnessRangeLu: 5,
    thresholdLufs: -26,
  },
});
const timing = generateSemanticTiming({
  story,
  narration,
  render,
  sealedNarration: sealed,
});

const fixedDefinition: Readonly<
  Record<
    Exclude<
      ProducerTaskKind,
      "scene-owner" | "scene-template" | "global-visual-owner" | "cover-owner"
    >,
    {
      readonly policy: string;
      readonly inputIds: readonly string[];
      readonly outputs: readonly string[];
      readonly dependencyCount: number;
    }
  >
> = {
  "narration-chunk": {
    policy: "narration-chunk-validator-v1",
    inputIds: ["narration", "provider-attempt", "tts-chunk"],
    outputs: ["public/chunk.wav"],
    dependencyCount: 0,
  },
  "narration-seal": {
    policy: "narration-seal-validator-v1",
    inputIds: ["generation-input"],
    outputs: [
      "project/generated/sealed-narration.generated.json",
      "public/complete.wav",
    ],
    dependencyCount: 1,
  },
  "semantic-timing": {
    policy: "semantic-timing-validator-v1",
    inputIds: ["mastering-policy", "render"],
    outputs: [
      "project/generated/mastered-narration.generated.json",
      "project/generated/semantic-timing.generated.json",
      "public/mastered-complete.wav",
    ],
    dependencyCount: 1,
  },
  "composition-convergence": {
    policy: "composition-convergence-validator-v1",
    inputIds: ["render", "runtime", "sound", "story", "style"],
    outputs: ["project/convergence.json"],
    dependencyCount: 2,
  },
  "delivery-build": {
    policy: "delivery-build-validator-v1",
    inputIds: ["publishing", "render", "runtime"],
    outputs: ["project/publish.json"],
    dependencyCount: 2,
  },
};

const canonical = (value: unknown) => `${serializeCanonicalJson(value)}\n`;

const createFixedWorkspace = async ({
  rootDir,
  kind,
  context,
  files,
}: {
  readonly rootDir: string;
  readonly kind: keyof typeof fixedDefinition;
  readonly context: unknown;
  readonly files: Readonly<Record<string, string | Uint8Array>>;
}) => {
  const definition = fixedDefinition[kind];
  const contextBytes = canonical(context);
  const dependencyArtifacts = Array.from(
    { length: definition.dependencyCount },
    (_, index) => ({
      taskRevision:
        `task-${(index + 2).toString(16).repeat(64).slice(0, 64)}` as const,
      artifactFingerprint: fakeDigest((index + 2).toString(16)),
    }),
  ).sort((left, right) => left.taskRevision.localeCompare(right.taskRevision));
  const task = buildProducerTaskSpec({
    taskKind: kind,
    storyId: story.storyId,
    semanticId: null,
    revisionId,
    dependencyArtifacts,
    inputFingerprints: [
      ...definition.inputIds.map((id, index) => ({
        id,
        fingerprint: fakeDigest((index + 8).toString(16).slice(-1)),
      })),
      { id: "read:inputs/context.json", fingerprint: digest(contextBytes) },
    ].sort((left, right) => left.id.localeCompare(right.id)),
    declaredReadSet: ["inputs/context.json"],
    declaredOutputSet: [...definition.outputs].sort(),
    validatorPolicyVersion: definition.policy,
  });
  const workspace = await createTaskWorkspace({
    rootDir,
    task,
    seedFiles: { "inputs/context.json": contextBytes },
  });
  for (const [logicalPath, bytes] of Object.entries(files)) {
    const path = join(workspace, logicalPath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
  }
  return { task, workspace } as const;
};

test("fixed narration tasks validate canonical PCM, sealed manifests, mastering and timing bindings", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-fixed-narration-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const chunk = await createFixedWorkspace({
    rootDir,
    kind: "narration-chunk",
    context: {
      chunkId: "opening-01",
      meaningId: "opening",
      ttsText: "验证",
      normalizationPolicy: "pcm-s16le-normalize-v1",
    },
    files: { "public/chunk.wav": wav },
  });
  assert.equal(
    (await checkTaskByKind({ rootDir, taskRevision: chunk.task.taskRevision }))
      .status,
    "task-workspace-valid",
  );

  const seal = await createFixedWorkspace({
    rootDir,
    kind: "narration-seal",
    context: { story, narration, assemblyPolicy: "ordered-pcm-concat-v1" },
    files: {
      "project/generated/sealed-narration.generated.json": canonical(sealed),
      "public/complete.wav": wav,
    },
  });
  assert.equal(
    (await checkTaskByKind({ rootDir, taskRevision: seal.task.taskRevision }))
      .status,
    "task-workspace-valid",
  );

  const semantic = await createFixedWorkspace({
    rootDir,
    kind: "semantic-timing",
    context: {
      storyId: story.storyId,
      render,
      masteringPolicy: NARRATION_MASTERING_POLICY,
    },
    files: {
      "project/generated/mastered-narration.generated.json":
        canonical(mastered),
      "project/generated/semantic-timing.generated.json": canonical(timing),
      "public/mastered-complete.wav": wav,
    },
  });
  assert.equal(
    (
      await checkTaskByKind({
        rootDir,
        taskRevision: semantic.task.taskRevision,
      })
    ).status,
    "task-workspace-valid",
  );

  await writeFile(
    join(semantic.workspace, "public/mastered-complete.wav"),
    Buffer.from("not-wav"),
  );
  await assert.rejects(
    checkTaskByKind({ rootDir, taskRevision: semantic.task.taskRevision }),
    /WAV|PCM/u,
  );
});

test("fixed convergence and delivery tasks reject arbitrary JSON in authority outputs", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-fixed-convergence-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const sound = buildProjectSoundPlan({
    storyId: story.storyId,
    contributions: [],
  });
  const convergenceContext = {
    storyId: story.storyId,
    revisionId,
    render,
    sound,
  };
  const convergenceSeed = await createFixedWorkspace({
    rootDir,
    kind: "composition-convergence",
    context: convergenceContext,
    files: { "project/convergence.json": "{}\n" },
  });
  const convergenceResult = {
    schemaVersion: 1,
    contractVersion: "composition-convergence-result-v1",
    storyId: story.storyId,
    revisionId,
    taskRevision: convergenceSeed.task.taskRevision,
    dependencyArtifacts: convergenceSeed.task.dependencyArtifacts,
  };
  await writeFile(
    join(convergenceSeed.workspace, "project/convergence.json"),
    canonical(convergenceResult),
  );
  assert.equal(
    (
      await checkTaskByKind({
        rootDir,
        taskRevision: convergenceSeed.task.taskRevision,
      })
    ).status,
    "task-workspace-valid",
  );
  await writeFile(
    join(convergenceSeed.workspace, "project/convergence.json"),
    "{}\n",
  );
  await assert.rejects(
    checkTaskByKind({
      rootDir,
      taskRevision: convergenceSeed.task.taskRevision,
    }),
  );

  const publishingIntent = buildPublishingIntent({
    story,
    authored: {
      description: "A synchronous fixed task delivery.",
      topics: ["one", "two", "three", "four", "five", "six"],
      collectionId: "engineering",
      chapters: [{ meaningId: "opening", name: "开场" }],
    },
    publishingCollections: [
      {
        id: "engineering",
        name: "Engineering",
        description: "Engineering videos.",
      },
    ],
  });
  const identity = {
    storyId: story.storyId,
    revisionId,
    artifactSetFingerprint: fakeDigest("a"),
    compositionId: render.compositionId,
    fps: render.fps,
    frameCount: 90,
    width: render.width,
    height: render.height,
    policyVersion: DELIVERY_BUILD_POLICY_VERSION,
  } as const;
  const publishing = buildDeliveryPublishing({
    storyId: story.storyId,
    title: story.title,
    description: publishingIntent.description,
    topics: publishingIntent.topics,
    collection: publishingIntent.collection.name,
    outputFileName: "video.mp4",
    coverFileNames: { cover4x3: "cover-4x3.png", cover3x4: "cover-3x4.png" },
    fps: render.fps,
    frameCount: identity.frameCount,
    plannedDurationSeconds: identity.frameCount / render.fps,
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
    deliveryBuildId: createDeliveryBuildId(identity),
    artifacts: {
      video: {
        repositoryPath: `deliveries/${story.storyId}/video.mp4`,
        checksum: fakeDigest("b"),
        sizeBytes: 1,
        media: {
          codec: "h264",
          audioCodec: "aac",
          audioChannels: 2,
          width: render.width,
          height: render.height,
          fps: render.fps,
          frameCount: identity.frameCount,
          decodedToEof: true,
        },
      },
      cover4x3: {
        repositoryPath: `deliveries/${story.storyId}/cover-4x3.png`,
        checksum: fakeDigest("c"),
        sizeBytes: 1,
        media: {
          imageFormat: "png",
          width: 1600,
          height: 1200,
          decodedToEof: true,
        },
      },
      cover3x4: {
        repositoryPath: `deliveries/${story.storyId}/cover-3x4.png`,
        checksum: fakeDigest("d"),
        sizeBytes: 1,
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
  const delivery = await createFixedWorkspace({
    rootDir,
    kind: "delivery-build",
    context: { storyId: story.storyId, revisionId, render, publishingIntent },
    files: { "project/publish.json": canonical(publish) },
  });
  assert.equal(
    (
      await checkTaskByKind({
        rootDir,
        taskRevision: delivery.task.taskRevision,
      })
    ).status,
    "task-workspace-valid",
  );
  await writeFile(join(delivery.workspace, "project/publish.json"), "{}\n");
  await assert.rejects(
    checkTaskByKind({ rootDir, taskRevision: delivery.task.taskRevision }),
  );
});

test("Scene template binding rejects copied-byte and Renderer graph tampering using workspace files only", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-fixed-template-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const scenePrefix = `src/projects/${story.storyId}/scenes/intro/`;
  const renderer =
    "import {value} from './value'; export default () => value;\n";
  const value = "export const value = null;\n";
  const graphFiles = [
    { sourcePath: `${scenePrefix}Renderer.tsx`, checksum: digest(renderer) },
    { sourcePath: `${scenePrefix}value.ts`, checksum: digest(value) },
  ];
  const rendererPath = `${scenePrefix}Renderer.tsx`;
  const instance = buildSceneTemplateInstance({
    schemaVersion: 1,
    storyId: story.storyId,
    meaningId: "intro",
    templateId: "intro-template",
    templateFingerprint: fakeDigest("1"),
    rendererSourceGraphFingerprint: createFingerprint({
      namespace: "renderer-source-graph",
      version: 1,
      value: { rendererPath, files: graphFiles },
    }),
    durationInFrames: 30,
    visualIntent: "Show the intro.",
    soundIntent: "Remain silent.",
    resourceIds: [],
    soundCues: [],
    copiedSourceFiles: graphFiles.map(
      ({ sourcePath: repositoryPath, checksum }) => ({
        repositoryPath,
        checksum,
      }),
    ),
    copiedAssetFiles: [],
    visual: {
      semanticObjective: "Introduce the story.",
      subject: "Title",
      primaryAction: "Reveal",
      causalLink: "Start",
      primaryComposition: "Center",
      styleRealization: ["Clean"],
      continuity: "Lead into content",
      fallbackIntent: "Keep title",
      orderedShotIds: ["shot-one"],
      visualResourceIds: [],
    },
    anchors: [],
    shots: [
      {
        shotId: "shot-one",
        order: 0,
        primaryRange: { startFrame: 0, endFrame: 30 },
        purpose: "Reveal",
        action: "Fade",
        syncAnchorIds: [],
        visualResourceIds: [],
      },
    ],
  });
  const instanceBytes = canonical(instance);
  const preset = buildSilentScenePreset({
    presetId: instance.templateId,
    durationInFrames: instance.durationInFrames,
    visualIntent: instance.visualIntent,
    soundIntent: instance.soundIntent,
    resourceIds: instance.resourceIds,
    implementation: {
      kind: "template-copy",
      templateId: instance.templateId,
      templateFingerprint: instance.templateFingerprint,
      instanceFingerprint: instance.instanceFingerprint,
      rendererSourceFingerprint: instance.rendererSourceGraphFingerprint,
      soundCues: instance.soundCues,
    },
  });
  const task = buildProducerTaskSpec({
    taskKind: "scene-template",
    storyId: story.storyId,
    semanticId: "intro",
    revisionId,
    dependencyArtifacts: [],
    inputFingerprints: [
      { id: "read:inputs/context.json", fingerprint: digest("{}\n") },
    ],
    declaredReadSet: ["inputs/context.json"],
    declaredOutputSet: [
      "src/Renderer.tsx",
      "src/generated/reference-fidelity.generated.json",
      "src/scene-template-instance.json",
      "src/selected-resources.json",
      "src/shot-plan.json",
      "src/shot-recipe-selection.json",
      "src/sound-plan.json",
      "src/sync-anchors.json",
      "src/value.ts",
      "src/visual-plan.json",
    ].sort(),
    validatorPolicyVersion: "scene-template-validator-v2",
  });
  const workspace = join(rootDir, "workspace");
  await mkdir(join(workspace, "src"), { recursive: true });
  await mkdir(join(workspace, "inputs"), { recursive: true });
  await writeFile(
    join(workspace, "inputs/context.json"),
    canonical({
      scene: {
        beat: {
          kind: "silent-scene",
          meaningId: "intro",
          narrativePurpose: "Introduce the story.",
          preset,
        },
      },
    }),
  );
  await writeFile(join(workspace, "src/Renderer.tsx"), renderer);
  await writeFile(join(workspace, "src/value.ts"), value);
  await writeFile(
    join(workspace, "src/scene-template-instance.json"),
    instanceBytes,
  );
  assert.equal(
    (await checkSceneTemplateWorkspaceBinding({ workspace, task }))
      .instanceFingerprint,
    instance.instanceFingerprint,
  );
  await writeFile(join(workspace, "src/value.ts"), "export const value = 1;\n");
  await assert.rejects(
    checkSceneTemplateWorkspaceBinding({ workspace, task }),
    /checksum drifted/u,
  );
});

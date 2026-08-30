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
  AuthoringValidationError,
  buildDeliveryPublish,
  buildDeliveryPublishing,
  buildProductionRevision,
  createDeliveryBuildId,
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
  parseProjectRevisionCreateArguments,
  parseProjectRevisionValidateArguments,
  runProjectRevisionContextCli,
  runProjectRevisionValidateCli,
} from "../../scripts/projects/revision";
import { computeProjectRevisionCandidateId } from "../../packages/studio/src/contracts/project-revision";
import { createProjectRevisionProductionScope } from "../../scripts/project-production/application/production-scope";
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

const writeCurrentDelivery = async (rootDir: string) => {
  const identity = {
    storyId: validProjectCreateInput.storyId,
    revisionId: revision.revisionId,
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

const fixture = async (context: {
  after: (callback: () => Promise<void>) => void;
}) => {
  const prepared = await prepareProjectCreateFixture();
  context.after(() => rm(prepared.rootDir, { recursive: true, force: true }));
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

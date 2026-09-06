import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  DELIVERY_BUILD_POLICY_VERSION,
  RenderSpecSchema,
  Sha256DigestSchema,
  StorySpecSchema,
  buildArtifactAttestation,
  buildDeliveryPublish,
  buildDeliveryPublishing,
  buildProducerTaskSpec,
  buildProjectSoundPlan,
  buildPublishingIntent,
  createDeliveryBuildId,
  serializeCanonicalJson,
  type ArtifactAttestation,
  type ProducerTaskSpec,
} from "@axmorf/studio/contracts";
import {
  commitConvergenceFixedArtifact,
  convergeProjectProduction,
  type ConvergenceDependencies,
} from "../../scripts/project-production/application/converge-artifacts";
import { checksumBytes } from "../../scripts/project-production/adapters/project-input-snapshot";
import { validRenderSpec, validStorySpec } from "../fixtures/narrative";

const SHA = `sha256:${"a".repeat(64)}`;
const SHA_DIGEST = Sha256DigestSchema.parse(SHA);
const REVISION = `revision-${"1".repeat(64)}`;
const NEXT_REVISION = `revision-${"2".repeat(64)}`;
const ATTEMPT_ID = "00000000-0000-4000-8000-000000000001";
const acquireTestLock: NonNullable<
  ConvergenceDependencies["acquireLock"]
> = async () => ({ release: async () => undefined });

const task = (
  taskKind:
    | "scene-owner"
    | "global-visual-owner"
    | "semantic-timing"
    | "composition-convergence"
    | "delivery-build",
  dependencyArtifacts: ProducerTaskSpec["dependencyArtifacts"] = [],
): ProducerTaskSpec =>
  buildProducerTaskSpec({
    taskKind,
    storyId: "story-example",
    semanticId: taskKind === "scene-owner" ? "scene-one" : null,
    revisionId: REVISION,
    dependencyArtifacts,
    inputFingerprints: [{ id: "read:inputs/context.json", fingerprint: SHA }],
    declaredReadSet: ["inputs/context.json"],
    declaredOutputSet: [
      taskKind === "composition-convergence"
        ? "project/convergence.json"
        : taskKind === "delivery-build"
          ? "project/publish.json"
          : "src/Renderer.tsx",
    ],
    validatorPolicyVersion: `${taskKind}-validator-v1`,
  });

const sceneTask = (meaningId: string): ProducerTaskSpec =>
  buildProducerTaskSpec({
    taskKind: "scene-owner",
    storyId: "story-example",
    semanticId: meaningId,
    revisionId: REVISION,
    dependencyArtifacts: [],
    inputFingerprints: [{ id: "brief", fingerprint: SHA }],
    declaredReadSet: [],
    declaredOutputSet: ["src/Renderer.tsx"],
    validatorPolicyVersion: "scene-owner-validator-v3",
  });

const attestation = (producerTask: ProducerTaskSpec): ArtifactAttestation =>
  buildArtifactAttestation({
    storyId: producerTask.storyId,
    taskKind: producerTask.taskKind,
    semanticId: producerTask.semanticId,
    taskRevision: producerTask.taskRevision,
    validatorPolicyVersion: producerTask.validatorPolicyVersion,
    dependencyArtifacts: producerTask.dependencyArtifacts,
    outputManifest: [
      {
        logicalPath: producerTask.declaredOutputSet[0],
        checksum: SHA,
        sizeBytes: 1,
        kind: "file",
      },
    ],
  });

const sceneAttestation = (
  producerTask: ProducerTaskSpec,
  checksum: ArtifactAttestation["outputManifest"][number]["checksum"],
): ArtifactAttestation =>
  buildArtifactAttestation({
    storyId: producerTask.storyId,
    taskKind: producerTask.taskKind,
    semanticId: producerTask.semanticId,
    taskRevision: producerTask.taskRevision,
    validatorPolicyVersion: producerTask.validatorPolicyVersion,
    dependencyArtifacts: producerTask.dependencyArtifacts,
    outputManifest: [
      {
        logicalPath: "src/Renderer.tsx",
        checksum,
        sizeBytes: 1,
        kind: "file",
      },
    ],
  });

const plannedProduction = (
  tasks: readonly ProducerTaskSpec[],
  revisionId = REVISION,
) =>
  ({
    revision: { storyId: "story-example", revisionId },
    plan: {
      artifactSetFingerprint: SHA,
      tasks: tasks.map((producerTask) => ({
        taskRevision: producerTask.taskRevision,
        action: "reuse",
      })),
      summary: {
        reusedTaskCount: tasks.length,
        dirtyAgentTaskCount: 0,
        dirtyFixedTaskCount: 0,
        blockedTaskCount: 0,
      },
    },
    tasks,
    inputs: {
      projectId: "story-example",
      brief: { targetDurationSeconds: 30 },
      story: { beats: [] },
      timing: { durationInFrames: 960 },
      render: { fps: 30, leadInFrames: 0, tailFrames: 0 },
      sound: { contributions: [] },
      publishingIntent: { description: "Example" },
      sceneInputs: [
        {
          meaningId: "scene-one",
          taskInput: { meaningId: "scene-one" },
        },
      ],
    },
  }) as unknown as Awaited<
    ReturnType<NonNullable<ConvergenceDependencies["buildCurrentPlan"]>>
  >;

const injectedPlan = (planned: ReturnType<typeof plannedProduction>) =>
  (async () => planned) as NonNullable<
    ConvergenceDependencies["buildCurrentPlan"]
  >;

const convergenceStages = (ownerTask: ProducerTaskSpec) => {
  const compositionTask = task("composition-convergence");
  const compositionArtifact = attestation(compositionTask);
  const initialDeliveryTask = task("delivery-build");
  const boundDeliveryTask = task("delivery-build", [
    {
      taskRevision: compositionTask.taskRevision,
      artifactFingerprint: compositionArtifact.artifactFingerprint,
    },
  ]);
  return {
    compositionTask,
    initial: plannedProduction([
      ownerTask,
      compositionTask,
      initialDeliveryTask,
    ]),
    withComposition: plannedProduction([
      ownerTask,
      compositionTask,
      boundDeliveryTask,
    ]),
  } as const;
};

const fakePrepareProject = (async () => ({})) as unknown as NonNullable<
  ConvergenceDependencies["prepareProject"]
>;

test("convergence rejects exact duplicate Scene source graphs before materialization", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "axmorf-converge-exact-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const first = sceneTask("scene-one");
  const second = sceneTask("scene-two");
  let materializeCalls = 0;

  await assert.rejects(
    convergeProjectProduction({
      rootDir,
      projectId: "story-example",
      revisionId: REVISION,
      attemptId: ATTEMPT_ID,
      dependencies: {
        acquireLock: acquireTestLock,
        buildCurrentPlan: injectedPlan(
          plannedProduction([first, second], REVISION),
        ),
        inspectArtifact: async ({ task: inspected }) =>
          sceneAttestation(inspected, SHA_DIGEST),
        materializeOwnerArtifacts: (async () => {
          materializeCalls += 1;
        }) as NonNullable<ConvergenceDependencies["materializeOwnerArtifacts"]>,
        appendAttempt: (async () => undefined) as unknown as NonNullable<
          ConvergenceDependencies["appendAttempt"]
        >,
      },
    }),
    /exact duplicates/u,
  );
  assert.equal(materializeCalls, 0);
});

test("convergence rejects token-normalized duplicate Scene graphs before materialization", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "axmorf-converge-normalized-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const first = sceneTask("scene-one");
  const second = sceneTask("scene-two");
  const checksums = new Map([
    [first.taskRevision, Sha256DigestSchema.parse(`sha256:${"1".repeat(64)}`)],
    [second.taskRevision, Sha256DigestSchema.parse(`sha256:${"2".repeat(64)}`)],
  ]);
  let materializeCalls = 0;

  await assert.rejects(
    convergeProjectProduction({
      rootDir,
      projectId: "story-example",
      revisionId: REVISION,
      attemptId: ATTEMPT_ID,
      dependencies: {
        acquireLock: acquireTestLock,
        buildCurrentPlan: injectedPlan(
          plannedProduction([first, second], REVISION),
        ),
        inspectArtifact: async ({ task: inspected }) =>
          sceneAttestation(inspected, checksums.get(inspected.taskRevision)!),
        readSceneArtifactSources: async ({ task: inspected }) => [
          {
            path: "Renderer.tsx",
            source:
              inspected.semanticId === "scene-one"
                ? "export default()=> <div data-value={1}/>;"
                : "// formatting only\nexport default () => <div data-value={1} />;",
            checksum: checksums.get(inspected.taskRevision)!,
          },
        ],
        materializeOwnerArtifacts: (async () => {
          materializeCalls += 1;
        }) as NonNullable<ConvergenceDependencies["materializeOwnerArtifacts"]>,
        appendAttempt: (async () => undefined) as unknown as NonNullable<
          ConvergenceDependencies["appendAttempt"]
        >,
      },
    }),
    /normalize to duplicates/u,
  );
  assert.equal(materializeCalls, 0);
});

test("converge-owned fixed promotion validates directly without a task workspace", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-converge-fixed-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const render = RenderSpecSchema.parse(validRenderSpec);
  const sound = buildProjectSoundPlan({
    storyId: "story-example",
    contributions: [],
  });
  const contextBytes = `${serializeCanonicalJson({
    storyId: "story-example",
    revisionId: REVISION,
    render,
    sound,
  })}\n`;
  const fixedTask = buildProducerTaskSpec({
    taskKind: "composition-convergence",
    storyId: "story-example",
    semanticId: null,
    revisionId: REVISION,
    dependencyArtifacts: [
      {
        taskRevision: `task-${"2".repeat(64)}`,
        artifactFingerprint: `sha256:${"2".repeat(64)}`,
      },
      {
        taskRevision: `task-${"3".repeat(64)}`,
        artifactFingerprint: `sha256:${"3".repeat(64)}`,
      },
    ],
    inputFingerprints: [
      {
        id: "read:inputs/context.json",
        fingerprint: checksumBytes(new TextEncoder().encode(contextBytes)),
      },
      { id: "render", fingerprint: SHA },
      { id: "runtime", fingerprint: SHA },
      { id: "sound", fingerprint: SHA },
      { id: "story", fingerprint: SHA },
      { id: "style", fingerprint: SHA },
    ],
    declaredReadSet: ["inputs/context.json"],
    declaredOutputSet: ["project/convergence.json"],
    validatorPolicyVersion: "composition-convergence-validator-v1",
  });
  const resultBytes = `${serializeCanonicalJson({
    schemaVersion: 1,
    contractVersion: "composition-convergence-result-v1",
    storyId: "story-example",
    revisionId: REVISION,
    taskRevision: fixedTask.taskRevision,
    dependencyArtifacts: fixedTask.dependencyArtifacts,
  })}\n`;

  const committed = await commitConvergenceFixedArtifact({
    rootDir,
    task: fixedTask,
    files: {
      "inputs/context.json": contextBytes,
      "project/convergence.json": resultBytes,
    },
  });

  assert.equal(committed.taskRevision, fixedTask.taskRevision);
  await assert.rejects(
    commitConvergenceFixedArtifact({
      rootDir,
      task: fixedTask,
      files: {
        "inputs/context.json": contextBytes,
        "project/convergence.json": "{}\n",
      },
    }),
    /result is invalid/u,
  );

  const story = StorySpecSchema.parse(validStorySpec);
  const publishingIntent = buildPublishingIntent({
    story,
    authored: {
      description: "A synchronously verified delivery.",
      topics: ["one", "two", "three", "four", "five", "six"],
      collectionId: "engineering",
      chapters: [
        { meaningId: "opening", name: "开场" },
        { meaningId: "conclusion", name: "结论" },
      ],
    },
    publishingCollections: [
      {
        id: "engineering",
        name: "Engineering",
        description: "Engineering videos.",
      },
    ],
  });
  const deliveryContextBytes = `${serializeCanonicalJson({
    storyId: "story-example",
    revisionId: REVISION,
    render,
    publishingIntent,
  })}\n`;
  const deliveryTask = buildProducerTaskSpec({
    taskKind: "delivery-build",
    storyId: "story-example",
    semanticId: null,
    revisionId: REVISION,
    dependencyArtifacts: [
      {
        taskRevision: fixedTask.taskRevision,
        artifactFingerprint: committed.artifactFingerprint,
      },
      {
        taskRevision: `task-${"4".repeat(64)}`,
        artifactFingerprint: `sha256:${"4".repeat(64)}`,
      },
    ].sort((left, right) =>
      left.taskRevision.localeCompare(right.taskRevision),
    ),
    inputFingerprints: [
      { id: "publishing", fingerprint: SHA },
      {
        id: "read:inputs/context.json",
        fingerprint: checksumBytes(
          new TextEncoder().encode(deliveryContextBytes),
        ),
      },
      { id: "render", fingerprint: SHA },
      { id: "runtime", fingerprint: SHA },
    ],
    declaredReadSet: ["inputs/context.json"],
    declaredOutputSet: ["project/publish.json"],
    validatorPolicyVersion: "delivery-build-validator-v1",
  });
  const identity = {
    storyId: "story-example",
    revisionId: REVISION,
    artifactSetFingerprint: SHA,
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
    coverFileNames: {
      cover4x3: "cover-4x3.png",
      cover3x4: "cover-3x4.png",
    },
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
      {
        meaningId: "conclusion",
        name: "结论",
        startFrame: 45,
        timecode: "00:00:01",
      },
    ],
  });
  const publish = buildDeliveryPublish({
    ...identity,
    deliveryBuildId: createDeliveryBuildId(identity),
    artifacts: {
      video: {
        repositoryPath: "deliveries/story-example/video.mp4",
        checksum: SHA,
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
        repositoryPath: "deliveries/story-example/cover-4x3.png",
        checksum: SHA,
        sizeBytes: 1,
        media: {
          imageFormat: "png",
          width: 1600,
          height: 1200,
          decodedToEof: true,
        },
      },
      cover3x4: {
        repositoryPath: "deliveries/story-example/cover-3x4.png",
        checksum: SHA,
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
  const deliveryCommitted = await commitConvergenceFixedArtifact({
    rootDir,
    task: deliveryTask,
    files: {
      "inputs/context.json": deliveryContextBytes,
      "project/publish.json": `${serializeCanonicalJson(publish)}\n`,
    },
  });
  assert.equal(deliveryCommitted.taskRevision, deliveryTask.taskRevision);
  assert.deepEqual(await readdir(rootDir), [".producer-artifacts"]);
});

test("stale revision is a read-only replan with zero provider, workspace, attempt creation, or live write", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-converge-stale-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const calls = {
    inspect: 0,
    materialize: 0,
    delivery: 0,
    provider: 0,
    workspace: 0,
  };
  const result = await convergeProjectProduction({
    rootDir,
    projectId: "story-example",
    revisionId: REVISION,
    attemptId: ATTEMPT_ID,
    dependencies: {
      acquireLock: acquireTestLock,
      buildCurrentPlan: injectedPlan(
        plannedProduction([task("scene-owner")], NEXT_REVISION),
      ),
      inspectArtifact: (async () => {
        calls.inspect += 1;
        return null;
      }) as NonNullable<ConvergenceDependencies["inspectArtifact"]>,
      materializeOwnerArtifacts: (async () => {
        calls.materialize += 1;
      }) as NonNullable<ConvergenceDependencies["materializeOwnerArtifacts"]>,
      buildDelivery: (async () => {
        calls.delivery += 1;
        throw new Error("unreachable");
      }) as NonNullable<ConvergenceDependencies["buildDelivery"]>,
      prepareNarration: async () => {
        calls.provider += 1;
        throw new Error("converge must not call a provider");
      },
      createWorkspace: async () => {
        calls.workspace += 1;
        throw new Error("converge must not create a task workspace");
      },
    } as ConvergenceDependencies,
  });

  assert.deepEqual(result, {
    status: "producer-revision-stale",
    currentRevisionId: NEXT_REVISION,
    attemptRecorded: false,
  });
  assert.deepEqual(calls, {
    inspect: 0,
    materialize: 0,
    delivery: 0,
    provider: 0,
    workspace: 0,
  });
  assert.deepEqual(await readdir(rootDir), []);
});

test("an incomplete revision causes zero provider, workspace, attempt creation, or live write", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-converge-incomplete-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const sceneTask = task("scene-owner");
  const timingTask = task("semantic-timing");
  const calls = { materialize: 0, delivery: 0, provider: 0, workspace: 0 };
  const result = await convergeProjectProduction({
    rootDir,
    projectId: "story-example",
    revisionId: REVISION,
    attemptId: ATTEMPT_ID,
    dependencies: {
      acquireLock: acquireTestLock,
      buildCurrentPlan: injectedPlan(
        plannedProduction([sceneTask, timingTask]),
      ),
      inspectArtifact: (async ({ task: inspected }) =>
        inspected.taskRevision === sceneTask.taskRevision
          ? attestation(sceneTask)
          : null) as NonNullable<ConvergenceDependencies["inspectArtifact"]>,
      materializeOwnerArtifacts: (async () => {
        calls.materialize += 1;
      }) as NonNullable<ConvergenceDependencies["materializeOwnerArtifacts"]>,
      buildDelivery: (async () => {
        calls.delivery += 1;
        throw new Error("unreachable");
      }) as NonNullable<ConvergenceDependencies["buildDelivery"]>,
      prepareNarration: async () => {
        calls.provider += 1;
        throw new Error("converge must not call a provider");
      },
      createWorkspace: async () => {
        calls.workspace += 1;
        throw new Error("converge must not create a task workspace");
      },
    } as ConvergenceDependencies,
  });

  assert.equal(result.status, "producer-artifacts-incomplete");
  assert.equal(result.missingTaskRevision, timingTask.taskRevision);
  assert.deepEqual(calls, {
    materialize: 0,
    delivery: 0,
    provider: 0,
    workspace: 0,
  });
  assert.deepEqual(await readdir(rootDir), []);
});

test("a lost diagnostic write does not change stale revision authority", async () => {
  const result = await convergeProjectProduction({
    rootDir: "/fixture",
    projectId: "story-example",
    revisionId: REVISION,
    attemptId: ATTEMPT_ID,
    dependencies: {
      acquireLock: acquireTestLock,
      buildCurrentPlan: injectedPlan(
        plannedProduction([task("scene-owner")], NEXT_REVISION),
      ),
      appendAttempt: (async () => {
        throw new Error("diagnostic store unavailable");
      }) as NonNullable<ConvergenceDependencies["appendAttempt"]>,
    },
  });

  assert.equal(result.status, "producer-revision-stale");
  assert.equal(result.attemptRecorded, false);
});

test("prepare-generated ScenePackage bytes remain exact through synchronous delivery", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-converge-prepare-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const sceneTask = task("scene-owner");
  const stages = convergenceStages(sceneTask);
  let planCall = 0;
  const calls = {
    materialize: 0,
    verify: 0,
    delivery: 0,
    provider: 0,
    workspace: 0,
  };
  const terminal: Array<{
    status: string;
    diagnosticCode: string | null;
    deliveryMedia: readonly string[];
  }> = [];
  const order: string[] = [];
  const scenePackageBytes = new TextEncoder().encode(
    '{"contractVersion":"scene-package-current"}\n',
  );
  const result = await convergeProjectProduction({
    rootDir,
    projectId: "story-example",
    revisionId: REVISION,
    attemptId: ATTEMPT_ID,
    dependencies: {
      acquireLock: (async () => {
        order.push("acquire");
        return {
          release: async () => {
            order.push("release");
          },
        };
      }) as NonNullable<ConvergenceDependencies["acquireLock"]>,
      buildCurrentPlan: (async () => {
        planCall += 1;
        return planCall === 1 ? stages.initial : stages.withComposition;
      }) as NonNullable<ConvergenceDependencies["buildCurrentPlan"]>,
      inspectArtifact: (async () => attestation(sceneTask)) as NonNullable<
        ConvergenceDependencies["inspectArtifact"]
      >,
      materializeOwnerArtifacts: (async ({ artifacts }) => {
        order.push("materialize");
        calls.materialize += 1;
        assert.equal(artifacts.length, 1);
      }) as NonNullable<ConvergenceDependencies["materializeOwnerArtifacts"]>,
      verifyMaterializedOwnerArtifacts: (async ({ additionalSceneFiles }) => {
        calls.verify += 1;
        if (calls.verify === 1) {
          assert.equal(additionalSceneFiles, undefined);
        } else {
          const manifest = additionalSceneFiles
            ?.get("scene-one")
            ?.get("generated/scene-package.generated.json");
          assert.equal(manifest?.sizeBytes, scenePackageBytes.byteLength);
          assert.equal(manifest?.checksum, checksumBytes(scenePackageBytes));
        }
      }) as NonNullable<
        ConvergenceDependencies["verifyMaterializedOwnerArtifacts"]
      >,
      prepareProject: (async () => {
        const generated = join(
          rootDir,
          "src/projects/story-example/scenes/scene-one/generated",
        );
        await mkdir(generated, { recursive: true });
        await writeFile(
          join(generated, "scene-package.generated.json"),
          scenePackageBytes,
        );
        return {};
      }) as unknown as NonNullable<ConvergenceDependencies["prepareProject"]>,
      commitFixedArtifact: (async ({ task: fixedTask }) =>
        attestation(fixedTask)) as NonNullable<
        ConvergenceDependencies["commitFixedArtifact"]
      >,
      readDeliveryPublish: async () => new TextEncoder().encode("{}\n"),
      buildDelivery: (async ({ dependencies }) => {
        order.push("delivery");
        calls.delivery += 1;
        await dependencies?.verifyMaterialized?.();
        await dependencies?.verifyMaterialized?.();
        return {
          projectId: "story-example",
          deliveryBuildId: `delivery-${"3".repeat(64)}`,
          status: "project-production-complete",
          noOp: false,
          deliveryPath: "deliveries/story-example",
          reused: { video: false, cover4x3: false, cover3x4: false },
        };
      }) as NonNullable<ConvergenceDependencies["buildDelivery"]>,
      appendAttempt: (async ({ result: terminalResult }) => {
        terminal.push({
          status: terminalResult.status,
          diagnosticCode: terminalResult.diagnosticCode,
          deliveryMedia: terminalResult.deliveryMedia,
        });
        return {};
      }) as NonNullable<ConvergenceDependencies["appendAttempt"]>,
      prepareNarration: async () => {
        calls.provider += 1;
        throw new Error("converge must not call a provider");
      },
      createWorkspace: async () => {
        calls.workspace += 1;
        throw new Error("converge must not create a task workspace");
      },
    } as ConvergenceDependencies,
  });

  assert.equal(result.status, "project-production-complete");
  assert.equal(result.durationBudget.actualTotalSeconds, 32);
  assert.equal(result.durationBudget.deltaSeconds, 2);
  assert.equal(result.durationBudget.comparison, "longer-than-target");
  assert.equal(planCall, 3);
  assert.deepEqual(calls, {
    materialize: 1,
    verify: 6,
    delivery: 1,
    provider: 0,
    workspace: 0,
  });
  assert.deepEqual(order, ["acquire", "materialize", "delivery", "release"]);
  assert.deepEqual(terminal, [
    {
      status: "verified",
      diagnosticCode: null,
      deliveryMedia: ["video", "cover-4x3", "cover-3x4"],
    },
  ]);
});

test("synchronous delivery failure is terminal and never reports completion", async () => {
  const sceneTask = task("scene-owner");
  const stages = convergenceStages(sceneTask);
  let planCall = 0;
  const terminal: Array<{
    status: string;
    diagnosticCode: string | null;
  }> = [];
  await assert.rejects(
    () =>
      convergeProjectProduction({
        rootDir: "/fixture",
        projectId: "story-example",
        revisionId: REVISION,
        attemptId: ATTEMPT_ID,
        dependencies: {
          acquireLock: acquireTestLock,
          buildCurrentPlan: (async () => {
            planCall += 1;
            return planCall === 1 ? stages.initial : stages.withComposition;
          }) as NonNullable<ConvergenceDependencies["buildCurrentPlan"]>,
          inspectArtifact: (async () => attestation(sceneTask)) as NonNullable<
            ConvergenceDependencies["inspectArtifact"]
          >,
          materializeOwnerArtifacts: (async () => undefined) as NonNullable<
            ConvergenceDependencies["materializeOwnerArtifacts"]
          >,
          verifyMaterializedOwnerArtifacts: (async () =>
            undefined) as NonNullable<
            ConvergenceDependencies["verifyMaterializedOwnerArtifacts"]
          >,
          prepareProject: fakePrepareProject,
          readPreparedScenePackage: async () =>
            new TextEncoder().encode("scene-package\n"),
          commitFixedArtifact: (async ({ task: fixedTask }) =>
            attestation(fixedTask)) as NonNullable<
            ConvergenceDependencies["commitFixedArtifact"]
          >,
          buildDelivery: (async () => {
            throw new Error("render failed");
          }) as NonNullable<ConvergenceDependencies["buildDelivery"]>,
          appendAttempt: (async ({ result: terminalResult }) => {
            terminal.push({
              status: terminalResult.status,
              diagnosticCode: terminalResult.diagnosticCode,
            });
            return {};
          }) as NonNullable<ConvergenceDependencies["appendAttempt"]>,
        },
      }),
    /render failed/u,
  );
  assert.deepEqual(terminal, [
    {
      status: "failed",
      diagnosticCode: "project-production-convergence-failed",
    },
  ]);
});

test("one repository lock covers the complete convergence orchestration", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-converge-lock-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  let unblockPlan: (() => void) | undefined;
  let markPlanStarted: (() => void) | undefined;
  const planStarted = new Promise<void>((resolve) => {
    markPlanStarted = resolve;
  });
  const planGate = new Promise<void>((resolve) => {
    unblockPlan = resolve;
  });
  const planned = plannedProduction([task("scene-owner")], NEXT_REVISION);
  const blockingPlan = (async () => {
    markPlanStarted?.();
    await planGate;
    return planned;
  }) as NonNullable<ConvergenceDependencies["buildCurrentPlan"]>;
  const appendAttempt = (async () => ({})) as unknown as NonNullable<
    ConvergenceDependencies["appendAttempt"]
  >;
  const first = convergeProjectProduction({
    rootDir,
    projectId: "story-example",
    revisionId: REVISION,
    attemptId: ATTEMPT_ID,
    dependencies: { buildCurrentPlan: blockingPlan, appendAttempt },
  });
  await planStarted;

  await assert.rejects(
    () =>
      convergeProjectProduction({
        rootDir,
        projectId: "story-example",
        revisionId: REVISION,
        attemptId: ATTEMPT_ID,
        dependencies: {
          buildCurrentPlan: injectedPlan(planned),
          appendAttempt,
        },
      }),
    /Another Project operation is already active/u,
  );
  unblockPlan?.();
  assert.equal((await first).status, "producer-revision-stale");

  const afterRelease = await convergeProjectProduction({
    rootDir,
    projectId: "story-example",
    revisionId: REVISION,
    attemptId: ATTEMPT_ID,
    dependencies: { buildCurrentPlan: injectedPlan(planned), appendAttempt },
  });
  assert.equal(afterRelease.status, "producer-revision-stale");
});

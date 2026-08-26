import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  RenderSpecSchema,
  buildArtifactAttestation,
  buildProducerConfig,
  buildProducerTaskSpec,
  buildProjectSoundPlan,
  buildSourceCurrentAttestation,
  serializeCanonicalJson,
  type ArtifactAttestation,
  type ProducerTaskSpec,
  type SourceCurrentAttestation,
} from "../../src/contracts";
import {
  commitConvergenceFixedArtifact,
  convergeProjectProduction,
  type ConvergenceDependencies,
} from "../../scripts/project-production/application/converge-artifacts";
import {
  createRepositoryProductionLocations,
  createRuntimeExecutionResources,
} from "../../scripts/project-production/application/production-locations";
import { checksumBytes } from "../../scripts/project-production/adapters/project-input-snapshot";
import { validProjectCreateProducerConfig } from "../fixtures/project-create";
import { validRenderSpec } from "../fixtures/narrative";

const SHA = `sha256:${"a".repeat(64)}`;
const RUNTIME_FINGERPRINT = `sha256:${"b".repeat(64)}`;
const RUNTIME = createRuntimeExecutionResources({
  rendererRuntimeFingerprint: RUNTIME_FINGERPRINT,
  browserExecutable: "/fixture/runtime/chrome",
  binariesDirectory: "/fixture/runtime/bin",
  ffmpegExecutable: "/fixture/runtime/bin/ffmpeg",
  ffprobeExecutable: "/fixture/runtime/bin/ffprobe",
});
const CONFIG = buildProducerConfig(validProjectCreateProducerConfig);
const REVISION = `revision-${"1".repeat(64)}`;
const NEXT_REVISION = `revision-${"2".repeat(64)}`;
const ATTEMPT_ID = "00000000-0000-4000-8000-000000000001";
const acquireTestLock: NonNullable<
  ConvergenceDependencies["acquireLock"]
> = async ({ locations, ownerId }) => {
  assert.equal(locations.layoutKind, "repository");
  assert.equal(ownerId, "project-production-converge");
  return { release: async () => undefined };
};

const task = (
  taskKind: "scene-owner" | "semantic-timing" | "composition-convergence",
): ProducerTaskSpec =>
  buildProducerTaskSpec({
    taskKind,
    storyId: "story-example",
    semanticId: taskKind === "scene-owner" ? "scene-one" : null,
    revisionId: REVISION,
    dependencyArtifacts: [],
    inputFingerprints: [{ id: "read:inputs/context.json", fingerprint: SHA }],
    declaredReadSet: ["inputs/context.json"],
    declaredOutputSet: [
      taskKind === "composition-convergence"
        ? "project/convergence.json"
        : taskKind === "semantic-timing"
          ? "project/timing.json"
          : "src/Renderer.tsx",
    ],
    validatorPolicyVersion: `${taskKind}-validator-v1`,
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
      render: { fps: 30 },
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

const sourceCurrent = (
  artifacts: readonly ArtifactAttestation[],
): SourceCurrentAttestation =>
  buildSourceCurrentAttestation({
    storyId: "story-example",
    revisionId: REVISION,
    artifacts: artifacts
      .map(({ taskRevision, artifactFingerprint }) => ({
        taskRevision,
        artifactFingerprint,
      }))
      .sort((left, right) =>
        left.taskRevision.localeCompare(right.taskRevision),
      ),
    files: [
      {
        logicalPath: "project/Composition.generated.tsx",
        checksum: SHA,
        sizeBytes: 1,
      },
    ],
    validators: [
      { id: "source-materialization", version: "source-materialization-v1" },
    ],
  });

const successfulDependencies = ({
  ownerTask,
  compositionTask,
  terminal,
  buildDelivery,
  inspectSourceCurrent,
}: {
  readonly ownerTask: ProducerTaskSpec;
  readonly compositionTask: ProducerTaskSpec;
  readonly terminal: unknown[];
  readonly buildDelivery?: NonNullable<
    ConvergenceDependencies["buildDelivery"]
  >;
  readonly inspectSourceCurrent?: NonNullable<
    ConvergenceDependencies["inspectSourceCurrent"]
  >;
}): ConvergenceDependencies => {
  const ownerArtifact = attestation(ownerTask);
  const compositionArtifact = attestation(compositionTask);
  const current = sourceCurrent([ownerArtifact, compositionArtifact]);
  return {
    acquireLock: acquireTestLock,
    buildCurrentPlan: injectedPlan(
      plannedProduction([ownerTask, compositionTask]),
    ),
    inspectArtifact: (async ({ task: inspected }) => {
      assert.equal(inspected.taskRevision, ownerTask.taskRevision);
      return ownerArtifact;
    }) as NonNullable<ConvergenceDependencies["inspectArtifact"]>,
    materializeOwnerArtifacts: (async () => undefined) as NonNullable<
      ConvergenceDependencies["materializeOwnerArtifacts"]
    >,
    verifyMaterializedOwnerArtifacts: (async () => undefined) as NonNullable<
      ConvergenceDependencies["verifyMaterializedOwnerArtifacts"]
    >,
    prepareProject: (async ({
      locations,
      runtime,
      mode,
    }: Parameters<
      NonNullable<ConvergenceDependencies["prepareProject"]>
    >[0]) => {
      assert.equal(locations.layoutKind, "repository");
      assert.equal(runtime, RUNTIME);
      assert.equal(mode, "write");
      return {};
    }) as unknown as NonNullable<ConvergenceDependencies["prepareProject"]>,
    readPreparedScenePackage: async ({ locations }) => {
      assert.equal(locations.layoutKind, "repository");
      return new TextEncoder().encode("scene-package\n");
    },
    readSceneRendererSource: async ({ task }) =>
      `const Renderer${task.semanticId ?? "Fixed"} = () => null;`,
    commitFixedArtifact: (async ({ task: fixedTask }) => {
      assert.equal(fixedTask.taskRevision, compositionTask.taskRevision);
      return compositionArtifact;
    }) as NonNullable<ConvergenceDependencies["commitFixedArtifact"]>,
    createSourceCurrent: (async ({ locations, artifacts }) => {
      assert.equal(locations.layoutKind, "repository");
      assert.deepEqual(
        artifacts.map(({ taskRevision }) => taskRevision).sort(),
        [ownerTask.taskRevision, compositionTask.taskRevision].sort(),
      );
      return current;
    }) as NonNullable<ConvergenceDependencies["createSourceCurrent"]>,
    writeSourceCurrent: (async ({ locations, attestation: written }) => {
      assert.equal(locations.layoutKind, "repository");
      assert.equal(written.sourceCurrentId, current.sourceCurrentId);
      return written;
    }) as NonNullable<ConvergenceDependencies["writeSourceCurrent"]>,
    inspectSourceCurrent:
      inspectSourceCurrent ??
      ((async ({ locations, expected }) => {
        assert.equal(locations.layoutKind, "repository");
        assert.equal(expected.sourceCurrentId, current.sourceCurrentId);
        return current;
      }) as NonNullable<ConvergenceDependencies["inspectSourceCurrent"]>),
    buildDelivery:
      buildDelivery ??
      (async () => {
        throw new Error("Delivery port must not be called by this scenario.");
      }),
    appendAttempt: (async ({ result }) => {
      terminal.push(result);
      return {};
    }) as NonNullable<ConvergenceDependencies["appendAttempt"]>,
  };
};

test("converge-owned fixed promotion validates only composition output", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-converge-fixed-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const locations = createRepositoryProductionLocations({
    repositoryRoot: rootDir,
  });
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
    dependencyArtifacts: [],
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
    locations,
    task: fixedTask,
    files: {
      "inputs/context.json": contextBytes,
      "project/convergence.json": resultBytes,
    },
  });

  assert.equal(committed.taskRevision, fixedTask.taskRevision);
  assert.deepEqual(await readdir(locations.disposableBuildRoot), []);
  await assert.rejects(
    commitConvergenceFixedArtifact({
      locations,
      task: fixedTask,
      files: {
        "inputs/context.json": contextBytes,
        "project/convergence.json": "{}\n",
      },
    }),
    /result is invalid/u,
  );
  assert.deepEqual(await readdir(rootDir), [".producer-artifacts", "out"]);
});

test("manual policy seals source-current without building delivery", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-converge-manual-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const locations = createRepositoryProductionLocations({
    repositoryRoot: rootDir,
  });
  const ownerTask = task("scene-owner");
  const compositionTask = task("composition-convergence");
  const terminal: unknown[] = [];
  let deliveryCalls = 0;

  const result = await convergeProjectProduction({
    locations,
    projectId: "story-example",
    revisionId: REVISION,
    attemptId: ATTEMPT_ID,
    deliveryPolicy: "manual",
    config: CONFIG,
    runtime: RUNTIME,
    dependencies: successfulDependencies({
      ownerTask,
      compositionTask,
      terminal,
      buildDelivery: (async () => {
        deliveryCalls += 1;
        throw new Error("manual policy must not build delivery");
      }) as NonNullable<ConvergenceDependencies["buildDelivery"]>,
    }),
  });

  assert.equal(result.status, "project-production-source-current");
  assert.equal(deliveryCalls, 0);
  assert.deepEqual(terminal, [
    {
      status: "source-current",
      sourceCurrentId: result.sourceCurrent.sourceCurrentId,
      deliveryBuildId: null,
      diagnosticCode: null,
      deliveryMedia: [],
    },
  ]);
});

test("automatic policy builds runtime-bound delivery and records delivery-current", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-converge-automatic-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const locations = createRepositoryProductionLocations({
    repositoryRoot: rootDir,
  });
  const ownerTask = task("scene-owner");
  const compositionTask = task("composition-convergence");
  const terminal: unknown[] = [];
  const deliveryBuildId = `delivery-${"3".repeat(64)}`;
  let deliveryCalls = 0;

  const result = await convergeProjectProduction({
    locations,
    projectId: "story-example",
    revisionId: REVISION,
    attemptId: ATTEMPT_ID,
    deliveryPolicy: "automatic",
    config: CONFIG,
    runtime: RUNTIME,
    dependencies: successfulDependencies({
      ownerTask,
      compositionTask,
      terminal,
      buildDelivery: (async (input) => {
        deliveryCalls += 1;
        assert.equal(input.sourceCurrentId.startsWith("source-current-"), true);
        assert.equal(input.locations, locations);
        assert.equal(input.runtime, RUNTIME);
        assert.equal(input.config, CONFIG);
        return {
          projectId: "story-example",
          deliveryBuildId,
          status: "project-production-complete",
          noOp: false,
          deliveryPath: "deliveries/story-example",
          reused: { video: false, cover4x3: false, cover3x4: false },
        };
      }) as NonNullable<ConvergenceDependencies["buildDelivery"]>,
    }),
  });

  assert.equal(result.status, "project-production-complete");
  assert.equal(deliveryCalls, 1);
  assert.equal(result.delivery.deliveryBuildId, deliveryBuildId);
  assert.deepEqual(terminal, [
    {
      status: "delivery-current",
      sourceCurrentId: result.sourceCurrent.sourceCurrentId,
      deliveryBuildId,
      diagnosticCode: null,
      deliveryMedia: ["video", "cover-4x3", "cover-3x4"],
    },
  ]);
});

test("source-current drift fails closed after write", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-converge-source-drift-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const locations = createRepositoryProductionLocations({
    repositoryRoot: rootDir,
  });
  const ownerTask = task("scene-owner");
  const compositionTask = task("composition-convergence");
  const terminal: unknown[] = [];

  await assert.rejects(
    () =>
      convergeProjectProduction({
        locations,
        projectId: "story-example",
        revisionId: REVISION,
        attemptId: ATTEMPT_ID,
        deliveryPolicy: "manual",
        config: CONFIG,
        runtime: RUNTIME,
        dependencies: successfulDependencies({
          ownerTask,
          compositionTask,
          terminal,
          inspectSourceCurrent: (async () => {
            throw new Error("Source current materialized bytes drifted.");
          }) as NonNullable<ConvergenceDependencies["inspectSourceCurrent"]>,
        }),
      }),
    /materialized bytes drifted/u,
  );
  assert.deepEqual(terminal, [
    {
      status: "failed",
      sourceCurrentId: null,
      deliveryBuildId: null,
      diagnosticCode: "project-production-convergence-failed",
      deliveryMedia: [],
    },
  ]);
});

test("invalid artifact fails before materialization or delivery", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-converge-artifact-drift-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const locations = createRepositoryProductionLocations({
    repositoryRoot: rootDir,
  });
  const ownerTask = task("scene-owner");
  const compositionTask = task("composition-convergence");
  const terminal: unknown[] = [];
  let materializeCalls = 0;
  let prepareCalls = 0;
  let deliveryCalls = 0;

  await assert.rejects(
    () =>
      convergeProjectProduction({
        locations,
        projectId: "story-example",
        revisionId: REVISION,
        attemptId: ATTEMPT_ID,
        deliveryPolicy: "automatic",
        config: CONFIG,
        runtime: RUNTIME,
        dependencies: {
          acquireLock: acquireTestLock,
          buildCurrentPlan: injectedPlan(
            plannedProduction([ownerTask, compositionTask]),
          ),
          inspectArtifact: (async () => {
            throw new Error("Artifact checksum drifted.");
          }) as NonNullable<ConvergenceDependencies["inspectArtifact"]>,
          materializeOwnerArtifacts: (async () => {
            materializeCalls += 1;
          }) as NonNullable<
            ConvergenceDependencies["materializeOwnerArtifacts"]
          >,
          prepareProject: (async () => {
            prepareCalls += 1;
            throw new Error("unreachable");
          }) as NonNullable<ConvergenceDependencies["prepareProject"]>,
          buildDelivery: (async () => {
            deliveryCalls += 1;
            throw new Error("unreachable");
          }) as NonNullable<ConvergenceDependencies["buildDelivery"]>,
          appendAttempt: (async ({ result }) => {
            terminal.push(result);
            return {};
          }) as NonNullable<ConvergenceDependencies["appendAttempt"]>,
        },
      }),
    /Artifact checksum drifted/u,
  );
  assert.equal(materializeCalls, 0);
  assert.equal(prepareCalls, 0);
  assert.equal(deliveryCalls, 0);
  assert.deepEqual(terminal, [
    {
      status: "failed",
      sourceCurrentId: null,
      deliveryBuildId: null,
      diagnosticCode: "producer-artifact-invalid",
      deliveryMedia: [],
    },
  ]);
});

test("stale revision remains read-only and records a failed terminal", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-converge-stale-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const locations = createRepositoryProductionLocations({
    repositoryRoot: rootDir,
  });
  const terminal: unknown[] = [];
  const calls = { inspect: 0, materialize: 0, prepare: 0, delivery: 0 };

  const result = await convergeProjectProduction({
    locations,
    projectId: "story-example",
    revisionId: REVISION,
    attemptId: ATTEMPT_ID,
    deliveryPolicy: "automatic",
    config: CONFIG,
    runtime: RUNTIME,
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
      prepareProject: (async () => {
        calls.prepare += 1;
        throw new Error("unreachable");
      }) as NonNullable<ConvergenceDependencies["prepareProject"]>,
      buildDelivery: (async () => {
        calls.delivery += 1;
        throw new Error("unreachable");
      }) as NonNullable<ConvergenceDependencies["buildDelivery"]>,
      appendAttempt: (async ({ result: terminalResult }) => {
        terminal.push(terminalResult);
        return {};
      }) as NonNullable<ConvergenceDependencies["appendAttempt"]>,
    },
  });

  assert.deepEqual(result, {
    status: "producer-revision-stale",
    currentRevisionId: NEXT_REVISION,
    attemptRecorded: true,
  });
  assert.deepEqual(calls, {
    inspect: 0,
    materialize: 0,
    prepare: 0,
    delivery: 0,
  });
  assert.deepEqual(terminal, [
    {
      status: "failed",
      sourceCurrentId: null,
      deliveryBuildId: null,
      diagnosticCode: "producer-revision-stale",
      deliveryMedia: [],
    },
  ]);
  assert.deepEqual(await readdir(rootDir), []);
});

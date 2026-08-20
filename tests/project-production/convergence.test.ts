import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildArtifactAttestation,
  buildProducerTaskSpec,
  type ArtifactAttestation,
  type ProducerTaskSpec,
} from "../../src/contracts";
import {
  convergeProjectProduction,
  type ConvergenceDependencies,
} from "../../scripts/project-production/application/converge-artifacts";
import { selectDirtyAgentTasks } from "../../scripts/project-production/cli";
import { checksumBytes } from "../../scripts/project-production/adapters/project-input-snapshot";

const SHA = `sha256:${"a".repeat(64)}`;
const REVISION = `revision-${"1".repeat(64)}`;
const NEXT_REVISION = `revision-${"2".repeat(64)}`;
const acquireTestLock: NonNullable<
  ConvergenceDependencies["acquireLock"]
> = async () => ({ release: async () => undefined });

const task = (
  taskKind:
    | "scene-owner"
    | "global-visual-owner"
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
        status: "reused",
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
    ReturnType<NonNullable<ConvergenceDependencies["plan"]>>
  >;

const injectedPlan = (planned: ReturnType<typeof plannedProduction>) =>
  (async () => planned) as NonNullable<ConvergenceDependencies["plan"]>;

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

test("stale revision returns before artifact inspection, materialization, or delivery", async () => {
  const calls = { inspect: 0, materialize: 0, delivery: 0 };
  const diagnostics: Array<string | null> = [];
  const result = await convergeProjectProduction({
    rootDir: "/fixture",
    projectId: "story-example",
    revisionId: REVISION,
    dependencies: {
      acquireLock: acquireTestLock,
      plan: injectedPlan(
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
      appendAttempt: (async ({ result: terminalResult }) => {
        diagnostics.push(terminalResult.diagnosticCode);
        return {};
      }) as NonNullable<ConvergenceDependencies["appendAttempt"]>,
    },
  });

  assert.deepEqual(result, {
    status: "producer-revision-stale",
    currentRevisionId: NEXT_REVISION,
    attemptRecorded: true,
  });
  assert.deepEqual(calls, { inspect: 0, materialize: 0, delivery: 0 });
  assert.deepEqual(diagnostics, ["producer-revision-stale"]);
});

test("a missing required artifact causes zero materialization and zero delivery", async () => {
  const sceneTask = task("scene-owner");
  const globalTask = task("global-visual-owner");
  const calls = { materialize: 0, delivery: 0 };
  const diagnostics: Array<string | null> = [];
  const result = await convergeProjectProduction({
    rootDir: "/fixture",
    projectId: "story-example",
    revisionId: REVISION,
    dependencies: {
      acquireLock: acquireTestLock,
      plan: injectedPlan(plannedProduction([sceneTask, globalTask])),
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
      appendAttempt: (async ({ result: terminalResult }) => {
        diagnostics.push(terminalResult.diagnosticCode);
        return {};
      }) as NonNullable<ConvergenceDependencies["appendAttempt"]>,
    },
  });

  assert.equal(result.status, "producer-artifacts-incomplete");
  assert.equal(result.missingTaskRevision, globalTask.taskRevision);
  assert.deepEqual(calls, { materialize: 0, delivery: 0 });
  assert.deepEqual(diagnostics, ["producer-artifacts-incomplete"]);
});

test("a lost diagnostic write does not change stale revision authority", async () => {
  const result = await convergeProjectProduction({
    rootDir: "/fixture",
    projectId: "story-example",
    revisionId: REVISION,
    dependencies: {
      acquireLock: acquireTestLock,
      plan: injectedPlan(
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
  const calls = { materialize: 0, verify: 0, delivery: 0 };
  const terminal: Array<{
    status: string;
    diagnosticCode: string | null;
  }> = [];
  const order: string[] = [];
  const scenePackageBytes = new TextEncoder().encode(
    '{"contractVersion":"scene-package-current"}\n',
  );
  const result = await convergeProjectProduction({
    rootDir,
    projectId: "story-example",
    revisionId: REVISION,
    dependencies: {
      acquireLock: (async () => {
        order.push("acquire");
        return {
          release: async () => {
            order.push("release");
          },
        };
      }) as NonNullable<ConvergenceDependencies["acquireLock"]>,
      plan: (async () => {
        planCall += 1;
        return planCall === 1 ? stages.initial : stages.withComposition;
      }) as NonNullable<ConvergenceDependencies["plan"]>,
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
        });
        return {};
      }) as NonNullable<ConvergenceDependencies["appendAttempt"]>,
    },
  });

  assert.equal(result.status, "project-production-complete");
  assert.equal(planCall, 3);
  assert.deepEqual(calls, { materialize: 1, verify: 6, delivery: 1 });
  assert.deepEqual(order, ["acquire", "materialize", "delivery", "release"]);
  assert.deepEqual(terminal, [{ status: "verified", diagnosticCode: null }]);
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
        dependencies: {
          acquireLock: acquireTestLock,
          plan: (async () => {
            planCall += 1;
            return planCall === 1 ? stages.initial : stages.withComposition;
          }) as NonNullable<ConvergenceDependencies["plan"]>,
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

test("CLI dispatch selection excludes reused, fixed, template, and blocked Agent tasks", () => {
  const sceneTask = task("scene-owner");
  const plan = {
    tasks: [
      {
        taskRevision: sceneTask.taskRevision,
        taskKind: "scene-owner",
        status: "missing",
      },
      {
        taskRevision: sceneTask.taskRevision,
        taskKind: "cover-owner",
        status: "blocked",
      },
      {
        taskRevision: sceneTask.taskRevision,
        taskKind: "global-visual-owner",
        status: "reused",
      },
      {
        taskRevision: sceneTask.taskRevision,
        taskKind: "scene-template",
        status: "missing",
      },
      {
        taskRevision: sceneTask.taskRevision,
        taskKind: "semantic-timing",
        status: "missing",
      },
    ],
  } as unknown as Parameters<typeof selectDirtyAgentTasks>[0];

  assert.deepEqual(
    selectDirtyAgentTasks(plan).map(({ taskKind }) => taskKind),
    ["scene-owner"],
  );
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
  }) as NonNullable<ConvergenceDependencies["plan"]>;
  const appendAttempt = (async () => ({})) as unknown as NonNullable<
    ConvergenceDependencies["appendAttempt"]
  >;
  const first = convergeProjectProduction({
    rootDir,
    projectId: "story-example",
    revisionId: REVISION,
    dependencies: { plan: blockingPlan, appendAttempt },
  });
  await planStarted;

  await assert.rejects(
    () =>
      convergeProjectProduction({
        rootDir,
        projectId: "story-example",
        revisionId: REVISION,
        dependencies: { plan: injectedPlan(planned), appendAttempt },
      }),
    /Another Project operation is already active/u,
  );
  unblockPlan?.();
  assert.equal((await first).status, "producer-revision-stale");

  const afterRelease = await convergeProjectProduction({
    rootDir,
    projectId: "story-example",
    revisionId: REVISION,
    dependencies: { plan: injectedPlan(planned), appendAttempt },
  });
  assert.equal(afterRelease.status, "producer-revision-stale");
});

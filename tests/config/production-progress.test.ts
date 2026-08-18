import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { readDeliveryProgressProjection } from "../../scripts/delivery/application/progress-query";
import { readProjectProductionProgress } from "../../settings/server/production-progress";
import {
  buildDeliveryLaunchManifest,
  buildRenderLaunchIntent,
  buildRenderLaunchReceipt,
  createDeliveryId,
  createFingerprint,
  createProductionRunManifest,
} from "../../src/contracts";
import {
  appendProductionRunEvent,
  initializeProductionRunStore,
} from "../../scripts/production/adapters/run-store";
import { createProductionStageEvent } from "../../scripts/production/domain/events";
const sha = (character: string) => `sha256:${character.repeat(64)}` as const;
const collectSnapshot = async ({
  projectId,
}: {
  readonly projectId: string;
}) => ({
  fingerprint: createFingerprint({
    namespace: "progress-test-source",
    version: 1,
    value: projectId,
  }),
  files: [],
});

const createRun = ({
  runId,
  createdAt,
  storyId = "story-example",
}: {
  readonly runId: string;
  readonly createdAt: string;
  readonly storyId?: string;
}) =>
  createProductionRunManifest({
    runId,
    storyId,
    requirementsPath: `src/projects/${storyId}/production/requirements.json`,
    requirementsFingerprint: sha("a"),
    createdAt,
  });

test("Project production progress is empty without Project-owned data", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-progress-empty-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  assert.deepEqual(await readProjectProductionProgress({ rootDir }), {
    schemaVersion: 3,
    projects: [],
  });
});

test("Project list includes source-only Projects without a Production Run", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-progress-source-only-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  await mkdir(join(rootDir, "src/projects/story-source-only"), {
    recursive: true,
  });

  const progress = await readProjectProductionProgress({
    rootDir,
    collectSnapshot,
  });
  assert.equal(progress.schemaVersion, 3);
  assert.equal(progress.projects[0]?.status, "not-built");
  assert.equal(progress.projects[0]?.build.detail, "尚未生成四文件交付");
  assert.deepEqual(
    progress.projects[0]?.build.steps.map(({ id, status }) => ({ id, status })),
    [
      { id: "prepare", status: "pending" },
      { id: "video", status: "pending" },
      { id: "cover-4x3", status: "pending" },
      { id: "cover-3x4", status: "pending" },
      { id: "verify", status: "pending" },
      { id: "promote", status: "pending" },
    ],
  );
  assert.equal(progress.projects[0]?.auditedRun, null);
  assert.equal(progress.projects[0]?.auditedRunError, null);
});

test("Project list excludes output-only deletion targets", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-progress-output-only-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  await mkdir(join(rootDir, "out/scene-template-verification"), {
    recursive: true,
  });

  assert.deepEqual(await readProjectProductionProgress({ rootDir }), {
    schemaVersion: 3,
    projects: [],
  });
});

test("one Project with invalid current Run discovery does not hide healthy Projects", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-progress-invalid-run-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  await mkdir(join(rootDir, "src/projects/story-healthy"), { recursive: true });
  const badRunDir = join(rootDir, ".producer-runs/story-bad-run-a");
  await mkdir(badRunDir, { recursive: true });
  await writeFile(
    join(badRunDir, "run.json"),
    JSON.stringify({
      contractVersion: "production-run-current-v3",
      runId: "story-bad-run-a",
      storyId: "story-bad",
      createdAt: "not-a-timestamp",
    }),
  );

  const progress = await readProjectProductionProgress({
    rootDir,
    collectSnapshot,
  });
  assert.deepEqual(
    progress.projects.map(({ projectId, auditedRunError }) => ({
      projectId,
      auditedRunError,
    })),
    [
      {
        projectId: "story-bad",
        auditedRunError:
          "Run discovery identity 无效；请检查该 Project 的 Run manifest。",
      },
      { projectId: "story-healthy", auditedRunError: null },
    ],
  );
});

test("production progress selects one newest Run independently for each Project", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-progress-latest-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const staleRunRoot = join(rootDir, ".producer-runs/story-example-run-legacy");
  await mkdir(staleRunRoot, { recursive: true });
  await writeFile(
    join(staleRunRoot, "run.json"),
    JSON.stringify({
      contractVersion: "production-run-current-v2",
      runId: "story-example-run-legacy",
      storyId: "story-example",
      createdAt: "2026-08-11T00:00:00.000Z",
    }),
  );
  const older = createRun({
    runId: "story-example-run-z",
    createdAt: "2026-08-12T02:30:00.000+02:00",
  });
  const latest = createRun({
    runId: "story-example-run-a",
    createdAt: "2026-08-12T01:00:00.000Z",
  });
  const secondProject = createRun({
    runId: "story-second-run-a",
    storyId: "story-second",
    createdAt: "2026-08-12T03:00:00.000Z",
  });
  await initializeProductionRunStore({ rootDir, run: older });
  await initializeProductionRunStore({ rootDir, run: secondProject });
  const initialized = await initializeProductionRunStore({
    rootDir,
    run: latest,
  });
  const started = await appendProductionRunEvent({
    rootDir,
    runId: latest.runId,
    event: createProductionStageEvent({
      type: "stage-succeeded",
      runId: latest.runId,
      storyId: latest.storyId,
      sequence: 1,
      eventId: "production-start-succeeded-1",
      stageId: "production-start",
      attempt: 1,
      occurredAt: latest.createdAt,
      commandId: "production-start",
      previousStateFingerprint: initialized.state.stateFingerprint,
      inputFingerprints: [
        {
          artifactId: "requirements",
          fingerprint: latest.requirementsFingerprint,
        },
      ],
      outputArtifacts: [
        {
          artifactId: "run-manifest",
          repositoryPath: `.producer-runs/${latest.runId}/run.json`,
          fingerprint: latest.runFingerprint,
        },
      ],
    }),
  });
  await appendProductionRunEvent({
    rootDir,
    runId: latest.runId,
    event: createProductionStageEvent({
      type: "stage-started",
      runId: latest.runId,
      storyId: latest.storyId,
      sequence: 2,
      eventId: "narrative-started-2",
      stageId: "narrative",
      attempt: 1,
      occurredAt: "2026-08-12T00:01:00.000-02:00",
      commandId: "production-narrative",
      previousStateFingerprint: started.state.stateFingerprint,
      inputFingerprints: [
        {
          artifactId: "requirements",
          fingerprint: latest.requirementsFingerprint,
        },
      ],
    }),
  });

  const progress = await readProjectProductionProgress({
    rootDir,
    collectSnapshot,
  });
  assert.equal(progress.schemaVersion, 3);
  assert.deepEqual(
    progress.projects.map(({ projectId }) => projectId),
    ["story-example", "story-second"],
  );
  const example = progress.projects.find(
    ({ projectId }) => projectId === "story-example",
  );
  const second = progress.projects.find(
    ({ projectId }) => projectId === "story-second",
  );
  assert.equal(example?.status, "not-built");
  assert.equal(example?.auditedRun?.runId, latest.runId);
  assert.equal(example?.auditedRun?.state, "narrative-running");
  assert.equal(example?.auditedRun?.completedSteps, 1);
  assert.equal(second?.auditedRun?.runId, secondProject.runId);
  assert.equal(second?.auditedRun?.state, "initialized");
  assert.deepEqual(
    example?.auditedRun?.steps.map(({ id, status }) => ({ id, status })),
    [
      { id: "production-start", status: "succeeded" },
      { id: "narrative", status: "running" },
      { id: "scene-freeze", status: "pending" },
      { id: "scenes", status: "pending" },
      { id: "render-ready", status: "pending" },
      { id: "delivery", status: "pending" },
    ],
  );
  assert.equal(example?.auditedRun?.updatedAt, "2026-08-12T00:01:00.000-02:00");
});

test("delivery progress distinguishes launch ambiguity from spawn acknowledgement", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-progress-delivery-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const identity = {
    storyId: "story-example",
    publishingIntentFingerprint: sha("1"),
    publishingChecksum: sha("2"),
    assetAttributionsFingerprint: sha("3"),
    assetAttributionsChecksum: sha("4"),
    coverResultFingerprint: sha("5"),
    renderReadyFingerprint: sha("6"),
    renderPlanFingerprint: sha("7"),
    compositionId: "StoryExample",
    renderArgs: [
      "render",
      "src/index.ts",
      "StoryExample",
      "deliveries/story-example/story-example.mp4",
      "--codec=h264",
    ],
    renderLaunchPolicyVersion: "detached-spawn-acknowledgement-v1",
  } as const;
  const deliveryId = createDeliveryId(identity);
  const manifest = buildDeliveryLaunchManifest({
    ...identity,
    deliveryId,
    plannedDurationSeconds: 4,
    fps: 30,
    frameCount: 120,
    files: {
      cover4x3: {
        fileName: "cover-4x3.png",
        checksum: sha("8"),
        sizeBytes: 10,
      },
      cover3x4: {
        fileName: "cover-3x4.png",
        checksum: sha("9"),
        sizeBytes: 10,
      },
      publishing: {
        fileName: "publishing.json",
        checksum: sha("a"),
        sizeBytes: 10,
      },
      assetAttributions: {
        fileName: "asset-attributions.json",
        checksum: sha("b"),
        sizeBytes: 10,
      },
    },
  });
  const intent = buildRenderLaunchIntent(identity);
  const deliveryDir = join(rootDir, "deliveries/story-example");
  await mkdir(deliveryDir, { recursive: true });
  await Promise.all([
    writeFile(
      join(deliveryDir, "delivery-launch-manifest.json"),
      JSON.stringify(manifest),
    ),
    writeFile(
      join(deliveryDir, "render-launch-intent.json"),
      JSON.stringify(intent),
    ),
  ]);

  assert.deepEqual(
    await readDeliveryProgressProjection({
      rootDir,
      storyId: "story-example",
      renderReadyFingerprint: identity.renderReadyFingerprint,
    }),
    {
      status: "attention",
      detail: "已写入启动意图但缺少 spawn 回执（launch-ambiguous）",
      occurredAt: null,
    },
  );

  const receipt = buildRenderLaunchReceipt({
    intent,
    startedAt: "2026-08-12T02:00:00.000Z",
  });
  await writeFile(
    join(deliveryDir, "render-launch-receipt.json"),
    JSON.stringify(receipt),
  );
  assert.deepEqual(
    await readDeliveryProgressProjection({
      rootDir,
      storyId: "story-example",
      renderReadyFingerprint: identity.renderReadyFingerprint,
    }),
    {
      status: "launched",
      detail: "Remotion 已收到 spawn 确认；不代表 MP4 已完成",
      occurredAt: "2026-08-12T02:00:00.000Z",
    },
  );
});

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  DELIVERY_BUILD_POLICY_VERSION,
  buildDeliveryPublish,
  buildDeliveryPublishing,
  buildProducerPlan,
  buildProducerTaskSpec,
  createDeliveryBuildId,
  createFingerprint,
  ExecutionAttemptTerminalResultSchema,
  ProducerTaskSpecSchema,
  type Sha256Digest,
} from "../../src/contracts";
import type { TaskDiagnosticSnapshot } from "../../src/contracts/execution-attempt";
import type { TaskDecisionExplanation } from "../../src/contracts/production-inspection";
import {
  appendExecutionAttemptTerminalResult,
  appendExecutionAttemptTaskOutcome,
  claimExecutionAttemptContinuation,
  createExecutionAttemptForPlan,
  readExecutionAttempt,
  readExecutionAttemptDiagnosticBaseline,
  readExecutionAttemptProgress,
  writeExecutionAttempt,
} from "../../scripts/project-production/adapters/attempt-store";
import { openExecutionAttemptEventWait } from "../../scripts/project-production/adapters/attempt-event-wait";
import {
  inspectCurrentDelivery,
  type CurrentDeliveryInspectionDependencies,
} from "../../scripts/project-production/adapters/current-delivery-inspection";
import {
  createRepositoryProductionLocations,
  createWorkspaceProductionLocations,
  type ProductionLocations,
} from "../../scripts/project-production/application/production-locations";

const sha = (character: string) =>
  `sha256:${character.repeat(64)}` as Sha256Digest;
const revisionId = `revision-${"1".repeat(64)}` as const;
const sourceCurrentId = `source-current-${"7".repeat(64)}` as const;
const rendererRuntimeFingerprint = sha("8");
const publishing = buildDeliveryPublishing({
  storyId: "story-example",
  title: "Delivery proof",
  description: "Delivery proof.",
  topics: ["one", "two", "three", "four", "five", "six"],
  collection: "Proof",
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
const publishingFingerprint = createFingerprint({
  namespace: "delivery-publishing-input",
  version: 1,
  value: publishing,
});

const task = buildProducerTaskSpec({
  taskKind: "scene-owner",
  storyId: "story-example",
  semanticId: "opening",
  revisionId,
  dependencyArtifacts: [],
  inputFingerprints: [
    { id: "brief", fingerprint: sha("2") },
    { id: "read:inputs/context.json", fingerprint: sha("3") },
  ],
  declaredReadSet: ["inputs/context.json"],
  declaredOutputSet: ["src/Renderer.tsx"],
  validatorPolicyVersion: "scene-owner-validator-v2",
});

if (task.semanticId === null) throw new Error("Scene fixture lost meaningId.");

const explanation: TaskDecisionExplanation = {
  taskRevision: task.taskRevision,
  baselineTaskRevision: null,
  taskKind: task.taskKind,
  subject: { kind: "meaning", id: task.semanticId },
  action: "dispatch-agent" as const,
  artifactState: "missing" as const,
  directChanges: [],
  dependencyChanges: [],
  blockedBy: [],
  explanationAvailability: "baseline-unavailable" as const,
};

const plan = buildProducerPlan({
  storyId: "story-example",
  revisionId,
  artifactSetFingerprint: sha("4"),
  tasks: [explanation],
  summary: {
    reusedTaskCount: 0,
    dirtyAgentTaskCount: 1,
    dirtyFixedTaskCount: 0,
    blockedTaskCount: 0,
  },
});

const snapshot: TaskDiagnosticSnapshot = {
  taskKind: task.taskKind,
  subject: explanation.subject,
  taskRevision: task.taskRevision,
  inputFingerprints: [{ id: "brief", fingerprint: sha("2") }],
  validatorPolicyVersion: task.validatorPolicyVersion,
  declaredReadSet: task.declaredReadSet,
  declaredOutputSet: task.declaredOutputSet,
  dependencies: [],
  decision: explanation,
};

const estimatedCost = {
  providerRequests: 0,
  providerCacheHits: 0,
  agentTasks: 1,
  deliveryMedia: ["video", "cover-4x3", "cover-3x4"],
} as const;
const actualCost = {
  providerRequests: 0,
  providerCacheHits: 0,
  agentTasks: 1,
  deliveryMedia: [],
} as const;

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

const inspectFixtureDelivery = (
  input: Parameters<typeof inspectCurrentDelivery>[0],
) => inspectCurrentDelivery({ ...input, dependencies: acceptFixtureMedia });

const repositoryLocations = (rootDir: string) =>
  createRepositoryProductionLocations({ repositoryRoot: rootDir });

const openAttempt = (locations: ProductionLocations) =>
  createExecutionAttemptForPlan({
    locations,
    plan,
    taskSnapshots: [snapshot],
    estimatedCost,
    actualCost,
    state: "waiting-for-agent",
  });

test("attempt diagnostics accept stable codes and reject raw sensitive details", () => {
  assert.throws(() =>
    ExecutionAttemptTerminalResultSchema.parse({
      status: "failed",
      sourceCurrentId: null,
      deliveryBuildId: null,
      diagnosticCode: "render failed at /home/user/private/token.json",
      deliveryMedia: [],
    }),
  );
});

test("attempt base persists safe explanations, snapshots, and costs", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-attempt-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const attempt = await openAttempt(repositoryLocations(rootDir));

  assert.equal(attempt.planFingerprint, plan.planFingerprint);
  assert.deepEqual(attempt.taskExplanations, plan.tasks);
  assert.deepEqual(attempt.taskSnapshots, [snapshot]);
  assert.deepEqual(attempt.estimatedCost, estimatedCost);
  assert.deepEqual(attempt.actualCost, actualCost);
  const progress = await readExecutionAttemptProgress({
    locations: repositoryLocations(rootDir),
    storyId: attempt.storyId,
    attemptId: attempt.attemptId,
  });
  assert.equal(progress?.eventCount, 1);
  assert.equal(progress?.terminalResult.status, "pending");
  assert.deepEqual(progress?.taskExplanations, plan.tasks);
  const events = await readdir(
    join(
      rootDir,
      ".producer-attempts",
      attempt.storyId,
      attempt.attemptId,
      "events",
    ),
  );
  assert.equal(events.length, 1);
});

test("task and attempt terminal events rebuild progress without mutating attempt.json", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-attempt-events-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const attempt = await openAttempt(repositoryLocations(rootDir));

  await appendExecutionAttemptTaskOutcome({
    locations: repositoryLocations(rootDir),
    attemptId: attempt.attemptId,
    task,
    outcome: {
      outcome: "artifact-committed",
      artifactFingerprint: sha("5"),
      diagnosticCode: null,
    },
  });
  await assert.rejects(
    appendExecutionAttemptTaskOutcome({
      locations: repositoryLocations(rootDir),
      attemptId: attempt.attemptId,
      task,
      outcome: {
        outcome: "artifact-committed",
        artifactFingerprint: sha("5"),
        diagnosticCode: null,
      },
    }),
    /not dirty|terminal is immutable/u,
  );
  await assert.rejects(
    appendExecutionAttemptTaskOutcome({
      locations: repositoryLocations(rootDir),
      attemptId: attempt.attemptId,
      task,
      outcome: {
        outcome: "failed",
        artifactFingerprint: null,
        diagnosticCode: "producer-agent-task-failed",
      },
    }),
    /not dirty|task terminal is immutable/u,
  );
  await appendExecutionAttemptTerminalResult({
    locations: repositoryLocations(rootDir),
    storyId: attempt.storyId,
    revisionId: attempt.revisionId,
    attemptId: attempt.attemptId,
    result: {
      status: "delivery-current",
      sourceCurrentId,
      deliveryBuildId: `delivery-${"6".repeat(64)}`,
      diagnosticCode: null,
      deliveryMedia: ["video", "cover-4x3", "cover-3x4"],
    },
  });

  const directory = join(
    rootDir,
    ".producer-attempts",
    attempt.storyId,
    attempt.attemptId,
  );
  const immutableAttempt = JSON.parse(
    await readFile(join(directory, "attempt.json"), "utf8"),
  ) as { state: string; actualCost: { deliveryMedia: string[] } };
  assert.equal(immutableAttempt.state, "waiting-for-agent");
  assert.deepEqual(immutableAttempt.actualCost.deliveryMedia, []);

  const progress = await readExecutionAttempt({
    locations: repositoryLocations(rootDir),
    storyId: attempt.storyId,
    attemptId: attempt.attemptId,
  });
  assert.equal(progress.state, "succeeded");
  assert.deepEqual(progress.dirtyTaskRevisions, []);
  assert.deepEqual(progress.actualCost.deliveryMedia, [
    "video",
    "cover-4x3",
    "cover-3x4",
  ]);
});

test("task outcomes reject reused plan entries at append and event replay", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-attempt-reused-task-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const reusedExplanation: TaskDecisionExplanation = {
    ...explanation,
    baselineTaskRevision: task.taskRevision,
    action: "reuse",
    artifactState: "valid",
    explanationAvailability: "complete",
  };
  const reusedPlan = buildProducerPlan({
    storyId: task.storyId,
    revisionId: task.revisionId,
    artifactSetFingerprint: sha("4"),
    tasks: [reusedExplanation],
    summary: {
      reusedTaskCount: 1,
      dirtyAgentTaskCount: 0,
      dirtyFixedTaskCount: 0,
      blockedTaskCount: 0,
    },
  });
  const reusedSnapshot: TaskDiagnosticSnapshot = {
    ...snapshot,
    decision: reusedExplanation,
  };
  const attempt = await createExecutionAttemptForPlan({
    locations: repositoryLocations(rootDir),
    plan: reusedPlan,
    taskSnapshots: [reusedSnapshot],
    estimatedCost: { ...estimatedCost, agentTasks: 0 },
    actualCost: { ...actualCost, agentTasks: 0 },
    state: "converging",
  });
  const outcome = {
    outcome: "artifact-current" as const,
    artifactFingerprint: sha("5"),
    diagnosticCode: null,
  };
  await assert.rejects(
    appendExecutionAttemptTaskOutcome({
      locations: repositoryLocations(rootDir),
      attemptId: attempt.attemptId,
      task,
      outcome,
    }),
    /not bound to a dispatched Agent task/u,
  );

  const eventId = "00000000-0000-5000-a000-000000000003";
  await writeFile(
    join(
      rootDir,
      ".producer-attempts",
      attempt.storyId,
      attempt.attemptId,
      "events",
      `${eventId}.json`,
    ),
    `${JSON.stringify({
      schemaVersion: 4,
      contractVersion: "execution-attempt-event-v4",
      eventId,
      eventKind: "task-terminal",
      recordedAt: "2026-08-23T00:00:00.000Z",
      attemptId: attempt.attemptId,
      storyId: attempt.storyId,
      revisionId: attempt.revisionId,
      taskOutcome: {
        taskRevision: task.taskRevision,
        taskKind: task.taskKind,
        ...outcome,
      },
      terminalResult: null,
    })}\n`,
  );
  await assert.rejects(
    readExecutionAttemptProgress({
      locations: repositoryLocations(rootDir),
      storyId: attempt.storyId,
      attemptId: attempt.attemptId,
    }),
    /not bound to a dispatched Agent task/u,
  );
});

test("task outcomes reject a stale task Revision before writing an event", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-attempt-stale-task-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const attempt = await openAttempt(repositoryLocations(rootDir));
  const staleTask = ProducerTaskSpecSchema.parse({
    ...task,
    revisionId: `revision-${"9".repeat(64)}`,
  });
  await assert.rejects(
    appendExecutionAttemptTaskOutcome({
      locations: repositoryLocations(rootDir),
      attemptId: attempt.attemptId,
      task: staleTask,
      outcome: {
        outcome: "artifact-committed",
        artifactFingerprint: sha("5"),
        diagnosticCode: null,
      },
    }),
    /not the active task authority/u,
  );
  const events = await readdir(
    join(
      rootDir,
      ".producer-attempts",
      attempt.storyId,
      attempt.attemptId,
      "events",
    ),
  );
  assert.equal(events.length, 1);
});

test("one attempt continuation claim wins atomically", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-attempt-claim-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const attempt = await openAttempt(repositoryLocations(rootDir));
  const input = {
    locations: repositoryLocations(rootDir),
    storyId: attempt.storyId,
    revisionId: attempt.revisionId,
    attemptId: attempt.attemptId,
  } as const;

  const results = await Promise.allSettled([
    claimExecutionAttemptContinuation(input),
    claimExecutionAttemptContinuation(input),
  ]);

  assert.equal(
    results.filter(({ status }) => status === "fulfilled").length,
    1,
  );
  const rejected = results.find(({ status }) => status === "rejected");
  assert.equal(rejected?.status, "rejected");
  if (rejected?.status === "rejected") {
    assert.match(String(rejected.reason), /continuation is already claimed/u);
  }
});

test("concurrent conflicting task terminals preserve one immutable outcome", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-attempt-task-race-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const attempt = await openAttempt(repositoryLocations(rootDir));

  const results = await Promise.allSettled([
    appendExecutionAttemptTaskOutcome({
      locations: repositoryLocations(rootDir),
      attemptId: attempt.attemptId,
      task,
      outcome: {
        outcome: "artifact-committed",
        artifactFingerprint: sha("5"),
        diagnosticCode: null,
      },
    }),
    appendExecutionAttemptTaskOutcome({
      locations: repositoryLocations(rootDir),
      attemptId: attempt.attemptId,
      task,
      outcome: {
        outcome: "failed",
        artifactFingerprint: null,
        diagnosticCode: "producer-agent-task-failed",
      },
    }),
  ]);

  assert.equal(
    results.filter(({ status }) => status === "fulfilled").length,
    1,
  );
  assert.equal(results.filter(({ status }) => status === "rejected").length, 1);
  const progress = await readExecutionAttemptProgress({
    locations: repositoryLocations(rootDir),
    storyId: attempt.storyId,
    attemptId: attempt.attemptId,
  });
  assert.equal(progress?.taskOutcomes.length, 1);
  assert.equal(progress?.eventCount, 2);
});

test("concurrent conflicting attempt terminals preserve one immutable result", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-attempt-delivery-race-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const attempt = await openAttempt(repositoryLocations(rootDir));

  const results = await Promise.allSettled([
    appendExecutionAttemptTerminalResult({
      locations: repositoryLocations(rootDir),
      storyId: attempt.storyId,
      revisionId: attempt.revisionId,
      attemptId: attempt.attemptId,
      result: {
        status: "delivery-current",
        sourceCurrentId,
        deliveryBuildId: `delivery-${"6".repeat(64)}`,
        diagnosticCode: null,
        deliveryMedia: ["video", "cover-4x3", "cover-3x4"],
      },
    }),
    appendExecutionAttemptTerminalResult({
      locations: repositoryLocations(rootDir),
      storyId: attempt.storyId,
      revisionId: attempt.revisionId,
      attemptId: attempt.attemptId,
      result: {
        status: "failed",
        sourceCurrentId: null,
        deliveryBuildId: null,
        diagnosticCode: "delivery-render-failed",
        deliveryMedia: [],
      },
    }),
  ]);

  assert.equal(
    results.filter(({ status }) => status === "fulfilled").length,
    1,
  );
  assert.equal(results.filter(({ status }) => status === "rejected").length, 1);
  const progress = await readExecutionAttemptProgress({
    locations: repositoryLocations(rootDir),
    storyId: attempt.storyId,
    attemptId: attempt.attemptId,
  });
  assert.notEqual(progress?.terminalResult.status, "pending");
  assert.equal(progress?.eventCount, 2);
});

test("terminal diagnostics never create an attempt implicitly", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-attempt-no-fallback-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  await assert.rejects(
    appendExecutionAttemptTaskOutcome({
      locations: repositoryLocations(rootDir),
      attemptId: "00000000-0000-4000-8000-000000000001",
      task,
      outcome: {
        outcome: "failed",
        artifactFingerprint: null,
        diagnosticCode: "producer-task-commit-failed",
      },
    }),
    /Execution attempt is missing/u,
  );
  await assert.rejects(
    appendExecutionAttemptTerminalResult({
      locations: repositoryLocations(rootDir),
      storyId: task.storyId,
      revisionId: task.revisionId,
      attemptId: "00000000-0000-4000-8000-000000000001",
      result: {
        status: "failed",
        sourceCurrentId: null,
        deliveryBuildId: null,
        diagnosticCode: "producer-artifacts-incomplete",
        deliveryMedia: [],
      },
    }),
    /Execution attempt is missing/u,
  );
  await assert.rejects(readdir(join(rootDir, ".producer-attempts")));
});

const bytesChecksum = (bytes: string) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}` as Sha256Digest;

const writeCurrentDelivery = async ({
  rootDir,
  deliveryBuildId,
}: {
  readonly rootDir: string;
  readonly deliveryBuildId: ReturnType<typeof createDeliveryBuildId>;
}) => {
  const directory = join(rootDir, "deliveries/story-example");
  await mkdir(directory, { recursive: true });
  const files = {
    "video.mp4": "video",
    "cover-4x3.png": "wide",
    "cover-3x4.png": "tall",
  } as const;
  for (const [name, bytes] of Object.entries(files)) {
    await writeFile(join(directory, name), bytes);
  }
  const file = (name: keyof typeof files) => ({
    logicalPath: `deliveries/story-example/${name}`,
    checksum: bytesChecksum(files[name]),
    sizeBytes: Buffer.byteLength(files[name]),
  });
  const publish = buildDeliveryPublish({
    storyId: "story-example",
    revisionId,
    sourceCurrentId,
    rendererRuntimeFingerprint,
    publishingFingerprint,
    compositionId: "StoryExample",
    fps: 30,
    frameCount: 120,
    width: 1080,
    height: 1920,
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
};

test("baseline prefers current-delivery succeeded attempt over newer failed diagnostics", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-attempt-baseline-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const identity = {
    storyId: "story-example",
    revisionId,
    sourceCurrentId,
    rendererRuntimeFingerprint,
    publishingFingerprint,
    compositionId: "StoryExample",
    fps: 30,
    frameCount: 120,
    width: 1080,
    height: 1920,
    policyVersion: DELIVERY_BUILD_POLICY_VERSION,
  } as const;
  const buildId = createDeliveryBuildId(identity);
  const succeeded = await openAttempt(repositoryLocations(rootDir));
  await appendExecutionAttemptTerminalResult({
    locations: repositoryLocations(rootDir),
    storyId: succeeded.storyId,
    revisionId: succeeded.revisionId,
    attemptId: succeeded.attemptId,
    result: {
      status: "delivery-current",
      sourceCurrentId,
      deliveryBuildId: buildId,
      diagnosticCode: null,
      deliveryMedia: ["video", "cover-4x3", "cover-3x4"],
    },
  });
  const failed = await openAttempt(repositoryLocations(rootDir));
  await appendExecutionAttemptTerminalResult({
    locations: repositoryLocations(rootDir),
    storyId: failed.storyId,
    revisionId: failed.revisionId,
    attemptId: failed.attemptId,
    result: {
      status: "failed",
      sourceCurrentId: null,
      deliveryBuildId: null,
      diagnosticCode: "delivery-render-failed",
      deliveryMedia: [],
    },
  });
  await mkdir(
    join(rootDir, ".producer-attempts/story-example/not-a-v4-attempt"),
  );
  await writeFile(
    join(
      rootDir,
      ".producer-attempts/story-example/not-a-v4-attempt/attempt.json",
    ),
    "{ malformed",
  );

  const beforeDelivery = await readExecutionAttemptDiagnosticBaseline({
    locations: repositoryLocations(rootDir),
    storyId: "story-example",
  });
  assert.equal(beforeDelivery?.kind, "latest-successful-attempt");
  assert.equal(beforeDelivery?.attemptId, succeeded.attemptId);

  await writeCurrentDelivery({ rootDir, deliveryBuildId: buildId });
  const current = await readExecutionAttemptDiagnosticBaseline({
    locations: repositoryLocations(rootDir),
    storyId: "story-example",
    dependencies: { inspectCurrentDelivery: inspectFixtureDelivery },
  });
  assert.equal(current?.kind, "current-delivery");
  assert.equal(current?.attemptId, succeeded.attemptId);
  assert.deepEqual(current?.taskSnapshots, [snapshot]);
});

test("matching delivery checksums cannot make invalid media the current diagnostic baseline", async (context) => {
  const rootDir = await mkdtemp(
    join(tmpdir(), "rsp-attempt-invalid-delivery-"),
  );
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const identity = {
    storyId: "story-example",
    revisionId,
    sourceCurrentId,
    rendererRuntimeFingerprint,
    publishingFingerprint,
    compositionId: "StoryExample",
    fps: 30,
    frameCount: 120,
    width: 1080,
    height: 1920,
    policyVersion: DELIVERY_BUILD_POLICY_VERSION,
  } as const;
  const buildId = createDeliveryBuildId(identity);
  const succeeded = await openAttempt(repositoryLocations(rootDir));
  await appendExecutionAttemptTerminalResult({
    locations: repositoryLocations(rootDir),
    storyId: succeeded.storyId,
    revisionId: succeeded.revisionId,
    attemptId: succeeded.attemptId,
    result: {
      status: "delivery-current",
      sourceCurrentId,
      deliveryBuildId: buildId,
      diagnosticCode: null,
      deliveryMedia: ["video", "cover-4x3", "cover-3x4"],
    },
  });
  await writeCurrentDelivery({ rootDir, deliveryBuildId: buildId });

  const baseline = await readExecutionAttemptDiagnosticBaseline({
    locations: repositoryLocations(rootDir),
    storyId: "story-example",
  });

  assert.equal(baseline?.kind, "latest-successful-attempt");
  assert.equal(baseline?.attemptId, succeeded.attemptId);
});

test("attempt diagnostics reject symlinked storage parents", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-attempt-symlink-root-"));
  const outsideRoot = await mkdtemp(
    join(tmpdir(), "rsp-attempt-symlink-outside-"),
  );
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  context.after(() => rm(outsideRoot, { recursive: true, force: true }));
  await symlink(outsideRoot, join(rootDir, ".producer-attempts"));

  await assert.rejects(
    openAttempt(repositoryLocations(rootDir)),
    /Execution attempt parent is unsafe/u,
  );
  assert.deepEqual(await readdir(outsideRoot), []);
});

test("Workspace attempt APIs use only the explicit attemptStoreRoot", async (context) => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "rsp-attempt-workspace-"));
  const supportRoot = await mkdtemp(join(tmpdir(), "rsp-attempt-support-"));
  const runtimeRoot = await mkdtemp(join(tmpdir(), "rsp-attempt-runtime-"));
  const cacheRoot = await mkdtemp(join(tmpdir(), "rsp-attempt-cache-"));
  context.after(() => rm(workspaceRoot, { recursive: true, force: true }));
  context.after(() => rm(supportRoot, { recursive: true, force: true }));
  context.after(() => rm(runtimeRoot, { recursive: true, force: true }));
  context.after(() => rm(cacheRoot, { recursive: true, force: true }));
  const locations = createWorkspaceProductionLocations({
    workspaceRoot,
    applicationSupportRoot: supportRoot,
    runtimeResources: runtimeRoot,
    cacheRoot,
  });
  await mkdir(join(workspaceRoot, ".rsp"));
  const attempt = await createExecutionAttemptForPlan({
    locations,
    plan,
    taskSnapshots: [snapshot],
    estimatedCost,
    actualCost,
    state: "waiting-for-agent",
  });

  assert.deepEqual(
    await readdir(join(locations.attemptStoreRoot, attempt.storyId)),
    [attempt.attemptId],
  );
  await assert.rejects(readdir(join(workspaceRoot, ".producer-attempts")));
  assert.equal(
    (
      await readExecutionAttempt({
        locations,
        storyId: attempt.storyId,
        attemptId: attempt.attemptId,
      })
    ).attemptId,
    attempt.attemptId,
  );

  const eventWait = openExecutionAttemptEventWait({
    locations,
    storyId: attempt.storyId,
    attemptId: attempt.attemptId,
    timeoutMs: 1_000,
  });
  try {
    await eventWait.ready;
    await appendExecutionAttemptTaskOutcome({
      locations,
      attemptId: attempt.attemptId,
      task,
      outcome: {
        outcome: "artifact-current",
        artifactFingerprint: sha("5"),
        diagnosticCode: null,
      },
    });
    await eventWait.changed;
  } finally {
    eventWait.close();
  }
  await claimExecutionAttemptContinuation({
    locations,
    storyId: attempt.storyId,
    revisionId: attempt.revisionId,
    attemptId: attempt.attemptId,
  });
  await appendExecutionAttemptTerminalResult({
    locations,
    storyId: attempt.storyId,
    revisionId: attempt.revisionId,
    attemptId: attempt.attemptId,
    result: {
      status: "source-current",
      sourceCurrentId,
      deliveryBuildId: null,
      diagnosticCode: null,
      deliveryMedia: [],
    },
  });
  assert.equal(
    (
      await readExecutionAttemptProgress({
        locations,
        storyId: attempt.storyId,
        attemptId: attempt.attemptId,
      })
    )?.terminalResult.status,
    "source-current",
  );
  assert.equal(
    (
      await readExecutionAttemptDiagnosticBaseline({
        locations,
        storyId: attempt.storyId,
      })
    )?.attemptId,
    attempt.attemptId,
  );

  const secondLocations = createWorkspaceProductionLocations({
    workspaceRoot: join(workspaceRoot, "second"),
    applicationSupportRoot: supportRoot,
    runtimeResources: runtimeRoot,
    cacheRoot,
  });
  await mkdir(join(workspaceRoot, "second/.rsp"), { recursive: true });
  await writeExecutionAttempt({ locations: secondLocations, attempt });
  assert.equal(
    (
      await readExecutionAttempt({
        locations: secondLocations,
        storyId: attempt.storyId,
        attemptId: attempt.attemptId,
      })
    ).attemptId,
    attempt.attemptId,
  );
});

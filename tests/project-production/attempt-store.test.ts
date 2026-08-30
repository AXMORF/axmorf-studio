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
  buildDeliveryPublish,
  buildDeliveryPublishing,
  buildProducerPlan,
  buildProducerTaskSpec,
  createDeliveryBuildId,
  ExecutionAttemptDeliveryResultSchema,
  type Sha256Digest,
} from "@axmorf/studio/contracts";
import type { TaskDiagnosticSnapshot } from "@axmorf/studio/contracts";
import type { TaskDecisionExplanation } from "@axmorf/studio/contracts";
import {
  ExecutionAttemptAuthorityError,
  appendExecutionAttemptDeliveryResult,
  appendExecutionAttemptTaskOutcome,
  assertExecutionAttemptTaskAuthority,
  claimExecutionAttemptContinuation,
  createExecutionAttemptForPlan,
  listExecutionAttemptsForStory,
  readExecutionAttempt,
  readExecutionAttemptDiagnosticBaseline,
  readExecutionAttemptProgress,
} from "../../scripts/project-production/adapters/attempt-store";
import {
  inspectCurrentDelivery,
  type CurrentDeliveryInspectionDependencies,
} from "../../scripts/project-production/adapters/current-delivery-inspection";

const sha = (character: string) =>
  `sha256:${character.repeat(64)}` as Sha256Digest;
const revisionId = `revision-${"1".repeat(64)}` as const;

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

const openAttempt = (rootDir: string) =>
  createExecutionAttemptForPlan({
    rootDir,
    plan,
    taskSnapshots: [snapshot],
    estimatedCost,
    actualCost,
    state: "waiting-for-agent",
  });

test("attempt diagnostics accept stable codes and reject raw sensitive details", () => {
  assert.throws(() =>
    ExecutionAttemptDeliveryResultSchema.parse({
      status: "failed",
      deliveryBuildId: null,
      diagnosticCode: "render failed at /home/user/private/token.json",
      deliveryMedia: [],
    }),
  );
});

test("attempt base persists safe explanations, snapshots, and costs", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-attempt-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const attempt = await openAttempt(rootDir);

  assert.equal(attempt.planFingerprint, plan.planFingerprint);
  assert.deepEqual(attempt.taskExplanations, plan.tasks);
  assert.deepEqual(attempt.taskSnapshots, [snapshot]);
  assert.deepEqual(attempt.estimatedCost, estimatedCost);
  assert.deepEqual(attempt.actualCost, actualCost);
  const progress = await readExecutionAttemptProgress({
    rootDir,
    storyId: attempt.storyId,
    attemptId: attempt.attemptId,
  });
  assert.equal(progress?.eventCount, 1);
  assert.equal(progress?.deliveryResult.status, "not-verified");
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

test("attempt listing and task authority stay plan-bound and terminal-aware", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-attempt-authority-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const attempt = await openAttempt(rootDir);

  const listed = await listExecutionAttemptsForStory({
    rootDir,
    storyId: attempt.storyId,
  });
  assert.deepEqual(
    listed.map(({ attemptId }) => attemptId),
    [attempt.attemptId],
  );
  const authority = await assertExecutionAttemptTaskAuthority({
    rootDir,
    attemptId: attempt.attemptId,
    task,
  });
  assert.equal(authority.snapshot.decision.action, "dispatch-agent");

  await appendExecutionAttemptTaskOutcome({
    rootDir,
    attemptId: attempt.attemptId,
    task,
    outcome: {
      outcome: "failed",
      artifactFingerprint: null,
      diagnosticCode: "producer-agent-task-failed",
    },
  });
  await assert.rejects(
    assertExecutionAttemptTaskAuthority({
      rootDir,
      attemptId: attempt.attemptId,
      task,
    }),
    ExecutionAttemptAuthorityError,
  );
});

test("task and delivery terminal events rebuild progress without mutating attempt.json", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-attempt-events-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const attempt = await openAttempt(rootDir);

  await appendExecutionAttemptTaskOutcome({
    rootDir,
    attemptId: attempt.attemptId,
    task,
    outcome: {
      outcome: "artifact-committed",
      artifactFingerprint: sha("5"),
      diagnosticCode: null,
    },
  });
  const idempotent = await appendExecutionAttemptTaskOutcome({
    rootDir,
    attemptId: attempt.attemptId,
    task,
    outcome: {
      outcome: "artifact-committed",
      artifactFingerprint: sha("5"),
      diagnosticCode: null,
    },
  });
  assert.equal(idempotent.eventCount, 2);
  await assert.rejects(
    appendExecutionAttemptTaskOutcome({
      rootDir,
      attemptId: attempt.attemptId,
      task,
      outcome: {
        outcome: "failed",
        artifactFingerprint: null,
        diagnosticCode: "producer-agent-task-failed",
      },
    }),
    /task terminal is immutable/u,
  );
  await appendExecutionAttemptDeliveryResult({
    rootDir,
    storyId: attempt.storyId,
    revisionId: attempt.revisionId,
    attemptId: attempt.attemptId,
    result: {
      status: "verified",
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
    rootDir,
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

test("one attempt continuation claim wins atomically", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-attempt-claim-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const attempt = await openAttempt(rootDir);
  const input = {
    rootDir,
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
  const attempt = await openAttempt(rootDir);

  const results = await Promise.allSettled([
    appendExecutionAttemptTaskOutcome({
      rootDir,
      attemptId: attempt.attemptId,
      task,
      outcome: {
        outcome: "artifact-committed",
        artifactFingerprint: sha("5"),
        diagnosticCode: null,
      },
    }),
    appendExecutionAttemptTaskOutcome({
      rootDir,
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
    rootDir,
    storyId: attempt.storyId,
    attemptId: attempt.attemptId,
  });
  assert.equal(progress?.taskOutcomes.length, 1);
  assert.equal(progress?.eventCount, 2);
});

test("concurrent conflicting delivery terminals preserve one immutable result", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-attempt-delivery-race-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const attempt = await openAttempt(rootDir);

  const results = await Promise.allSettled([
    appendExecutionAttemptDeliveryResult({
      rootDir,
      storyId: attempt.storyId,
      revisionId: attempt.revisionId,
      attemptId: attempt.attemptId,
      result: {
        status: "verified",
        deliveryBuildId: `delivery-${"6".repeat(64)}`,
        diagnosticCode: null,
        deliveryMedia: ["video", "cover-4x3", "cover-3x4"],
      },
    }),
    appendExecutionAttemptDeliveryResult({
      rootDir,
      storyId: attempt.storyId,
      revisionId: attempt.revisionId,
      attemptId: attempt.attemptId,
      result: {
        status: "failed",
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
    rootDir,
    storyId: attempt.storyId,
    attemptId: attempt.attemptId,
  });
  assert.notEqual(progress?.deliveryResult.status, "not-verified");
  assert.equal(progress?.eventCount, 2);
});

test("terminal diagnostics never create an attempt implicitly", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-attempt-no-fallback-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  await assert.rejects(
    appendExecutionAttemptTaskOutcome({
      rootDir,
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
    appendExecutionAttemptDeliveryResult({
      rootDir,
      storyId: task.storyId,
      revisionId: task.revisionId,
      attemptId: "00000000-0000-4000-8000-000000000001",
      result: {
        status: "failed",
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
    repositoryPath: `deliveries/story-example/${name}`,
    checksum: bytesChecksum(files[name]),
    sizeBytes: Buffer.byteLength(files[name]),
  });
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
  const publish = buildDeliveryPublish({
    storyId: "story-example",
    revisionId,
    artifactSetFingerprint: plan.artifactSetFingerprint,
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
    artifactSetFingerprint: plan.artifactSetFingerprint,
    compositionId: "StoryExample",
    fps: 30,
    frameCount: 120,
    width: 1080,
    height: 1920,
    policyVersion: "revision-artifact-sync-delivery-v1",
  } as const;
  const buildId = createDeliveryBuildId(identity);
  const succeeded = await openAttempt(rootDir);
  await appendExecutionAttemptDeliveryResult({
    rootDir,
    storyId: succeeded.storyId,
    revisionId: succeeded.revisionId,
    attemptId: succeeded.attemptId,
    result: {
      status: "verified",
      deliveryBuildId: buildId,
      diagnosticCode: null,
      deliveryMedia: ["video", "cover-4x3", "cover-3x4"],
    },
  });
  const failed = await openAttempt(rootDir);
  await appendExecutionAttemptDeliveryResult({
    rootDir,
    storyId: failed.storyId,
    revisionId: failed.revisionId,
    attemptId: failed.attemptId,
    result: {
      status: "failed",
      deliveryBuildId: null,
      diagnosticCode: "delivery-render-failed",
      deliveryMedia: [],
    },
  });
  await mkdir(
    join(rootDir, ".producer-attempts/story-example/not-a-v3-attempt"),
  );
  await writeFile(
    join(
      rootDir,
      ".producer-attempts/story-example/not-a-v3-attempt/attempt.json",
    ),
    "{ malformed",
  );

  const beforeDelivery = await readExecutionAttemptDiagnosticBaseline({
    rootDir,
    storyId: "story-example",
  });
  assert.equal(beforeDelivery?.kind, "latest-verified-attempt");
  assert.equal(beforeDelivery?.attemptId, succeeded.attemptId);

  await writeCurrentDelivery({ rootDir, deliveryBuildId: buildId });
  const current = await readExecutionAttemptDiagnosticBaseline({
    rootDir,
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
    artifactSetFingerprint: plan.artifactSetFingerprint,
    compositionId: "StoryExample",
    fps: 30,
    frameCount: 120,
    width: 1080,
    height: 1920,
    policyVersion: "revision-artifact-sync-delivery-v1",
  } as const;
  const buildId = createDeliveryBuildId(identity);
  const succeeded = await openAttempt(rootDir);
  await appendExecutionAttemptDeliveryResult({
    rootDir,
    storyId: succeeded.storyId,
    revisionId: succeeded.revisionId,
    attemptId: succeeded.attemptId,
    result: {
      status: "verified",
      deliveryBuildId: buildId,
      diagnosticCode: null,
      deliveryMedia: ["video", "cover-4x3", "cover-3x4"],
    },
  });
  await writeCurrentDelivery({ rootDir, deliveryBuildId: buildId });

  const baseline = await readExecutionAttemptDiagnosticBaseline({
    rootDir,
    storyId: "story-example",
  });

  assert.equal(baseline?.kind, "latest-verified-attempt");
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
    openAttempt(rootDir),
    /Execution attempt parent is unsafe/u,
  );
  assert.deepEqual(await readdir(outsideRoot), []);
});

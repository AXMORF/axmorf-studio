import assert from "node:assert/strict";
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
  buildProducerPlan,
  buildProducerTaskSpec,
  ExecutionAttemptDeliveryResultSchema,
  type ProducerTaskSpec,
  type Sha256Digest,
} from "../../src/contracts";
import {
  appendExecutionAttemptDeliveryResult,
  appendExecutionAttemptTaskOutcome,
  createExecutionAttemptForPlan,
  readExecutionAttempt,
  readExecutionAttemptProgress,
} from "../../scripts/project-production/adapters/attempt-store";

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
    { id: "read:inputs/context.json", fingerprint: sha("2") },
  ],
  declaredReadSet: ["inputs/context.json"],
  declaredOutputSet: ["src/Renderer.tsx"],
  validatorPolicyVersion: "scene-owner-validator-v1",
});

const plan = buildProducerPlan({
  storyId: "story-example",
  revisionId,
  artifactSetFingerprint: sha("3"),
  tasks: [
    {
      taskRevision: task.taskRevision,
      taskKind: task.taskKind,
      semanticId: task.semanticId,
      status: "missing",
      reasonCode: "artifact-missing",
      dependencyTaskRevisions: [],
    },
  ],
  summary: {
    reusedTaskCount: 0,
    dirtyAgentTaskCount: 1,
    dirtyFixedTaskCount: 0,
    blockedTaskCount: 0,
  },
});

test("attempt diagnostics accept stable codes and reject raw sensitive details", () => {
  assert.throws(() =>
    ExecutionAttemptDeliveryResultSchema.parse({
      status: "failed",
      deliveryBuildId: null,
      diagnosticCode: "render failed at /home/user/private/token.json",
    }),
  );
});

test("attempt base records immutable plan and cache decisions", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-attempt-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const attempt = await createExecutionAttemptForPlan({
    rootDir,
    plan,
    state: "waiting-for-agent",
  });

  assert.equal(attempt.planFingerprint, plan.planFingerprint);
  assert.deepEqual(attempt.cacheDecisions, plan.tasks);
  const progress = await readExecutionAttemptProgress({
    rootDir,
    storyId: attempt.storyId,
    attemptId: attempt.attemptId,
  });
  assert.equal(progress?.eventCount, 1);
  assert.equal(progress?.deliveryResult.status, "not-verified");
  assert.deepEqual(progress?.taskOutcomes, []);
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
  assert.match(events[0] ?? "", /^[0-9a-f-]{36}\.json$/u);
});

test("task and delivery terminal events rebuild progress without mutating attempt.json", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-attempt-events-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const attempt = await createExecutionAttemptForPlan({
    rootDir,
    plan,
    state: "waiting-for-agent",
  });

  await appendExecutionAttemptTaskOutcome({
    rootDir,
    task,
    outcome: {
      outcome: "artifact-committed",
      artifactFingerprint: sha("4"),
      diagnosticCode: null,
    },
  });
  await appendExecutionAttemptDeliveryResult({
    rootDir,
    storyId: attempt.storyId,
    revisionId: attempt.revisionId,
    result: {
      status: "verified",
      deliveryBuildId: `delivery-${"5".repeat(64)}`,
      diagnosticCode: null,
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
  ) as { state: string; dirtyTaskRevisions: string[] };
  assert.equal(immutableAttempt.state, "waiting-for-agent");
  assert.deepEqual(immutableAttempt.dirtyTaskRevisions, [task.taskRevision]);

  const progress = await readExecutionAttemptProgress({
    rootDir,
    storyId: attempt.storyId,
    attemptId: attempt.attemptId,
  });
  assert.equal(progress?.eventCount, 3);
  assert.equal(progress?.state, "succeeded");
  assert.deepEqual(progress?.dirtyTaskRevisions, []);
  assert.deepEqual(progress?.taskOutcomeSummary, {
    committedTaskCount: 1,
    currentTaskCount: 0,
    failedTaskCount: 0,
  });
  assert.equal(progress?.deliveryResult.status, "verified");
  assert.equal(
    (
      await readExecutionAttempt({
        rootDir,
        storyId: attempt.storyId,
        attemptId: attempt.attemptId,
      })
    ).state,
    "succeeded",
  );
});

test("event replay ignores stale generated progress and terminal attempts never block a fresh diagnostic attempt", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-attempt-replay-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const attempt = await createExecutionAttemptForPlan({
    rootDir,
    plan,
    state: "waiting-for-agent",
  });
  await appendExecutionAttemptDeliveryResult({
    rootDir,
    storyId: attempt.storyId,
    revisionId: attempt.revisionId,
    result: {
      status: "failed",
      deliveryBuildId: null,
      diagnosticCode: "producer-artifacts-incomplete",
    },
  });
  await writeFile(
    join(
      rootDir,
      ".producer-attempts",
      attempt.storyId,
      attempt.attemptId,
      "progress.generated.json",
    ),
    "{}\n",
  );
  const failed = await readExecutionAttemptProgress({
    rootDir,
    storyId: attempt.storyId,
    attemptId: attempt.attemptId,
  });
  assert.equal(failed?.state, "failed");
  assert.equal(failed?.diagnosticCode, "producer-artifacts-incomplete");

  const fresh = await appendExecutionAttemptTaskOutcome({
    rootDir,
    task: task as ProducerTaskSpec,
    outcome: {
      outcome: "failed",
      artifactFingerprint: null,
      diagnosticCode: "producer-task-commit-failed",
    },
  });
  assert.notEqual(fresh.attemptId, attempt.attemptId);
  assert.equal(fresh.state, "converging");
  assert.equal(fresh.taskOutcomeSummary.failedTaskCount, 1);
  assert.equal(fresh.planFingerprint, null);
});

test("attempt diagnostics reject symlinked storage parents without writing outside the repository", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-attempt-symlink-root-"));
  const outsideRoot = await mkdtemp(
    join(tmpdir(), "rsp-attempt-symlink-outside-"),
  );
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  context.after(() => rm(outsideRoot, { recursive: true, force: true }));
  await symlink(outsideRoot, join(rootDir, ".producer-attempts"));

  await assert.rejects(
    readExecutionAttemptProgress({
      rootDir,
      storyId: plan.storyId,
      attemptId: "00000000-0000-4000-8000-000000000000",
    }),
    /Execution attempt parent is unsafe/u,
  );
  await assert.rejects(
    appendExecutionAttemptTaskOutcome({
      rootDir,
      task,
      outcome: {
        outcome: "failed",
        artifactFingerprint: null,
        diagnosticCode: "producer-task-commit-failed",
      },
    }),
    /Execution attempt parent is unsafe/u,
  );
  await assert.rejects(
    createExecutionAttemptForPlan({
      rootDir,
      plan,
      state: "waiting-for-agent",
    }),
    /Execution attempt parent is unsafe/u,
  );
  assert.deepEqual(await readdir(outsideRoot), []);

  await rm(join(rootDir, ".producer-attempts"));
  await mkdir(join(rootDir, ".producer-attempts"));
  const outsideStory = await mkdtemp(
    join(tmpdir(), "rsp-attempt-story-outside-"),
  );
  context.after(() => rm(outsideStory, { recursive: true, force: true }));
  await symlink(
    outsideStory,
    join(rootDir, ".producer-attempts", plan.storyId),
  );

  await assert.rejects(
    readExecutionAttemptProgress({
      rootDir,
      storyId: plan.storyId,
      attemptId: "00000000-0000-4000-8000-000000000000",
    }),
    /Execution attempt parent is unsafe/u,
  );
  await assert.rejects(
    createExecutionAttemptForPlan({
      rootDir,
      plan,
      state: "waiting-for-agent",
    }),
    /Execution attempt parent is unsafe/u,
  );
  assert.deepEqual(await readdir(outsideStory), []);
});

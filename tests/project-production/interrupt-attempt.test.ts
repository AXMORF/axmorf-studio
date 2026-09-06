import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildProducerPlan } from "@axmorf/studio/contracts";
import {
  claimExecutionAttemptContinuation,
  createExecutionAttemptForPlan,
  readExecutionAttemptProgress,
} from "../../scripts/project-production/adapters/attempt-store";
import {
  inspectAttemptInterruption,
  interruptAttempt,
} from "../../scripts/project-production/application/interrupt-attempt";
import {
  acquireRepositoryOperationLock,
  inspectRepositoryOperationLock,
} from "../../scripts/shared/repository-operation-lock";
import {
  registerOwnedProcess,
  withProcessDiagnosticScope,
} from "../../packages/studio/src/process/process-ownership";

const revisionId = `revision-${"1".repeat(64)}` as const;
const fixture = async (context: {
  after: (callback: () => Promise<void>) => void;
}) => {
  const rootDir = await mkdtemp(join(tmpdir(), "axmorf-interrupt-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const storyId = "interrupt-example";
  const plan = buildProducerPlan({
    storyId,
    revisionId,
    artifactSetFingerprint: `sha256:${"2".repeat(64)}`,
    tasks: [],
    summary: {
      reusedTaskCount: 0,
      dirtyAgentTaskCount: 0,
      dirtyFixedTaskCount: 0,
      blockedTaskCount: 0,
    },
  });
  const attempt = await createExecutionAttemptForPlan({
    rootDir,
    plan,
    taskSnapshots: [],
    estimatedCost: {
      providerRequests: 0,
      providerCacheHits: 0,
      agentTasks: 0,
      deliveryMedia: [],
    },
    actualCost: {
      providerRequests: 0,
      providerCacheHits: 0,
      agentTasks: 0,
      deliveryMedia: [],
    },
    state: "converging",
  });
  const input = { rootDir, projectId: storyId, attemptId: attempt.attemptId };
  const binding = { rootDir, storyId, attemptId: attempt.attemptId };
  const claim = await claimExecutionAttemptContinuation({
    ...binding,
    revisionId,
  });
  const directory = join(
    rootDir,
    ".producer-attempts",
    storyId,
    attempt.attemptId,
  );
  const claimPath = join(directory, "continuation.claim.json");
  const exited = {
    hostname: hostname(),
    pid: 2147483647,
    instanceId: randomUUID(),
  };
  const markExited = async () => {
    await writeFile(claimPath, JSON.stringify({ ...claim, process: exited }));
  };
  return { input, binding, claim, claimPath, directory, exited, markExited };
};

test("interrupted continuation inspect is read-only and terminalization preserves claim and immutable attempt", async (context) => {
  const f = await fixture(context);
  await f.markExited();
  const before = await readFile(join(f.directory, "attempt.json"));
  const claim = await readFile(f.claimPath);
  assert.equal(
    (await inspectAttemptInterruption(f.input)).status,
    "attempt-interruption-ready",
  );
  assert.equal(
    (await readExecutionAttemptProgress(f.binding))?.state,
    "converging",
  );
  assert.equal((await interruptAttempt(f.input)).status, "attempt-interrupted");
  assert.equal(
    (await readExecutionAttemptProgress(f.binding))?.diagnosticCode,
    "producer-continuation-interrupted",
  );
  assert.deepEqual(await readFile(join(f.directory, "attempt.json")), before);
  assert.deepEqual(await readFile(f.claimPath), claim);
  await assert.rejects(
    interruptAttempt(f.input),
    /terminal attempt is immutable/u,
  );
  assert.equal(
    await inspectRepositoryOperationLock({ rootDir: f.input.rootDir }),
    null,
  );
});

test("interruption refuses a live continuation, foreign host, and a legacy claim", async (context) => {
  const f = await fixture(context);
  await assert.rejects(
    inspectAttemptInterruption(f.input),
    /active or its liveness is unknown/u,
  );
  await writeFile(
    f.claimPath,
    JSON.stringify({
      ...f.claim,
      process: { ...f.exited, hostname: "other-host" },
    }),
  );
  await assert.rejects(
    inspectAttemptInterruption(f.input),
    /active or its liveness is unknown/u,
  );
  const legacy = {
    claimId: f.claim.claimId,
    attemptId: f.claim.attemptId,
    storyId: f.claim.storyId,
    revisionId: f.claim.revisionId,
  };
  await writeFile(f.claimPath, JSON.stringify({ ...legacy, schemaVersion: 1 }));
  await assert.rejects(inspectAttemptInterruption(f.input), /legacy/u);
});

test("explicit recovery archives only a matching dead convergence lock and releases the new lock", async (context) => {
  const f = await fixture(context);
  await f.markExited();
  await acquireRepositoryOperationLock({
    rootDir: f.input.rootDir,
    ownerId: "project-production-convergence",
  });
  const path = join(f.input.rootDir, ".project-operation.lock");
  const lock = JSON.parse(await readFile(path, "utf8"));
  await writeFile(path, JSON.stringify({ ...lock, process: f.exited }));
  assert.equal((await inspectAttemptInterruption(f.input)).staleLock, true);
  await interruptAttempt(f.input);
  assert.equal(
    JSON.parse(
      await readFile(
        join(f.directory, "interrupted-operation-lock.json"),
        "utf8",
      ),
    ).token,
    lock.token,
  );
  assert.equal(
    await inspectRepositoryOperationLock({ rootDir: f.input.rootDir }),
    null,
  );
});

test("interruption refuses unrelated and legacy locks without changing their bytes", async (context) => {
  const f = await fixture(context);
  await f.markExited();
  const path = join(f.input.rootDir, ".project-operation.lock");
  const bytes = JSON.stringify({
    schemaVersion: 1,
    ownerId: "project-production-convergence",
    token: randomUUID(),
  });
  await writeFile(path, bytes);
  await assert.rejects(interruptAttempt(f.input), /legacy/u);
  assert.equal(await readFile(path, "utf8"), bytes);
  await writeFile(
    path,
    JSON.stringify({
      schemaVersion: 2,
      ownerId: "project-delete",
      token: randomUUID(),
      process: f.exited,
    }),
  );
  await assert.rejects(interruptAttempt(f.input), /does not belong/u);
});

test("pending subprocess ownership fails closed", async (context) => {
  const f = await fixture(context);
  await withProcessDiagnosticScope(
    {
      rootDir: f.input.rootDir,
      storyId: f.binding.storyId,
      attemptId: f.input.attemptId,
    },
    () => registerOwnedProcess({ rootDir: f.input.rootDir }),
  );
  await assert.rejects(
    inspectAttemptInterruption(f.input, { inspectOwner: () => "exited" }),
    /subprocess is active or its liveness is unknown/u,
  );
});

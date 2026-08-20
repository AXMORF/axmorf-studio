import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { ExecutionAttemptSchema } from "../../src/contracts";
import { writeExecutionAttempt } from "../../scripts/project-production/adapters/attempt-store";
import { snapshotPolicyRoots } from "../../scripts/project-production/adapters/project-input-snapshot";
import { readProjectProductionProgress } from "../../settings/server/production-progress";

const write = async (path: string, bytes: string) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
};

test("malformed legacy .producer-runs cannot affect planner policy inputs", async (context) => {
  const rootDir = await mkdtemp(
    join(tmpdir(), "rsp-production-history-policy-"),
  );
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  await write(
    join(rootDir, "src/contracts/example.ts"),
    "export const contract = 1;\n",
  );
  await write(
    join(rootDir, "src/remotion/example.ts"),
    "export const runtime = 1;\n",
  );
  await write(join(rootDir, "package.json"), "{}\n");
  await write(join(rootDir, "package-lock.json"), "{}\n");
  await write(join(rootDir, "remotion.config.ts"), "export {};\n");

  const before = await snapshotPolicyRoots({ rootDir });
  await write(
    join(rootDir, ".producer-runs/not-even-a-run/run.json"),
    "{ definitely not json",
  );
  await write(
    join(rootDir, ".producer-runs/failed-run/events/0001.json"),
    JSON.stringify({ state: "failed", ownerReceipt: "legacy-only" }),
  );
  const after = await snapshotPolicyRoots({ rootDir });
  assert.equal(after, before);
});

test("settings progress ignores malformed and failed legacy Runs", async (context) => {
  const rootDir = await mkdtemp(
    join(tmpdir(), "rsp-production-history-progress-"),
  );
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  await mkdir(join(rootDir, "src/projects/story-example"), { recursive: true });
  await write(
    join(rootDir, ".producer-runs/malformed/run.json"),
    "{ malformed legacy run",
  );

  const withoutAttempt = await readProjectProductionProgress({ rootDir });
  assert.deepEqual(withoutAttempt, {
    schemaVersion: 4,
    projects: [
      {
        projectId: "story-example",
        status: "not-produced",
        revisionId: null,
        tasks: {
          reusedTaskCount: 0,
          dirtyAgentTaskCount: 0,
          dirtyFixedTaskCount: 0,
          blockedTaskCount: 0,
        },
        attempt: null,
        delivery: null,
        error: null,
      },
    ],
  });

  const now = "2026-08-20T00:00:00.000Z";
  const attempt = ExecutionAttemptSchema.parse({
    schemaVersion: 2,
    contractVersion: "execution-attempt-v2",
    attemptId: randomUUID(),
    storyId: "story-example",
    revisionId: `revision-${"1".repeat(64)}`,
    planFingerprint: `sha256:${"3".repeat(64)}`,
    artifactSetFingerprint: `sha256:${"4".repeat(64)}`,
    cacheDecisions: [],
    state: "waiting-for-agent",
    createdAt: now,
    updatedAt: now,
    dirtyTaskRevisions: [`task-${"2".repeat(64)}`],
    taskSummary: {
      reusedTaskCount: 2,
      dirtyAgentTaskCount: 1,
      dirtyFixedTaskCount: 0,
      blockedTaskCount: 0,
    },
    diagnosticCode: null,
  });
  await writeExecutionAttempt({ rootDir, attempt });
  await write(
    join(rootDir, ".producer-runs/failed/run.json"),
    JSON.stringify({ schemaVersion: 999, state: "failed" }),
  );

  const withAttempt = await readProjectProductionProgress({ rootDir });
  assert.equal(withAttempt.projects[0]?.status, "needs-agent");
  assert.equal(withAttempt.projects[0]?.revisionId, attempt.revisionId);
  assert.equal(withAttempt.projects[0]?.tasks.reusedTaskCount, 2);
  assert.equal(withAttempt.projects[0]?.tasks.dirtyAgentTaskCount, 1);
  assert.equal(withAttempt.projects[0]?.attempt?.attemptId, attempt.attemptId);
  assert.equal(withAttempt.projects[0]?.error, null);
});

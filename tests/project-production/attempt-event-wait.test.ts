import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  ExecutionAttemptEventWaitTimeoutError,
  hasNewExecutionAttemptEventFile,
  isExecutionAttemptEventLogChange,
  openExecutionAttemptEventWait,
} from "../../scripts/project-production/adapters/attempt-event-wait";
import { createRepositoryProductionLocations } from "../../scripts/project-production/application/production-locations";

test("attempt event wait accepts a filesystem notification without a filename", () => {
  assert.equal(isExecutionAttemptEventLogChange("rename", null), true);
  assert.equal(isExecutionAttemptEventLogChange("change", null), true);
  assert.equal(isExecutionAttemptEventLogChange("rename", "event.json"), true);
  assert.equal(
    isExecutionAttemptEventLogChange("rename", "ignored.tmp"),
    false,
  );
  assert.equal(isExecutionAttemptEventLogChange("unknown", null), false);
});

test("attempt event wait resolves from the immutable event log without polling", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-attempt-wait-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const locations = createRepositoryProductionLocations({
    repositoryRoot: rootDir,
  });
  const storyId = "story-example";
  const attemptId = "00000000-0000-4000-8000-000000000001";
  const directory = join(rootDir, ".producer-attempts", storyId, attemptId);
  const events = join(directory, "events");
  await mkdir(events, { recursive: true });
  const eventWait = openExecutionAttemptEventWait({
    locations,
    storyId,
    attemptId,
    timeoutMs: 10_000,
  });
  context.after(() => eventWait.close());
  await eventWait.ready;
  await writeFile(
    join(events, "00000000-0000-4000-8000-000000000002.json"),
    "{}\n",
  );
  await eventWait.changed;
  assert.ok(true);
});

test("attempt event wait accepts an already-written event at the deadline turn", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-attempt-wait-boundary-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const locations = createRepositoryProductionLocations({
    repositoryRoot: rootDir,
  });
  const storyId = "story-example";
  const attemptId = "00000000-0000-4000-8000-000000000001";
  const events = join(
    rootDir,
    ".producer-attempts",
    storyId,
    attemptId,
    "events",
  );
  await mkdir(events, { recursive: true });
  const eventWait = openExecutionAttemptEventWait({
    locations,
    storyId,
    attemptId,
    timeoutMs: 10,
  });
  context.after(() => eventWait.close());
  await eventWait.ready;

  writeFileSync(
    join(events, "00000000-0000-4000-8000-000000000002.json"),
    "{}\n",
  );
  const blockedUntil = Date.now() + 25;
  while (Date.now() < blockedUntil) {
    // Keep both the filesystem notification and deadline callback pending so
    // the adapter must resolve their same-turn ordering deliberately.
  }

  await eventWait.changed;
});

test("attempt event wait rejects at its bounded deadline", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-attempt-wait-timeout-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const locations = createRepositoryProductionLocations({
    repositoryRoot: rootDir,
  });
  const storyId = "story-example";
  const attemptId = "00000000-0000-4000-8000-000000000001";
  await mkdir(
    join(rootDir, ".producer-attempts", storyId, attemptId, "events"),
    { recursive: true },
  );
  const eventWait = openExecutionAttemptEventWait({
    locations,
    storyId,
    attemptId,
    timeoutMs: 10,
  });
  context.after(() => eventWait.close());
  await eventWait.ready;

  await assert.rejects(
    eventWait.changed,
    ExecutionAttemptEventWaitTimeoutError,
  );
});

test("attempt event deadline snapshot recognizes only new JSON event files", () => {
  const baseline = new Set([
    "00000000-0000-4000-8000-000000000001.json",
    "ignored.tmp",
  ]);
  assert.equal(
    hasNewExecutionAttemptEventFile(baseline, [
      "00000000-0000-4000-8000-000000000001.json",
      "new.tmp",
    ]),
    false,
  );
  assert.equal(
    hasNewExecutionAttemptEventFile(baseline, [
      "00000000-0000-4000-8000-000000000001.json",
      "00000000-0000-4000-8000-000000000002.json",
    ]),
    true,
  );
});

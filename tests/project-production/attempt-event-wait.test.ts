import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  containsNewExecutionAttemptEvent,
  ExecutionAttemptEventWaitTimeoutError,
  isExecutionAttemptEventNotification,
  openExecutionAttemptEventWait,
} from "../../scripts/project-production/adapters/attempt-event-wait";

test("attempt event notifications tolerate platforms that omit filenames", () => {
  assert.equal(isExecutionAttemptEventNotification("rename", null), true);
  assert.equal(isExecutionAttemptEventNotification("change", null), true);
  assert.equal(
    isExecutionAttemptEventNotification("rename", "event.json"),
    true,
  );
  assert.equal(
    isExecutionAttemptEventNotification("rename", "event.tmp"),
    false,
  );
  assert.equal(isExecutionAttemptEventNotification("unknown", null), false);
});

test("attempt event wait resolves from the immutable event log without polling", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-attempt-wait-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const storyId = "story-example";
  const attemptId = "00000000-0000-4000-8000-000000000001";
  const directory = join(rootDir, ".producer-attempts", storyId, attemptId);
  const events = join(directory, "events");
  await mkdir(events, { recursive: true });
  const eventWait = openExecutionAttemptEventWait({
    rootDir,
    storyId,
    attemptId,
    timeoutMs: 2_000,
  });
  context.after(() => eventWait.close());
  await eventWait.ready;
  await writeFile(
    join(events, "00000000-0000-4000-8000-000000000002.json"),
    "{}\n",
  );
  await Promise.race([
    eventWait.changed,
    new Promise<never>((_resolve, reject) =>
      setTimeout(
        () => reject(new Error("attempt event wait timed out")),
        2_000,
      ),
    ),
  ]);
  assert.ok(true);
});

test("attempt event wait accepts an event already installed at the deadline turn", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-attempt-wait-boundary-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
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
    rootDir,
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
    // Keep the notification and timer queued together so their ordering is
    // decided by the adapter rather than by test timing.
  }

  await eventWait.changed;
});

test("attempt event wait rejects at its bounded deadline", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-attempt-wait-timeout-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const storyId = "story-example";
  const attemptId = "00000000-0000-4000-8000-000000000001";
  await mkdir(
    join(rootDir, ".producer-attempts", storyId, attemptId, "events"),
    { recursive: true },
  );
  const eventWait = openExecutionAttemptEventWait({
    rootDir,
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

test("deadline snapshots distinguish new immutable JSON events from existing or temporary files", () => {
  const baseline = new Set([
    "00000000-0000-4000-8000-000000000001.json",
    "ignored.tmp",
  ]);
  assert.equal(
    containsNewExecutionAttemptEvent(baseline, [
      "00000000-0000-4000-8000-000000000001.json",
      "new.tmp",
    ]),
    false,
  );
  assert.equal(
    containsNewExecutionAttemptEvent(baseline, [
      "00000000-0000-4000-8000-000000000001.json",
      "00000000-0000-4000-8000-000000000002.json",
    ]),
    true,
  );
});

test("an event present before subscription is not reclassified as a new change", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-attempt-wait-baseline-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
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
  await writeFile(
    join(events, "00000000-0000-4000-8000-000000000002.json"),
    "{}\n",
  );
  const eventWait = openExecutionAttemptEventWait({
    rootDir,
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

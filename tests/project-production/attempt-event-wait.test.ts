import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  ExecutionAttemptEventWaitTimeoutError,
  openExecutionAttemptEventWait,
} from "../../scripts/project-production/adapters/attempt-event-wait";
import { createRepositoryProductionLocations } from "../../scripts/project-production/application/production-locations";

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

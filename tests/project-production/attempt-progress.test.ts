import assert from "node:assert/strict";
import test from "node:test";

import {
  ExecutionAttemptEventSchema,
  ExecutionAttemptSchema,
  type ExecutionAttemptTaskOutcome,
} from "@axmorf/studio/contracts";
import {
  createInitialAttemptProgress,
  projectAttemptProgress,
} from "../../scripts/project-production/domain/attempt-progress";

const taskRevision = (index: number) => `task-${String(index).repeat(64)}`;
const attempt = ExecutionAttemptSchema.parse({
  schemaVersion: 3,
  contractVersion: "execution-attempt-v3",
  attemptId: "00000000-0000-4000-8000-000000000000",
  storyId: "progress-test",
  revisionId: `revision-${"a".repeat(64)}`,
  planFingerprint: `sha256:${"b".repeat(64)}`,
  artifactSetFingerprint: `sha256:${"c".repeat(64)}`,
  taskExplanations: [],
  taskSnapshots: [],
  estimatedCost: {
    providerRequests: 0,
    providerCacheHits: 0,
    agentTasks: 3,
    deliveryMedia: [],
  },
  actualCost: {
    providerRequests: 0,
    providerCacheHits: 0,
    agentTasks: 3,
    deliveryMedia: [],
  },
  state: "waiting-for-agent",
  createdAt: "2026-09-08T00:00:00.000Z",
  updatedAt: "2026-09-08T00:00:00.000Z",
  dirtyTaskRevisions: [taskRevision(1), taskRevision(2), taskRevision(3)],
  taskSummary: {
    reusedTaskCount: 0,
    dirtyAgentTaskCount: 3,
    dirtyFixedTaskCount: 0,
    blockedTaskCount: 0,
  },
  diagnosticCode: null,
});

const taskEvent = (
  index: number,
  outcome: ExecutionAttemptTaskOutcome["outcome"],
) =>
  ExecutionAttemptEventSchema.parse({
    schemaVersion: 3,
    contractVersion: "execution-attempt-event-v3",
    eventId: `00000000-0000-4000-8000-00000000000${index}`,
    eventKind: "task-terminal",
    recordedAt: `2026-09-08T00:00:0${index}.000Z`,
    attemptId: attempt.attemptId,
    storyId: attempt.storyId,
    revisionId: attempt.revisionId,
    taskOutcome: {
      taskRevision: taskRevision(index),
      taskKind: "scene-owner",
      outcome,
      artifactFingerprint:
        outcome === "failed" ? null : `sha256:${"d".repeat(64)}`,
      diagnosticCode: outcome === "failed" ? "task-check-failed" : null,
    },
    deliveryResult: null,
  });

const deliveryEvent = (status: "verified" | "failed") =>
  ExecutionAttemptEventSchema.parse({
    schemaVersion: 3,
    contractVersion: "execution-attempt-event-v3",
    eventId: "00000000-0000-4000-8000-000000000004",
    eventKind: "delivery-terminal",
    recordedAt: "2026-09-08T00:00:04.000Z",
    attemptId: attempt.attemptId,
    storyId: attempt.storyId,
    revisionId: attempt.revisionId,
    taskOutcome: null,
    deliveryResult: {
      status,
      deliveryBuildId:
        status === "failed" ? null : `delivery-${"e".repeat(64)}`,
      diagnosticCode: status === "failed" ? "delivery-check-failed" : null,
      deliveryMedia:
        status === "failed" ? [] : ["video", "cover-4x3", "cover-3x4"],
    },
  });

test("empty event projection preserves initial progress", () => {
  assert.deepEqual(
    projectAttemptProgress({ attempt, events: [] }),
    createInitialAttemptProgress(attempt, 0),
  );
});

test("task projection is order independent and never mutates its inputs", () => {
  const events = [
    taskEvent(3, "failed"),
    taskEvent(1, "artifact-committed"),
    taskEvent(2, "artifact-current"),
  ];
  const before = JSON.stringify({ attempt, events });
  const progress = projectAttemptProgress({ attempt, events });
  assert.deepEqual(
    progress,
    projectAttemptProgress({ attempt, events: [...events].reverse() }),
  );
  assert.equal(JSON.stringify({ attempt, events }), before);
  assert.deepEqual(progress.dirtyTaskRevisions, [taskRevision(3)]);
  assert.deepEqual(progress.taskOutcomeSummary, {
    committedTaskCount: 1,
    currentTaskCount: 1,
    failedTaskCount: 1,
  });
  assert.equal(progress.state, "waiting-for-agent");
  assert.equal(progress.updatedAt, "2026-09-08T00:00:03.000Z");
  assert.equal(progress.eventCount, 3);
});

test("delivery terminal alone determines terminal state and media costs", () => {
  for (const status of ["verified", "failed"] as const) {
    const event = deliveryEvent(status);
    const progress = projectAttemptProgress({ attempt, events: [event] });
    assert.equal(
      progress.state,
      status === "verified" ? "succeeded" : "failed",
    );
    assert.equal(progress.diagnosticCode, event.deliveryResult?.diagnosticCode);
    assert.deepEqual(
      progress.actualCost.deliveryMedia,
      event.deliveryResult?.deliveryMedia,
    );
    assert.equal(progress.actualCost.agentTasks, attempt.actualCost.agentTasks);
  }
});

test("projection rejects duplicate task and delivery terminal events", () => {
  const task = taskEvent(1, "artifact-committed");
  assert.throws(
    () => projectAttemptProgress({ attempt, events: [task, task] }),
    /duplicate task terminal/,
  );
  const delivery = deliveryEvent("verified");
  assert.throws(
    () => projectAttemptProgress({ attempt, events: [delivery, delivery] }),
    /duplicate delivery terminal/,
  );
});

test("projection rejects events bound to another attempt, story or revision", () => {
  const event = taskEvent(1, "artifact-committed");
  for (const patch of [
    { attemptId: "00000000-0000-4000-8000-000000000005" },
    { storyId: "other-story" },
    { revisionId: `revision-${"f".repeat(64)}` },
  ]) {
    const crossBound = ExecutionAttemptEventSchema.parse({
      ...event,
      ...patch,
    });
    assert.throws(
      () => projectAttemptProgress({ attempt, events: [crossBound] }),
      /identity is cross-bound/,
    );
  }
});

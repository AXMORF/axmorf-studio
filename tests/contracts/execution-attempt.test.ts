import assert from "node:assert/strict";
import test from "node:test";

import {
  ExecutionAttemptSchema,
  TaskDiagnosticSnapshotSchema,
} from "@axmorf/studio/contracts";

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;
const taskRevision = `task-${"1".repeat(64)}` as const;
const revisionId = `revision-${"2".repeat(64)}` as const;

const decision = {
  taskKind: "narration-chunk" as const,
  subject: { kind: "tts-chunk" as const, id: "chunk-one" },
  taskRevision,
  baselineTaskRevision: null,
  action: "prepare-fixed" as const,
  artifactState: "missing" as const,
  directChanges: [],
  dependencyChanges: [],
  blockedBy: [],
  explanationAvailability: "baseline-unavailable" as const,
};

const snapshot = {
  taskKind: "narration-chunk" as const,
  subject: { kind: "tts-chunk" as const, id: "chunk-one" },
  taskRevision,
  inputFingerprints: [
    { id: "provider-attempt" as const, fingerprint: sha("3") },
    { id: "tts-chunk" as const, fingerprint: sha("4") },
  ],
  validatorPolicyVersion: "narration-chunk-validator-v1",
  declaredReadSet: ["inputs/context.json"],
  declaredOutputSet: ["public/chunk.wav"],
  dependencies: [],
  decision,
};

test("diagnostic task snapshot is strict, sorted, and decision-bound", () => {
  assert.doesNotThrow(() => TaskDiagnosticSnapshotSchema.parse(snapshot));
  assert.throws(() =>
    TaskDiagnosticSnapshotSchema.parse({
      ...snapshot,
      inputFingerprints: [...snapshot.inputFingerprints].reverse(),
    }),
  );
  assert.throws(() =>
    TaskDiagnosticSnapshotSchema.parse({
      ...snapshot,
      inputFingerprints: [{ id: "private-secret", fingerprint: sha("3") }],
    }),
  );
  assert.throws(() =>
    TaskDiagnosticSnapshotSchema.parse({
      ...snapshot,
      decision: { ...decision, taskRevision: `task-${"5".repeat(64)}` },
    }),
  );
});

test("execution attempt v3 persists chunk-distinct diagnostic snapshots", () => {
  const attempt = ExecutionAttemptSchema.parse({
    schemaVersion: 3,
    contractVersion: "execution-attempt-v3",
    attemptId: "00000000-0000-4000-8000-000000000000",
    storyId: "story-example",
    revisionId,
    planFingerprint: sha("6"),
    artifactSetFingerprint: sha("7"),
    taskExplanations: [
      decision,
      {
        ...decision,
        subject: { kind: "tts-chunk", id: "chunk-two" },
        taskRevision: `task-${"8".repeat(64)}`,
      },
    ].sort((left, right) =>
      left.taskRevision.localeCompare(right.taskRevision),
    ),
    taskSnapshots: [
      snapshot,
      {
        ...snapshot,
        subject: { kind: "tts-chunk", id: "chunk-two" },
        taskRevision: `task-${"8".repeat(64)}`,
        decision: {
          ...decision,
          subject: { kind: "tts-chunk", id: "chunk-two" },
          taskRevision: `task-${"8".repeat(64)}`,
        },
      },
    ].sort((left, right) =>
      left.taskRevision.localeCompare(right.taskRevision),
    ),
    estimatedCost: {
      providerRequests: 2,
      providerCacheHits: 0,
      agentTasks: 0,
      deliveryMedia: [],
    },
    actualCost: {
      providerRequests: 2,
      providerCacheHits: 0,
      agentTasks: 0,
      deliveryMedia: [],
    },
    state: "waiting-for-agent",
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
    dirtyTaskRevisions: [taskRevision],
    taskSummary: {
      reusedTaskCount: 0,
      dirtyAgentTaskCount: 0,
      dirtyFixedTaskCount: 2,
      blockedTaskCount: 0,
    },
    diagnosticCode: null,
  });
  assert.deepEqual(
    attempt.taskSnapshots.map(({ subject }) => subject.id).sort(),
    ["chunk-one", "chunk-two"],
  );
  assert.equal("cacheDecisions" in attempt, false);
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  ProductionInspectionSchema,
  TaskDecisionExplanationSchema,
} from "../../src/contracts/production-inspection";

const task = `task-${"1".repeat(64)}` as const;
const revision = `revision-${"2".repeat(64)}` as const;

test("task explanation keeps artifact state and direct changes orthogonal", () => {
  const explanation = TaskDecisionExplanationSchema.parse({
    taskKind: "scene-owner",
    subject: { kind: "meaning", id: "opening" },
    taskRevision: task,
    baselineTaskRevision: `task-${"3".repeat(64)}`,
    action: "dispatch-agent",
    artifactState: "missing",
    directChanges: [{ kind: "input", id: "brief" }],
    dependencyChanges: [],
    blockedBy: [],
    explanationAvailability: "complete",
  });

  assert.equal(explanation.artifactState, "missing");
  assert.deepEqual(explanation.directChanges, [{ kind: "input", id: "brief" }]);
});

test("diagnostic labels are strict, safe, sorted, and subject-bound", () => {
  const base = {
    taskKind: "narration-chunk" as const,
    subject: { kind: "tts-chunk" as const, id: "chunk-one" },
    taskRevision: task,
    baselineTaskRevision: `task-${"4".repeat(64)}`,
    action: "prepare-fixed" as const,
    artifactState: "missing" as const,
    directChanges: [
      { kind: "input" as const, id: "provider-attempt" as const },
      { kind: "input" as const, id: "tts-chunk" as const },
    ],
    dependencyChanges: [],
    blockedBy: [],
    explanationAvailability: "complete" as const,
  };
  assert.doesNotThrow(() => TaskDecisionExplanationSchema.parse(base));
  assert.throws(() =>
    TaskDecisionExplanationSchema.parse({
      ...base,
      directChanges: [...base.directChanges].reverse(),
    }),
  );
  assert.throws(() =>
    TaskDecisionExplanationSchema.parse({
      ...base,
      directChanges: [{ kind: "input", id: "/home/user/private/token" }],
    }),
  );
  assert.throws(() =>
    TaskDecisionExplanationSchema.parse({
      ...base,
      subject: { kind: "meaning", id: "chunk-one" },
    }),
  );
});

test("production inspection validates baseline, estimates, task order, and project subject", () => {
  const inspection = ProductionInspectionSchema.parse({
    schemaVersion: 1,
    contractVersion: "production-inspection-v1",
    storyId: "story-example",
    sourceState: "production-inputs-ready",
    currentRevisionId: revision,
    sourceCurrentId: null,
    deliveryBuildId: null,
    baseline: { kind: "none", revisionId: null },
    estimatedCost: {
      providerRequests: null,
      providerCacheHits: 0,
      agentTasks: 1,
      deliveryMedia: ["video", "cover-4x3", "cover-3x4"],
    },
    tasks: [
      {
        taskKind: "composition-convergence",
        subject: { kind: "project", id: "story-example" },
        taskRevision: task,
        baselineTaskRevision: null,
        action: "blocked",
        artifactState: "missing",
        directChanges: [],
        dependencyChanges: [],
        blockedBy: [
          {
            taskKind: "scene-owner",
            subjectId: "opening",
            taskRevision: `task-${"3".repeat(64)}`,
          },
        ],
        explanationAvailability: "baseline-unavailable",
      },
    ],
    nextAction: "prepare-production",
  });
  assert.equal(inspection.estimatedCost.providerRequests, null);
  assert.equal(inspection.sourceCurrentId, null);
  assert.equal(inspection.deliveryBuildId, null);
  assert.throws(() =>
    ProductionInspectionSchema.parse({
      ...inspection,
      baseline: { kind: "current-delivery", revisionId: null },
    }),
  );
  assert.throws(() =>
    ProductionInspectionSchema.parse({
      ...inspection,
      deliveryBuildId: `delivery-${"5".repeat(64)}`,
    }),
  );
  assert.throws(() =>
    ProductionInspectionSchema.parse({
      ...inspection,
      tasks: [
        {
          ...inspection.tasks[0],
          subject: { kind: "project", id: "another-story" },
        },
      ],
    }),
  );
});

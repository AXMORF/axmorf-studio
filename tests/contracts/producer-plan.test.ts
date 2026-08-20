import assert from "node:assert/strict";
import test from "node:test";

import { buildProducerPlan } from "../../src/contracts/producer-plan";

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;
const revisionId = `revision-${"1".repeat(64)}` as const;
const taskA = `task-${"1".repeat(64)}` as const;
const taskB = `task-${"2".repeat(64)}` as const;

const sceneDecision = {
  taskRevision: taskA,
  baselineTaskRevision: `task-${"6".repeat(64)}`,
  taskKind: "scene-owner" as const,
  subject: { kind: "meaning" as const, id: "opening" },
  action: "dispatch-agent" as const,
  artifactState: "missing" as const,
  directChanges: [{ kind: "input" as const, id: "brief" as const }],
  dependencyChanges: [],
  blockedBy: [],
  explanationAvailability: "complete" as const,
};
const deliveryDecision = {
  taskRevision: taskB,
  baselineTaskRevision: null,
  taskKind: "delivery-build" as const,
  subject: { kind: "project" as const, id: "story-example" },
  action: "blocked" as const,
  artifactState: "missing" as const,
  directChanges: [],
  dependencyChanges: [],
  blockedBy: [
    { taskKind: "scene-owner" as const, subjectId: "opening", taskRevision: taskA },
  ],
  explanationAvailability: "baseline-unavailable" as const,
};

test("plan is stable, sorted, and derives mechanical summary from explanations", () => {
  const plan = buildProducerPlan({
    storyId: "story-example",
    revisionId,
    artifactSetFingerprint: sha("3"),
    tasks: [sceneDecision, deliveryDecision],
    summary: { reusedTaskCount: 0, dirtyAgentTaskCount: 1, dirtyFixedTaskCount: 0, blockedTaskCount: 1 },
  });
  assert.equal(plan.tasks.length, 2);
  assert.throws(() => buildProducerPlan({
    ...plan,
    tasks: [...plan.tasks].reverse(),
  }));
  assert.throws(() => buildProducerPlan({
    ...plan,
    summary: { ...plan.summary, dirtyAgentTaskCount: 0 },
  }));
});

test("plan explanation metadata is diagnostic-only", () => {
  const first = buildProducerPlan({
    storyId: "story-example",
    revisionId,
    artifactSetFingerprint: sha("3"),
    tasks: [sceneDecision, deliveryDecision],
    summary: { reusedTaskCount: 0, dirtyAgentTaskCount: 1, dirtyFixedTaskCount: 0, blockedTaskCount: 1 },
  });
  const explainedFromAnotherBaseline = buildProducerPlan({
    ...first,
    tasks: [
      { ...sceneDecision, explanationAvailability: "complete", baselineTaskRevision: `task-${"4".repeat(64)}` },
      { ...deliveryDecision, explanationAvailability: "complete", baselineTaskRevision: `task-${"5".repeat(64)}` },
    ],
  });
  assert.equal(explainedFromAnotherBaseline.revisionId, first.revisionId);
  assert.equal(explainedFromAnotherBaseline.artifactSetFingerprint, first.artifactSetFingerprint);
  assert.notEqual(explainedFromAnotherBaseline.planFingerprint, first.planFingerprint);
});

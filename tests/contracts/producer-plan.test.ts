import assert from "node:assert/strict";
import test from "node:test";

import { buildProducerPlan } from "../../src/contracts";

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;
const revisionId = `revision-${"1".repeat(64)}` as const;
const taskA = `task-${"1".repeat(64)}` as const;
const taskB = `task-${"2".repeat(64)}` as const;

test("plan is stable, sorted, and derives mechanical summary", () => {
  const plan = buildProducerPlan({
    storyId: "story-example",
    revisionId,
    artifactSetFingerprint: sha("3"),
    tasks: [
      { taskRevision: taskA, taskKind: "scene-owner", semanticId: "opening", status: "dirty", reasonCode: "artifact-missing", dependencyTaskRevisions: [] },
      { taskRevision: taskB, taskKind: "delivery-build", semanticId: null, status: "blocked", reasonCode: "dependency-blocked", dependencyTaskRevisions: [taskA] },
    ],
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

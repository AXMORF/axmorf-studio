import assert from "node:assert/strict";
import test from "node:test";

import {
  buildProducerTaskSpec,
  type ProducerTaskSpec,
} from "@axmorf/studio/contracts";
import {
  buildTaskDiagnosticSnapshots,
  explainTaskDecisions,
} from "../../scripts/project-production/domain/task-explanation";

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;
const revisionId = `revision-${"1".repeat(64)}` as const;

const build = ({
  taskKind,
  semanticId = null,
  input = "brief",
  value,
  dependencies = [],
}: {
  readonly taskKind:
    | "scene-owner"
    | "composition-convergence"
    | "delivery-build";
  readonly semanticId?: string | null;
  readonly input?: string;
  readonly value: string;
  readonly dependencies?: readonly ProducerTaskSpec[];
}): ProducerTaskSpec =>
  buildProducerTaskSpec({
    taskKind,
    storyId: "story-example",
    semanticId,
    revisionId,
    dependencyArtifacts: dependencies
      .map((task) => ({
        taskRevision: task.taskRevision,
        artifactFingerprint: sha("f"),
      }))
      .sort((left, right) =>
        left.taskRevision.localeCompare(right.taskRevision),
      ),
    inputFingerprints: [{ id: input, fingerprint: sha(value) }],
    declaredReadSet: [],
    declaredOutputSet: ["project/output.json"],
    validatorPolicyVersion: `${taskKind}-validator-v1`,
  });

test("one Scene brief change is direct while downstream blocking follows exact DAG edges", () => {
  const oldSceneA = build({
    taskKind: "scene-owner",
    semanticId: "scene-a",
    value: "1",
  });
  const sceneA = build({
    taskKind: "scene-owner",
    semanticId: "scene-a",
    value: "2",
  });
  const sceneB = build({
    taskKind: "scene-owner",
    semanticId: "scene-b",
    value: "3",
  });
  const composition = build({
    taskKind: "composition-convergence",
    input: "runtime",
    value: "4",
    dependencies: [sceneA, sceneB],
  });
  const delivery = build({
    taskKind: "delivery-build",
    input: "publishing",
    value: "5",
    dependencies: [composition],
  });
  const nodes = [sceneA, sceneB, composition, delivery]
    .map((task) => ({
      task,
      dependencyTaskRevisions: task.dependencyArtifacts.map(
        ({ taskRevision }) => taskRevision,
      ),
    }))
    .sort((left, right) =>
      left.task.taskRevision.localeCompare(right.task.taskRevision),
    );
  const baselineNodes = [oldSceneA, sceneB]
    .map((task) => ({
      task,
      dependencyTaskRevisions: task.dependencyArtifacts.map(
        ({ taskRevision }) => taskRevision,
      ),
    }))
    .sort((left, right) =>
      left.task.taskRevision.localeCompare(right.task.taskRevision),
    );
  const subjects = new Map([
    [sceneA.taskRevision, { kind: "meaning" as const, id: sceneA.semanticId! }],
    [sceneB.taskRevision, { kind: "meaning" as const, id: sceneB.semanticId! }],
    [
      composition.taskRevision,
      { kind: "project" as const, id: composition.storyId },
    ],
    [delivery.taskRevision, { kind: "project" as const, id: delivery.storyId }],
  ]);
  const baselineSubjects = new Map([
    [
      oldSceneA.taskRevision,
      { kind: "meaning" as const, id: oldSceneA.semanticId! },
    ],
    [sceneB.taskRevision, { kind: "meaning" as const, id: sceneB.semanticId! }],
  ]);
  const baseline = buildTaskDiagnosticSnapshots({
    nodes: baselineNodes,
    subjects: baselineSubjects,
    decisions: [],
  });
  const decisions = explainTaskDecisions({
    storyId: "story-example",
    nodes,
    subjects,
    inspections: new Map(
      nodes.map(({ task }) => [
        task.taskRevision,
        { artifactState: "missing" as const, attestation: null },
      ]),
    ),
    baselineSnapshots: baseline,
  });

  assert.deepEqual(
    decisions.find(({ subject }) => subject.id === "scene-a")?.directChanges,
    [{ kind: "input", id: "brief" }],
  );
  assert.deepEqual(
    decisions.find(({ subject }) => subject.id === "scene-b")?.directChanges,
    [],
  );
  assert.deepEqual(
    decisions.find(({ taskKind }) => taskKind === "composition-convergence")
      ?.blockedBy,
    [
      {
        taskKind: "scene-owner",
        subjectId: "scene-a",
        taskRevision: sceneA.taskRevision,
      },
      {
        taskKind: "scene-owner",
        subjectId: "scene-b",
        taskRevision: sceneB.taskRevision,
      },
    ].sort((left, right) =>
      `${left.taskKind}:${left.subjectId}`.localeCompare(
        `${right.taskKind}:${right.subjectId}`,
      ),
    ),
  );
  assert.deepEqual(
    decisions.find(({ taskKind }) => taskKind === "delivery-build")?.blockedBy,
    [
      {
        taskKind: "composition-convergence",
        subjectId: "story-example",
        taskRevision: composition.taskRevision,
      },
    ],
  );
});

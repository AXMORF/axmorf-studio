import assert from "node:assert/strict";
import test from "node:test";

import {
  buildProducerTaskSpec,
  buildProductionRevision,
  TaskRevisionSchema,
} from "../../src/contracts";
import { createProducerPlan } from "../../scripts/project-production/domain/plan";

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;
const revision = buildProductionRevision({
  storyId: "story-example",
  storyFingerprint: sha("1"), narrationFingerprint: sha("2"), renderFingerprint: sha("3"),
  visualStyleFingerprint: sha("4"), publishingIntentFingerprint: sha("5"), projectSoundFingerprint: sha("6"),
  authoringRequirementsFingerprint: sha("7"), globalVisualBriefFingerprint: sha("8"),
  storyResourcePoolFingerprint: sha("9"), projectAssetManifestFingerprint: sha("a"),
  narrationGenerationFingerprint: sha("b"), scenes: [], selectedResources: [], policyFingerprints: [],
});

test("plan classifies dependencies topologically even when hash ordering is reversed", () => {
  const dependency = buildProducerTaskSpec({
    taskKind: "narration-chunk", storyId: revision.storyId, semanticId: null,
    revisionId: revision.revisionId, dependencyArtifacts: [],
    inputFingerprints: [{ id: "chunk", fingerprint: sha("c") }],
    declaredReadSet: [], declaredOutputSet: ["public/chunk.wav"], validatorPolicyVersion: "chunk-v1",
  });
  let dependent = buildProducerTaskSpec({
    taskKind: "semantic-timing", storyId: revision.storyId, semanticId: null,
    revisionId: revision.revisionId,
    dependencyArtifacts: [{ taskRevision: dependency.taskRevision, artifactFingerprint: sha("d") }],
    inputFingerprints: [{ id: "timing", fingerprint: sha("e") }],
    declaredReadSet: [], declaredOutputSet: ["project/timing.json"], validatorPolicyVersion: "timing-v0",
  });
  for (let index = 1; dependent.taskRevision > dependency.taskRevision && index < 100; index += 1) {
    dependent = buildProducerTaskSpec({
      ...dependent,
      validatorPolicyVersion: `timing-v${index}`,
    });
  }
  assert.ok(dependent.taskRevision < dependency.taskRevision, "fixture must reverse topological hash order");
  const nodes = [
    { task: dependent, dependencyTaskRevisions: [dependency.taskRevision] },
    { task: dependency, dependencyTaskRevisions: [] },
  ].sort((left, right) => left.task.taskRevision.localeCompare(right.task.taskRevision));
  const plan = createProducerPlan({ revision, nodes, inspections: new Map() });
  assert.equal(plan.tasks.find(({ taskRevision }) => taskRevision === dependency.taskRevision)?.action, "prepare-fixed");
  assert.equal(plan.tasks.find(({ taskRevision }) => taskRevision === dependent.taskRevision)?.action, "blocked");
});

test("DAG rejects dependencies that are not bound by ArtifactAttestation identity", () => {
  const task = buildProducerTaskSpec({
    taskKind: "semantic-timing", storyId: revision.storyId, semanticId: null,
    revisionId: revision.revisionId, dependencyArtifacts: [],
    inputFingerprints: [{ id: "timing", fingerprint: sha("f") }],
    declaredReadSet: [], declaredOutputSet: ["project/timing.json"], validatorPolicyVersion: "timing-v1",
  });
  assert.throws(
    () => createProducerPlan({
      revision,
      nodes: [{
        task,
        dependencyTaskRevisions: [TaskRevisionSchema.parse(`task-${"0".repeat(64)}`)],
      }],
      inspections: new Map(),
    }),
    /unknown dependency|not artifact-bound/,
  );
});

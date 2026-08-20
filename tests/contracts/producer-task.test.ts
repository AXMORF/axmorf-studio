import assert from "node:assert/strict";
import test from "node:test";

import { buildProducerTaskSpec, buildProductionRevision } from "../../src/contracts";

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;
const revisionId = buildProductionRevision({
  storyId: "story-example",
  storyFingerprint: sha("1"), narrationFingerprint: sha("2"), renderFingerprint: sha("3"),
  visualStyleFingerprint: sha("4"), publishingIntentFingerprint: sha("5"), projectSoundFingerprint: sha("6"),
  authoringRequirementsFingerprint: sha("7"), globalVisualBriefFingerprint: sha("8"),
  storyResourcePoolFingerprint: sha("9"), projectAssetManifestFingerprint: sha("a"),
  narrationGenerationFingerprint: sha("b"), scenes: [], selectedResources: [], policyFingerprints: [],
}).revisionId;

const taskInput = {
  taskKind: "scene-owner",
  storyId: "story-example",
  semanticId: "opening",
  revisionId,
  dependencyArtifacts: [],
  inputFingerprints: [
    { id: "brief", fingerprint: sha("c") },
    { id: "read:inputs/brief.json", fingerprint: sha("e") },
  ],
  declaredReadSet: ["inputs/brief.json"],
  declaredOutputSet: ["src/Renderer.tsx"],
  validatorPolicyVersion: "scene-validator-v1",
} as const;

test("task identity depends on inputs and task-local validator policy only", () => {
  const original = buildProducerTaskSpec({ ...taskInput, attemptId: "ignored" });
  assert.equal(
    original.taskRevision,
    buildProducerTaskSpec({ ...taskInput, attemptId: "also-ignored", runId: "ignored" }).taskRevision,
  );
  assert.notEqual(
    original.taskRevision,
    buildProducerTaskSpec({
      ...taskInput,
      inputFingerprints: [
        { id: "brief", fingerprint: sha("d") },
        { id: "read:inputs/brief.json", fingerprint: sha("e") },
      ],
    }).taskRevision,
  );
  assert.notEqual(
    original.taskRevision,
    buildProducerTaskSpec({ ...taskInput, validatorPolicyVersion: "scene-validator-v2" }).taskRevision,
  );
  const anotherRevisionId = buildProductionRevision({
    storyId: "story-example",
    storyFingerprint: sha("f"), narrationFingerprint: sha("2"), renderFingerprint: sha("3"),
    visualStyleFingerprint: sha("4"), publishingIntentFingerprint: sha("5"), projectSoundFingerprint: sha("6"),
    authoringRequirementsFingerprint: sha("7"), globalVisualBriefFingerprint: sha("8"),
    storyResourcePoolFingerprint: sha("9"), projectAssetManifestFingerprint: sha("a"),
    narrationGenerationFingerprint: sha("b"), scenes: [], selectedResources: [], policyFingerprints: [],
  }).revisionId;
  assert.equal(
    original.taskRevision,
    buildProducerTaskSpec({ ...taskInput, revisionId: anotherRevisionId }).taskRevision,
    "the Project-wide revision is diagnostic context, not a task-local cache key",
  );
});

test("task contract rejects path escape, unstable sets, and semantic mismatch", () => {
  assert.throws(() => buildProducerTaskSpec({ ...taskInput, declaredOutputSet: ["../escape"] }));
  assert.throws(() => buildProducerTaskSpec({
    ...taskInput,
    declaredReadSet: ["z", "a"],
  }));
  assert.throws(() => buildProducerTaskSpec({ ...taskInput, taskKind: "cover-owner" }));
});

import assert from "node:assert/strict";
import test from "node:test";

import { buildProductionRevision } from "../../src/contracts";

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;

const input = {
  storyId: "story-example",
  storyFingerprint: sha("1"),
  narrationFingerprint: sha("2"),
  renderFingerprint: sha("3"),
  visualStyleFingerprint: sha("4"),
  publishingIntentFingerprint: sha("5"),
  projectSoundFingerprint: sha("6"),
  authoringRequirementsFingerprint: sha("7"),
  globalVisualBriefFingerprint: sha("8"),
  storyResourcePoolFingerprint: sha("9"),
  projectAssetManifestFingerprint: sha("a"),
  narrationGenerationFingerprint: sha("b"),
  scenes: [
    {
      meaningId: "opening",
      beatFingerprint: sha("c"),
      timingFingerprint: sha("d"),
      readabilityFingerprint: sha("e"),
      briefFingerprint: sha("f"),
      requirementsFingerprint: sha("0"),
      resourcePoolFingerprint: sha("1"),
      selectedResourcesFingerprint: sha("2"),
      templateInstanceFingerprint: null,
    },
  ],
  selectedResources: [{ id: "asset-1", fingerprint: sha("3") }],
  policyFingerprints: [{ id: "runtime", fingerprint: sha("4") }],
} as const;

test("Revision identity excludes attempt, run, time, and absolute path diagnostics", () => {
  const left = buildProductionRevision({
    ...input,
    attemptId: crypto.randomUUID(),
    runId: "legacy-run-a",
    createdAt: "2026-08-20T00:00:00Z",
    rootDir: "/tmp/a",
  });
  const right = buildProductionRevision({
    ...input,
    attemptId: crypto.randomUUID(),
    runId: "legacy-run-b",
    createdAt: "2027-01-01T00:00:00Z",
    rootDir: "/tmp/b",
  });
  assert.equal(left.revisionId, right.revisionId);
});
test("Revision invalidates exact authored and policy inputs", () => {
  const original = buildProductionRevision(input);
  assert.notEqual(
    original.revisionId,
    buildProductionRevision({ ...input, storyFingerprint: sha("5") }).revisionId,
  );
  assert.notEqual(
    original.revisionId,
    buildProductionRevision({
      ...input,
      scenes: [{ ...input.scenes[0], briefFingerprint: sha("6") }],
    }).revisionId,
  );
  assert.throws(() =>
    buildProductionRevision({
      ...input,
      selectedResources: [
        { id: "z", fingerprint: sha("1") },
        { id: "a", fingerprint: sha("2") },
      ],
    }),
  );
});

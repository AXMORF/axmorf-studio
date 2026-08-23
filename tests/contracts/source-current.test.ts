import assert from "node:assert/strict";
import test from "node:test";

import {
  SourceCurrentAttestationSchema,
  buildSourceCurrentAttestation,
  resolveDeliveryPolicy,
  serializeCanonicalJson,
} from "../../src/contracts";

const digest = (value: string) => `sha256:${value.repeat(64)}`;
const revisionId = `revision-${"a".repeat(64)}`;
const taskRevision = `task-${"b".repeat(64)}`;

const source = () =>
  buildSourceCurrentAttestation({
    storyId: "phase-b-contract",
    revisionId,
    artifacts: [
      { taskRevision, artifactFingerprint: digest("c") },
    ],
    files: [
      {
        logicalPath: "project/Composition.generated.tsx",
        checksum: digest("d"),
        sizeBytes: 42,
      },
    ],
    validators: [
      { id: "source-materialization", version: "source-materialization-v1" },
    ],
  });

test("SourceCurrentAttestation is canonical, strict, and identity-bound", () => {
  const current = source();
  assert.match(current.sourceCurrentId, /^source-current-[a-f0-9]{64}$/u);
  assert.equal(
    SourceCurrentAttestationSchema.parse(
      JSON.parse(serializeCanonicalJson(current)),
    ).sourceCurrentId,
    current.sourceCurrentId,
  );
  assert.throws(() =>
    SourceCurrentAttestationSchema.parse({ ...current, attemptId: "attempt" }),
  );
  assert.throws(() =>
    SourceCurrentAttestationSchema.parse({
      ...current,
      files: [{ ...current.files[0], checksum: digest("e") }],
    }),
  );
});

test("source identity excludes delivery policy, runtime, path, clock, and attempt", () => {
  const current = source();
  const serialized = serializeCanonicalJson(current);
  assert.doesNotMatch(
    serialized,
    /manual|automatic|runtime|architecture|absolute|attempt|createdAt/iu,
  );
  assert.equal(
    resolveDeliveryPolicy({ appDefault: "manual" }),
    "manual",
  );
  assert.equal(
    resolveDeliveryPolicy({
      appDefault: "manual",
      project: "automatic",
      override: "manual",
    }),
    "manual",
  );
});

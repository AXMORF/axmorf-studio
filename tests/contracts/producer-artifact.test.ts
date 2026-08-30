import assert from "node:assert/strict";
import test from "node:test";

import {
  ArtifactAttestationSchema,
  buildArtifactAttestation,
} from "@axmorf/studio/contracts";

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;
const base = {
  storyId: "story-example",
  taskKind: "cover-owner",
  semanticId: null,
  taskRevision: `task-${"1".repeat(64)}`,
  validatorPolicyVersion: "cover-validator-v1",
  dependencyArtifacts: [],
  outputManifest: [
    {
      logicalPath: "public/cover-3x4.png",
      checksum: sha("2"),
      sizeBytes: 2,
      kind: "file",
    },
    {
      logicalPath: "public/cover-4x3.png",
      checksum: sha("3"),
      sizeBytes: 3,
      kind: "file",
    },
  ],
} as const;

test("ArtifactAttestation binds sorted exact outputs and excludes attempt diagnostics", () => {
  const left = buildArtifactAttestation({
    ...base,
    attemptId: crypto.randomUUID(),
    createdAt: "x",
  });
  const right = buildArtifactAttestation({
    ...base,
    attemptId: crypto.randomUUID(),
    createdAt: "y",
  });
  assert.equal(left.artifactFingerprint, right.artifactFingerprint);
  assert.throws(() =>
    buildArtifactAttestation({
      ...base,
      outputManifest: [...base.outputManifest].reverse(),
    }),
  );
  assert.throws(() =>
    buildArtifactAttestation({
      ...base,
      outputManifest: [base.outputManifest[0], base.outputManifest[0]],
    }),
  );
  assert.throws(() =>
    buildArtifactAttestation({
      ...base,
      outputManifest: [
        { ...base.outputManifest[0], logicalPath: "/tmp/escape" },
      ],
    }),
  );
});
test("stale output checksum invalidates the attestation", () => {
  const artifact = buildArtifactAttestation(base);
  assert.throws(() =>
    ArtifactAttestationSchema.parse({
      ...artifact,
      outputManifest: [
        { ...artifact.outputManifest[0], checksum: sha("f") },
        artifact.outputManifest[1],
      ],
    }),
  );
});

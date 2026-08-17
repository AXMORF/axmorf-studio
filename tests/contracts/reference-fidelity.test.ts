import assert from "node:assert/strict";
import test from "node:test";

import {
  ReferenceFidelityEvidenceSchema,
  buildReferenceFidelityEvidence,
  buildNotApplicableFidelityReceipt,
  computeReferenceFidelityEvidenceFingerprint,
} from "../../src/contracts/reference-fidelity";

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;

test("mechanical fidelity evidence is strict and binds paired phases without Agent conclusions", () => {
  const evidence = buildReferenceFidelityEvidence({
    selectionFingerprint: sha("a"),
    items: [
      {
        selectionIndex: 0,
        normalizedFps: 30,
        sourceDurationInFrames: 100,
        adaptationDurationInFrames: 100,
        sourcePreview: {
          artifactPath: "evidence/source.mp4",
          checksum: sha("b"),
        },
        adaptationPreview: {
          artifactPath: "evidence/adaptation.mp4",
          checksum: sha("c"),
        },
        phasePairs: [
          {
            normalizedPhase: 0.2,
            sourceFrame: 20,
            adaptationFrame: 20,
            sourceEvidence: {
              artifactPath: "evidence/source-20.png",
              checksum: sha("d"),
            },
            adaptationEvidence: {
              artifactPath: "evidence/adaptation-20.png",
              checksum: sha("e"),
            },
          },
          {
            normalizedPhase: 0.7,
            sourceFrame: 70,
            adaptationFrame: 70,
            sourceEvidence: {
              artifactPath: "evidence/source-70.png",
              checksum: sha("f"),
            },
            adaptationEvidence: {
              artifactPath: "evidence/adaptation-70.png",
              checksum: sha("1"),
            },
          },
        ],
      },
    ],
  });
  assert.equal(
    computeReferenceFidelityEvidenceFingerprint(evidence),
    evidence.evidenceFingerprint,
  );
  assert.equal(evidence.items[0].phasePairs.length, 2);
  assert.equal("reviewerRole" in evidence, false);
  assert.equal("recognizable" in evidence.items[0], false);
  assert.throws(() =>
    ReferenceFidelityEvidenceSchema.parse({
      ...evidence,
      reviewerRole: "agent",
    }),
  );
  assert.throws(() =>
    ReferenceFidelityEvidenceSchema.parse({
      ...evidence,
      items: [{ ...evidence.items[0], recognizable: true }],
    }),
  );
});

test("empty and inspiration selections produce strict not-applicable identities only", () => {
  const empty = buildNotApplicableFidelityReceipt({
    selectionFingerprint: `sha256:${"a".repeat(64)}`,
    reason: "empty",
  });
  const inspiration = buildNotApplicableFidelityReceipt({
    selectionFingerprint: `sha256:${"b".repeat(64)}`,
    reason: "inspiration-only",
  });
  assert.equal(empty.status, "not-applicable");
  assert.notEqual(empty.receiptFingerprint, inspiration.receiptFingerprint);
  assert.throws(() =>
    buildNotApplicableFidelityReceipt({
      selectionFingerprint: `sha256:${"a".repeat(64)}`,
      reason: "exact-demo-localized" as never,
    }),
  );
});

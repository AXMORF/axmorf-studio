import assert from "node:assert/strict";
import test from "node:test";

import {
  createFinalPreviewApproval,
  createFinalPreviewEvidence,
} from "../../src/contracts/final-preview";

const sha = (value: string) => `sha256:${value.repeat(64)}`;

const evidenceInput = () => ({
  schemaVersion: 1 as const,
  evidenceVersion: "final-preview-evidence-v1" as const,
  storyId: "synthetic-proof",
  compositionId: "SyntheticProof",
  finalAssemblyFingerprint: sha("1"),
  resourceCatalogFingerprint: sha("2"),
  reviewFingerprint: sha("3"),
  media: {
    fullPreview: {relativePath: "out/m8/final.mp4", checksum: sha("4")},
    contactSheet: {relativePath: "out/m8/contact-sheet.png", checksum: sha("5")},
    representativeStills: [{frame: 0, relativePath: "out/m8/still-0.png", checksum: sha("6")}],
  },
  technical: {
    videoCodec: "h264",
    width: 1920,
    height: 1080,
    fpsNumerator: 30,
    fpsDenominator: 1,
    frameCount: 120,
    durationSeconds: 4,
    audioCodec: "aac",
    sampleRate: 48000,
    channelLayout: "stereo",
    decodedToEof: true,
    integratedLoudnessLufs: -16,
    truePeakDbtp: -1.2,
    samplePeakDbfs: -1.4,
    duckingEvidenceFingerprint: sha("7"),
  },
  aggregateStatus: "ready-for-user-approval" as const,
});

test("Final preview evidence binds full media and technical facts", () => {
  const evidence = createFinalPreviewEvidence(evidenceInput());
  assert.notEqual(
    evidence.evidenceFingerprint,
    createFinalPreviewEvidence({...evidenceInput(), technical: {...evidenceInput().technical, frameCount: 121}}).evidenceFingerprint,
  );
});

test("Final preview approval can only bind an explicit approved decision", () => {
  const approval = createFinalPreviewApproval({
    schemaVersion: 1,
    approvalVersion: "final-preview-approval-v1",
    storyId: "synthetic-proof",
    compositionId: "SyntheticProof",
    decision: "approved",
    previewChecksum: sha("4"),
    evidenceFingerprint: sha("8"),
    finalAssemblyFingerprint: sha("1"),
    approvalReference: "user-approved-current-preview",
  });
  assert.equal(approval.decision, "approved");
  assert.throws(() => createFinalPreviewApproval({...approval, decision: "revise"}));
  assert.throws(() => createFinalPreviewApproval({...approval, approvedAt: new Date().toISOString()}));
  assert.throws(() => createFinalPreviewEvidence({...evidenceInput(), absolutePath: "/data/private/final.mp4"}));
});

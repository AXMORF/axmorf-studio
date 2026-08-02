import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createM6ProofEvidenceReceipt,
  writeM6ProofEvidenceReceiptAtomic,
} from "../../scripts/m6-proof/evidence";

const sha = (value: string) => `sha256:${value.repeat(64)}`;

const makeInput = () => ({
  schemaVersion: 1 as const,
  proofId: "M6SceneRuntimeProof" as const,
  scenePackageFingerprint: sha("1"),
  coverageFingerprint: sha("2"),
  rendererRegistryFingerprint: sha("3"),
  fidelityReceiptFingerprint: sha("4"),
  storyVisualProjectionFingerprint: sha("5"),
  soundDesignProjectionFingerprint: sha("6"),
  still: {
    localPath: "out/m6-scene-runtime-proof/frame-72.png",
    checksum: sha("7"),
    frame: 72,
    alphaMin: 255,
    alphaMax: 255,
  },
  render: {
    localPath: "out/m6-scene-runtime-proof/proof.mp4",
    checksum: sha("8"),
    durationInFrames: 120,
    fps: 30,
    width: 1920,
    height: 1080,
    audioStreams: 1,
  },
});

test("M6 proof evidence binds still media and all runtime identities", () => {
  const receipt = createM6ProofEvidenceReceipt(makeInput());
  assert.equal(receipt.status, "pass");
  assert.notEqual(
    createM6ProofEvidenceReceipt({
      ...makeInput(),
      scenePackageFingerprint: sha("9"),
    }).evidenceFingerprint,
    receipt.evidenceFingerprint,
  );
});

test("M6 evidence writer is pass-only atomic and byte-stable", async () => {
  const root = await mkdtemp(join(tmpdir(), "rsp-m6-evidence-"));
  const destination = join(root, "receipt.json");
  const receipt = createM6ProofEvidenceReceipt(makeInput());
  await writeM6ProofEvidenceReceiptAtomic({ destination, receipt });
  const before = await readFile(destination, "utf8");
  const beforeMtime = (await stat(destination)).mtimeMs;
  await writeM6ProofEvidenceReceiptAtomic({ destination, receipt });
  assert.equal(await readFile(destination, "utf8"), before);
  assert.equal((await stat(destination)).mtimeMs, beforeMtime);
  await assert.rejects(() =>
    writeM6ProofEvidenceReceiptAtomic({
      destination,
      receipt: { ...receipt, status: "fail" },
    }),
  );
  assert.equal(await readFile(destination, "utf8"), before);
});

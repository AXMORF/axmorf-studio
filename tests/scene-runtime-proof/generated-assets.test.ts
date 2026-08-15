import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { generateM6ProofAssets } from "../../scripts/proofs/scene-runtime/generate-assets";

const checksum = (bytes: Buffer) =>
  `sha256:${createHash("sha256")
    .update(bytes.toString("latin1"), "latin1")
    .digest("hex")}`;

test("core authored assets bootstrap deterministically without tracked public files", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-proof-assets-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));

  await generateM6ProofAssets({ rootDir, mode: "write" });

  const pulse = await readFile(
    join(rootDir, "public/assets/library/m6-scene-runtime/proof-pulse.wav"),
  );
  const shape = await readFile(
    join(rootDir, "public/assets/library/m6-scene-runtime/proof-shape.svg"),
  );
  const introChime = await readFile(
    join(
      rootDir,
      "public/assets/library/scene-templates/axmorf-brand-reveal-chime.wav",
    ),
  );
  const outroChime = await readFile(
    join(
      rootDir,
      "public/assets/library/scene-templates/axmorf-source-follow-chime.wav",
    ),
  );
  assert.equal(
    checksum(pulse),
    "sha256:187da07a941e050db15e5fe2e8e7aed327a3f796fda894125ae1b504e210c1a7",
  );
  assert.equal(
    checksum(shape),
    "sha256:83284733c309b88ffa56e1cda84a2699a7ace251df4831620d3484154745ccbb",
  );
  assert.equal(introChime.length, 57_644);
  assert.equal(outroChime.length, 96_044);
  assert.equal(
    checksum(introChime),
    "sha256:739069dd51389ebac5704cdcd4b16ef43abc458a268931ab5817b834c1f2c475",
  );
  assert.equal(
    checksum(outroChime),
    "sha256:7140b3c599b3656e5c3ee26c9c127a5d6a8deb26a336c67574114e4fdbe355b0",
  );

  await generateM6ProofAssets({ rootDir, mode: "check" });
});

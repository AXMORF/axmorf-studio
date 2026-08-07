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

test("M6 proof assets bootstrap deterministically without tracked public files", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-proof-assets-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));

  await generateM6ProofAssets({ rootDir, mode: "write" });

  const pulse = await readFile(
    join(rootDir, "public/assets/library/m6-scene-runtime/proof-pulse.wav"),
  );
  const shape = await readFile(
    join(rootDir, "public/assets/library/m6-scene-runtime/proof-shape.svg"),
  );
  assert.equal(
    checksum(pulse),
    "sha256:187da07a941e050db15e5fe2e8e7aed327a3f796fda894125ae1b504e210c1a7",
  );
  assert.equal(
    checksum(shape),
    "sha256:83284733c309b88ffa56e1cda84a2699a7ace251df4831620d3484154745ccbb",
  );

  await generateM6ProofAssets({ rootDir, mode: "check" });
});

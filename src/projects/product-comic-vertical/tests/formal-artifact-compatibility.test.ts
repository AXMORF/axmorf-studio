import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const checksum = async (path: string) =>
  createHash("sha256")
    .update(Uint8Array.from(await readFile(path)))
    .digest("hex");

test("Product Comic formal artifacts keep their historical identities", async () => {
  assert.equal(
    await checksum(
      "src/projects/product-comic-vertical/generated/final-assembly.generated.json",
    ),
    "f4c2113998c02aa8e6b4666cd70a733a693955d9a399461358974b692af0b18d",
  );
  assert.equal(
    await checksum(
      "src/projects/product-comic-vertical/generated/final-preview-approval.generated.json",
    ),
    "06a49fee346c028e0f31196d660d6018537ec04ae833e07f770cd66eb688ba59",
  );
});

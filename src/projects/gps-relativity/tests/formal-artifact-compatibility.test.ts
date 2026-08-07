import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const checksum = async (path: string) =>
  createHash("sha256")
    .update(Uint8Array.from(await readFile(path)))
    .digest("hex");

test("GPS formal artifacts keep their historical identities", async () => {
  assert.equal(
    await checksum(
      "src/projects/gps-relativity/generated/final-assembly.generated.json",
    ),
    "0627a40c87e477f593dcf62f2de2263721e5965361dffb7b0830da1aa1a32b4f",
  );
  assert.equal(
    await checksum(
      "src/projects/gps-relativity/generated/final-preview-approval.generated.json",
    ),
    "4f9a06c701a6b175a953dbb47eea31ab575f950a480d5d08556116e35c93381a",
  );
});

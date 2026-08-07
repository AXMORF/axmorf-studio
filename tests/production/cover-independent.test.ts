import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("production watcher and preview path do not import or join Delivery Cover", async () => {
  for (const file of [
    "scripts/production/application/watch.ts",
    "scripts/production/application/post-scene.ts",
    "scripts/production/application/preview-evidence.ts",
    "src/contracts/production-run.ts",
  ]) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /delivery[/-]cover|CoverAssignment|CoverResult/u);
  }
});

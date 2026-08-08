import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("production watcher and render-ready path do not import or join Delivery Cover", async () => {
  for (const file of [
    "scripts/production/application/watch.ts",
    "scripts/production/application/render-ready.ts",
    "src/contracts/production-run.ts",
  ]) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /delivery[/-]cover|CoverAssignment|CoverResult/u);
  }
});

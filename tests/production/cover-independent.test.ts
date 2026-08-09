import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("render-ready remains Cover-independent while the watcher owns the delivery bridge", async () => {
  for (const file of [
    "scripts/production/application/render-ready.ts",
    "src/contracts/production-run.ts",
  ]) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /delivery[/-]cover|CoverAssignment|CoverResult/u);
  }
  const watcher = await readFile(
    "scripts/production/application/watch.ts",
    "utf8",
  );
  assert.match(watcher, /runDeliveryCoverSubmit/u);
  assert.match(watcher, /buildDelivery/u);
});

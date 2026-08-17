import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("render-ready remains Cover-independent while finalize owns the delivery bridge", async () => {
  for (const file of [
    "scripts/production/application/render-ready.ts",
    "src/contracts/production-run.ts",
  ]) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /delivery[/-]cover|CoverAssignment|CoverResult/u);
  }
  const finalize = await readFile(
    "scripts/production/application/finalize.ts",
    "utf8",
  );
  assert.match(finalize, /runDeliveryCoverSubmit/u);
  assert.match(finalize, /buildDelivery/u);
  assert.doesNotMatch(finalize, /setTimeout|scheduler\.sleep|for \(;;\)/u);
});

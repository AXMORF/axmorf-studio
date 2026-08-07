import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("delivery v2 build source contains no Agent or Remotion render path", async () => {
  const source = await readFile(
    new URL("../../scripts/delivery/application/build.ts", import.meta.url),
    "utf8",
  );
  for (const forbidden of [
    "renderDeliveryCover",
    "remotion still",
    "remotion render",
    "spawnAgent",
    "createAgent",
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
  assert.equal(source.includes("copyDeliveryFileExclusive"), true);
});

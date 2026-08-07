import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { ProductionRequirementsFreezeSchema } from "../../../contracts";

test("rounded-airplane-windows keeps its v1 requirements identity", async () => {
  const bytes = await readFile(
    "src/projects/rounded-airplane-windows/production/requirements.json",
  );
  const parsed = ProductionRequirementsFreezeSchema.parse(
    JSON.parse(bytes.toString("utf8")),
  );
  assert.equal(parsed.schemaVersion, 1);
  assert.notEqual(parsed.enhancementSelection.globalVisual, "required");
  assert.equal(
    createHash("sha256").update(Uint8Array.from(bytes)).digest("hex"),
    "9e4dc0daf0a25198f2a71097fcd36563b5efbc7f10964d7ca167850579f50a06",
  );
});

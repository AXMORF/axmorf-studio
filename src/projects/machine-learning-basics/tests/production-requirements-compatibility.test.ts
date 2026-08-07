import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { ProductionRequirementsFreezeSchema } from "../../../contracts";

test("machine-learning-basics keeps its v3 requirements identity", async () => {
  const bytes = await readFile(
    "src/projects/machine-learning-basics/production/requirements.json",
  );
  const parsed = ProductionRequirementsFreezeSchema.parse(
    JSON.parse(bytes.toString("utf8")),
  );
  assert.equal(parsed.schemaVersion, 3);
  assert.notEqual(parsed.enhancementSelection.globalVisual, "required");
  assert.equal(
    createHash("sha256").update(Uint8Array.from(bytes)).digest("hex"),
    "1c3183312d9762431701623d06c251d67d73ddc34a4de2c070f596ea0bc8859c",
  );
});

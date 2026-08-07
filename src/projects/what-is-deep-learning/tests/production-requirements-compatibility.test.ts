import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { ProductionRequirementsFreezeSchema } from "../../../contracts";

test("what-is-deep-learning keeps its v3 requirements identity", async () => {
  const bytes = await readFile(
    "src/projects/what-is-deep-learning/production/requirements.json",
  );
  const parsed = ProductionRequirementsFreezeSchema.parse(
    JSON.parse(bytes.toString("utf8")),
  );
  assert.equal(parsed.schemaVersion, 3);
  assert.notEqual(parsed.enhancementSelection.globalVisual, "required");
  assert.equal(
    createHash("sha256").update(Uint8Array.from(bytes)).digest("hex"),
    "3d9eb5504ed57e2e907531ac2d9a3fd5954b835968c75b99d128e97f26529448",
  );
});

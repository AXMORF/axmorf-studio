import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { ProductionRequirementsFreezeSchema } from "../../../contracts";

test("algorithm-model-ai-system keeps its v2 requirements identity", async () => {
  const bytes = await readFile(
    "src/projects/algorithm-model-ai-system/production/requirements.json",
  );
  const parsed = ProductionRequirementsFreezeSchema.parse(
    JSON.parse(bytes.toString("utf8")),
  );
  assert.equal(parsed.schemaVersion, 2);
  assert.notEqual(parsed.enhancementSelection.globalVisual, "required");
  assert.equal(
    createHash("sha256").update(Uint8Array.from(bytes)).digest("hex"),
    "9f529e83f52d0a123e4502b8c974c805fcdaf393a836e8c3e92310e49836a1a8",
  );
});

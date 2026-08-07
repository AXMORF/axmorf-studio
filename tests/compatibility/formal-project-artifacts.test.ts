import assert from "node:assert/strict";
import test from "node:test";

import { resolveFinalPreviewEvidenceCompatibilityPaths } from "../../scripts/compatibility/formal-project-artifacts-v1";

test("formal preview compatibility is filename-based for every Project", () => {
  assert.deepEqual(
    resolveFinalPreviewEvidenceCompatibilityPaths("/repo", "alpha-story"),
    {
      canonical:
        "/repo/src/projects/alpha-story/generated/final-preview-evidence.generated.json",
      legacy:
        "/repo/src/projects/alpha-story/generated/m8-final-preview-evidence.generated.json",
    },
  );
});

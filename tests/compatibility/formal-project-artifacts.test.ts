import assert from "node:assert/strict";
import test from "node:test";

import {
  getFormalProjectArtifactCompatibility,
  resolveHistoricalProjectToolPath,
  resolveFinalPreviewEvidenceCompatibilityPaths,
} from "../../scripts/compatibility/formal-project-artifacts-v1";

test("formal project compatibility isolates GPS-only legacy artifact paths", () => {
  assert.deepEqual(getFormalProjectArtifactCompatibility("gps-relativity"), {
    compatibilityVersion: "formal-project-artifacts-v1",
    narrativeBaselineRegistryChecksum: "legacy-evidence-receipt",
    finalPreviewEvidenceLegacyFile: "m8-final-preview-evidence.generated.json",
  });
  assert.equal(
    getFormalProjectArtifactCompatibility("product-comic-vertical"),
    null,
  );
  assert.deepEqual(
    resolveFinalPreviewEvidenceCompatibilityPaths("/repo", "gps-relativity"),
    {
      canonical:
        "/repo/src/projects/gps-relativity/generated/final-preview-evidence.generated.json",
      legacy:
        "/repo/src/projects/gps-relativity/generated/m8-final-preview-evidence.generated.json",
    },
  );
  assert.deepEqual(
    resolveFinalPreviewEvidenceCompatibilityPaths(
      "/repo",
      "product-comic-vertical",
    ),
    {
      canonical:
        "/repo/src/projects/product-comic-vertical/generated/final-preview-evidence.generated.json",
      legacy: null,
    },
  );
});

test("historical milestone tool identities resolve to stable responsibility paths", () => {
  assert.equal(
    resolveHistoricalProjectToolPath("scripts/m8-gps/evidence.ts"),
    "src/projects/gps-relativity/tools/verification/final-evidence.ts",
  );
  assert.equal(
    resolveHistoricalProjectToolPath("scripts/m9-product/scene-audio.ts"),
    "src/projects/product-comic-vertical/tools/verification/scene-audio.ts",
  );
  assert.equal(
    resolveHistoricalProjectToolPath("src/contracts/story.ts"),
    "src/contracts/story.ts",
  );
});

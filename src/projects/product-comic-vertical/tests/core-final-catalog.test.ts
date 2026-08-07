import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { ResourceCatalogSchema } from "../../../contracts";
import {
  deduplicateCatalogCandidates,
  derivePreFinalSceneCatalog,
} from "../../../../scripts/project-check/final-run";

test("FinalAssembly Catalog derives the sealed M9 Scene Catalog without final-owned assets", async () => {
  const assemblyCatalog = ResourceCatalogSchema.parse(
    JSON.parse(
      await readFile(
        join(
          process.cwd(),
          "src/projects/product-comic-vertical/generated/resource-catalog.generated.json",
        ),
        "utf8",
      ),
    ),
  );
  const sceneCatalog = derivePreFinalSceneCatalog(assemblyCatalog);
  assert.equal(
    sceneCatalog.catalogFingerprint,
    "sha256:2b234ed551f9dbc93633fbe5f2654369f8c03482ec739127dc8cc002feddfdd1",
  );
  assert.ok(
    sceneCatalog.entries.some(
      ({ descriptor }) =>
        descriptor.id ===
        "asset.product-comic-vertical.scene.problem-hook.identity-break-pulse",
    ),
  );
  assert.ok(
    sceneCatalog.entries.some(
      ({ descriptor }) =>
        descriptor.id ===
        "reference.product-comic-vertical.draw-svg-trace-demo",
    ),
  );
  assert.ok(
    sceneCatalog.entries.every(
      ({ descriptor }) =>
        descriptor.kind !== "asset" ||
        !["global-bgm", "cross-scene-ambience", "global-visual"].includes(
          descriptor.mediaRole,
        ),
    ),
  );
  assert.deepEqual(
    deduplicateCatalogCandidates([sceneCatalog, { ...sceneCatalog }]),
    [sceneCatalog],
  );
});

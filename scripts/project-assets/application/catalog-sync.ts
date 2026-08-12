import { join } from "node:path";

import {
  buildResourceCatalog,
  renderResourceCatalogJson,
} from "../../catalog/domain";
import { generateResourceCatalog } from "../../catalog/generate";
import { loadCatalogAuthorityDescriptors } from "../../catalog/project-files";
import {
  assertSafeTargetParent,
  readOptionalFile,
  writeTextAtomic,
} from "../adapters/filesystem";
import type { ProjectAssetCatalogSync } from "./import";

export const syncProjectAssetCatalog: ProjectAssetCatalogSync = async ({
  rootDir,
  projectId,
  mode,
}) => {
  await generateResourceCatalog({ rootDir, mode });
  const catalog = buildResourceCatalog(
    await loadCatalogAuthorityDescriptors(rootDir, projectId),
  );
  const expected = renderResourceCatalogJson(catalog);
  const destination = join(
    rootDir,
    `src/projects/${projectId}/generated/resource-catalog.generated.json`,
  );
  await assertSafeTargetParent(rootDir, destination);
  const actualBytes = await readOptionalFile(destination);
  const actual =
    actualBytes === null ? null : new TextDecoder().decode(actualBytes);
  if (mode === "write") {
    if (actual !== expected) {
      await writeTextAtomic({ rootDir, path: destination, bytes: expected });
    }
  } else if (actual !== expected) {
    throw new Error("Project ResourceCatalog drifted after asset import.");
  }
  return catalog;
};

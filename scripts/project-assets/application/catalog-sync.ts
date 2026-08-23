import { join } from "node:path";

import {
  generateProjectResourceCatalog,
  generateResourceCatalog,
} from "../../catalog/repository-generate";
import { assertSafeTargetParent } from "../adapters/filesystem";
import type { ProjectAssetCatalogSync } from "./import";

export const syncProjectAssetCatalog: ProjectAssetCatalogSync = async ({
  rootDir,
  projectId,
  mode,
}) => {
  await generateResourceCatalog({ rootDir, mode });
  await assertSafeTargetParent(
    rootDir,
    join(
      rootDir,
      `src/projects/${projectId}/generated/resource-catalog.generated.json`,
    ),
  );
  return (
    await generateProjectResourceCatalog({ rootDir, projectId, mode })
  ).catalog;
};

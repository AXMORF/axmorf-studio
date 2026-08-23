import { generateProjectResourceCatalog } from "../../catalog/repository-generate";
import type { ProjectCatalogProjectionPort } from "../../catalog/generate";

export const generateRepositoryProjectCatalog: ProjectCatalogProjectionPort =
  ({ locations, projectId, mode }) => {
    if (locations.layoutKind !== "repository") {
      throw new Error("Repository Project Catalog requires repository locations.");
    }
    return generateProjectResourceCatalog({
      rootDir: locations.runtimeResources,
      projectId,
      mode,
    });
  };

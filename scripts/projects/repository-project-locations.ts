import { isAbsolute, join, resolve } from "node:path";

import type { ProductionLocations } from "../project-production/application/production-locations";
import type { ProjectStorageLocations } from "./project-locations";

const absolute = (path: string, label: string) => {
  if (!isAbsolute(path)) throw new Error(`${label} must be absolute.`);
  return resolve(path);
};

export const createRepositoryProjectStorageLocations = ({
  repositoryRoot,
}: {
  readonly repositoryRoot: string;
}): ProjectStorageLocations => {
  const root = absolute(repositoryRoot, "Repository root");
  return Object.freeze({
    kind: "repository",
    projectSourceRoot: join(root, "src/projects"),
    projectMediaRoot: join(root, "public/projects"),
    catalogProjectionPath: join(
      root,
      "src/remotion/catalog/resource-catalog.generated.json",
    ),
    registryProjectionPath: join(
      root,
      "src/projects/project-registry.generated.ts",
    ),
  });
};

export const createRepositoryProjectStorageFromProductionLocations = (
  locations: ProductionLocations,
) => {
  if (locations.layoutKind !== "repository") {
    throw new Error("Repository Project storage requires repository locations.");
  }
  const storage = createRepositoryProjectStorageLocations({
    repositoryRoot: locations.runtimeResources,
  });
  if (
    storage.projectSourceRoot !== locations.projectSourceRoot ||
    storage.projectMediaRoot !== locations.projectMediaRoot
  ) {
    throw new Error("Repository production locations are inconsistent.");
  }
  return storage;
};

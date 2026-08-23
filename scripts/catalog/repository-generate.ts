import {
  generateProjectResourceCatalogForStorage,
  generateResourceCatalogForStorage,
  type CatalogGenerationMode,
  type CatalogGenerationResult,
} from "./generate";
import { loadCatalogAuthorityDescriptors } from "./repository-project-files";
import { createRepositoryProjectStorageLocations } from "../projects/repository-project-locations";

export const generateResourceCatalog = async ({
  rootDir,
  mode,
  loadDescriptors = loadCatalogAuthorityDescriptors,
}: {
  readonly rootDir: string;
  readonly mode: CatalogGenerationMode;
  readonly loadDescriptors?: typeof loadCatalogAuthorityDescriptors;
}): Promise<CatalogGenerationResult> =>
  generateResourceCatalogForStorage({
    storage: createRepositoryProjectStorageLocations({ repositoryRoot: rootDir }),
    mode,
    loadDescriptors: () => loadDescriptors(rootDir),
  });

export const generateProjectResourceCatalog = async ({
  rootDir,
  projectId,
  mode,
  loadDescriptors = loadCatalogAuthorityDescriptors,
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly mode: CatalogGenerationMode;
  readonly loadDescriptors?: typeof loadCatalogAuthorityDescriptors;
}) =>
  generateProjectResourceCatalogForStorage({
    storage: createRepositoryProjectStorageLocations({ repositoryRoot: rootDir }),
    projectId,
    mode,
    loadDescriptors: () => loadDescriptors(rootDir, projectId),
  });

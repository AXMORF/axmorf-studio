import type { ProductionLocations } from "../project-production/application/production-locations";
import { createRepositoryProjectStorageFromProductionLocations } from "../projects/repository-project-locations";
import {
  generateProjectRegistry,
  type ProjectRegistryGenerationResult,
  type RegistryGenerationMode,
} from "./generate";
import {
  discoverProjectEntries,
  loadProjectRegistrationEntry,
} from "./project-files";

const storageFrom = (locations: ProductionLocations) =>
  createRepositoryProjectStorageFromProductionLocations(locations);

export const generateRepositoryProjectRegistry = ({
  locations,
  mode,
  excludeProjectIds,
}: {
  readonly locations: ProductionLocations;
  readonly mode: RegistryGenerationMode;
  readonly excludeProjectIds?: readonly string[];
}): Promise<ProjectRegistryGenerationResult> =>
  generateProjectRegistry({
    storage: storageFrom(locations),
    mode,
    excludeProjectIds,
  });

export const discoverRepositoryProjectEntries = (
  locations: ProductionLocations,
) => discoverProjectEntries({ storage: storageFrom(locations) });

export const loadRepositoryProjectRegistrationEntry = ({
  locations,
  compositionPath,
}: {
  readonly locations: ProductionLocations;
  readonly compositionPath: string;
}) =>
  loadProjectRegistrationEntry({
    storage: storageFrom(locations),
    compositionPath,
  });

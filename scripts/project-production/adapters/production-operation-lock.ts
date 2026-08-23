import { mkdir } from "node:fs/promises";

import { acquireRepositoryOperationLock } from "../../shared/repository-operation-lock";
import type { ProductionLocations } from "../domain/production-locations";

export const acquireProductionOperationLock = async ({
  locations,
  ownerId,
}: {
  readonly locations: ProductionLocations;
  readonly ownerId: string;
}) => {
  await mkdir(locations.operationLockRoot, { recursive: true, mode: 0o700 });
  return acquireRepositoryOperationLock({
    rootDir: locations.operationLockRoot,
    ownerId,
  });
};

import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";

import {
  createRepositoryProductionLocations,
  createWorkspaceProductionLocations,
  type ProductionLocations,
} from "../../scripts/project-production/application/production-locations";

export const createRepositoryProjectCheckTestLocations = async (
  context: TestContext,
): Promise<ProductionLocations> => {
  const repositoryRoot = await mkdtemp(
    join(tmpdir(), "rsp-project-check-repo-"),
  );
  context.after(() => rm(repositoryRoot, { recursive: true, force: true }));
  return createRepositoryProductionLocations({ repositoryRoot });
};

export const createProjectCheckTestLocations = async (
  context: TestContext,
): Promise<ProductionLocations> => {
  const base = await mkdtemp(join(tmpdir(), "rsp-project-check-"));
  context.after(() => rm(base, { recursive: true, force: true }));
  const runtimeResources = join(base, "runtime");
  await mkdir(runtimeResources, { recursive: true });
  return createWorkspaceProductionLocations({
    workspaceRoot: join(base, "workspace"),
    applicationSupportRoot: join(base, "application-support"),
    runtimeResources,
    cacheRoot: join(base, "cache"),
  });
};

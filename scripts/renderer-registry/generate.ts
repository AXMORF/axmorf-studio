import { join } from "node:path";

import { SceneCoverageMapSchema } from "../../src/contracts";
import type { ProductionLocations } from "../project-production/application/production-locations";
import { readJsonFile } from "../scene-package/project-files";
import { buildRendererRegistry } from "./domain";
import {
  writeOrCheckRendererRegistry,
  type RendererRegistryMode,
} from "./project-files";

export const generateRendererRegistry = async ({
  locations,
  projectId,
  mode,
}: {
  readonly locations: ProductionLocations;
  readonly projectId: string;
  readonly mode: RendererRegistryMode;
}) => {
  const projectRoot = join(locations.projectSourceRoot, projectId);
  const coverage = SceneCoverageMapSchema.parse(
    await readJsonFile(
      join(projectRoot, "generated/scene-coverage.generated.json"),
    ),
  );
  const ready = coverage.entries.filter((entry) => entry.status === "ready");
  const packages = await Promise.all(
    ready.map((entry) =>
      readJsonFile(
        join(
          projectRoot,
          "scenes",
          entry.meaningId,
          "generated/scene-package.generated.json",
        ),
      ),
    ),
  );
  const registry = await buildRendererRegistry({
    locations,
    projectId,
    coverage,
    packages,
  });
  if (registry === null) return null;
  await writeOrCheckRendererRegistry({
    destination: join(projectRoot, "renderer-registry.generated.ts"),
    source: registry.source,
    mode,
  });
  return registry;
};

import { generateResourceCatalog } from "../catalog/repository-generate";
import { generateSceneRuntimeProofAssets } from "../proofs/scene-runtime/generate-assets";
import { generateProjectRegistry } from "../registry/generate";
import { generateSceneTemplateAudioProjection } from "../scene-templates/audio-projection";
import { createRepositoryProductionLocations } from "../project-production/application/production-locations";
import { createRepositoryProjectStorageFromProductionLocations } from "../projects/repository-project-locations";

export const bootstrapRepository = async (rootDir: string) => {
  const locations = createRepositoryProductionLocations({
    repositoryRoot: rootDir,
  });
  await generateSceneRuntimeProofAssets({ rootDir, mode: "write" });
  await generateSceneTemplateAudioProjection({ rootDir, mode: "write" });
  const catalog = await generateResourceCatalog({ rootDir, mode: "write" });
  const registry = await generateProjectRegistry({
    storage: createRepositoryProjectStorageFromProductionLocations(locations),
    mode: "write",
  });
  return {
    catalogEntryCount: catalog.entryCount,
    projectEntryCount: registry.entryCount,
  } as const;
};

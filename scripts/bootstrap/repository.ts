import { generateResourceCatalog } from "../catalog/generate";
import { generateSceneRuntimeProofAssets } from "../proofs/scene-runtime/generate-assets";
import { generateProjectRegistry } from "../registry/generate";
import { generateSceneTemplateAudioProjection } from "../scene-templates/audio-projection";

export const bootstrapRepository = async (rootDir: string) => {
  await generateSceneRuntimeProofAssets({ rootDir, mode: "write" });
  await generateSceneTemplateAudioProjection({ rootDir, mode: "write" });
  const catalog = await generateResourceCatalog({ rootDir, mode: "write" });
  const registry = await generateProjectRegistry({ rootDir, mode: "write" });
  return {
    catalogEntryCount: catalog.entryCount,
    projectEntryCount: registry.entryCount,
  } as const;
};

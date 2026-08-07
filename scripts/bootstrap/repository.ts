import { generateResourceCatalog } from "../catalog/generate";
import { generateM6ProofAssets } from "../proofs/scene-runtime/generate-assets";
import { generateProjectRegistry } from "../registry/generate";

export const bootstrapRepository = async (rootDir: string) => {
  await generateM6ProofAssets({ rootDir, mode: "write" });
  const catalog = await generateResourceCatalog({ rootDir, mode: "write" });
  const registry = await generateProjectRegistry({ rootDir, mode: "write" });
  return {
    catalogEntryCount: catalog.entryCount,
    projectEntryCount: registry.entryCount,
  } as const;
};

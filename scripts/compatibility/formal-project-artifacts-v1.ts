import { join } from "node:path";

export const resolveFinalPreviewEvidenceCompatibilityPaths = (
  rootDir: string,
  projectId: string,
) => {
  const generatedRoot = join(
    rootDir,
    "src",
    "projects",
    projectId,
    "generated",
  );
  return {
    canonical: join(generatedRoot, "final-preview-evidence.generated.json"),
    legacy: join(generatedRoot, "m8-final-preview-evidence.generated.json"),
  } as const;
};

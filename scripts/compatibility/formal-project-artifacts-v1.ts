import { join } from "node:path";

type FormalProjectArtifactCompatibility = Readonly<{
  compatibilityVersion: "formal-project-artifacts-v1";
  narrativeBaselineRegistryChecksum: "legacy-evidence-receipt";
  finalPreviewEvidenceLegacyFile: "m8-final-preview-evidence.generated.json";
}>;

const formalProjectCompatibility: Readonly<
  Record<string, FormalProjectArtifactCompatibility>
> = {
  "gps-relativity": {
    compatibilityVersion: "formal-project-artifacts-v1",
    narrativeBaselineRegistryChecksum: "legacy-evidence-receipt",
    finalPreviewEvidenceLegacyFile: "m8-final-preview-evidence.generated.json",
  },
};

const historicalProjectToolPaths: Readonly<Record<string, string>> = {
  "scripts/m6-proof/evidence.ts": "scripts/proofs/scene-runtime/evidence.ts",
  "scripts/m6-proof/generate-assets.ts":
    "scripts/proofs/scene-runtime/generate-assets.ts",
  "scripts/m6-proof/generate.ts": "scripts/proofs/scene-runtime/generate.ts",
  "scripts/m7-gps/author-scenes.ts":
    "src/projects/gps-relativity/tools/verification/historical-scene-authoring.ts",
  "scripts/m7-gps/evidence.ts":
    "src/projects/gps-relativity/tools/verification/scene-evidence.ts",
  "scripts/m7-gps/freeze-inputs.ts":
    "src/projects/gps-relativity/tools/verification/scene-inputs.ts",
  "scripts/m7-gps/generate-local-audio.ts":
    "src/projects/gps-relativity/tools/verification/scene-audio.ts",
  "scripts/m8-gps/approval.ts":
    "src/projects/gps-relativity/tools/verification/approval.ts",
  "scripts/m8-gps/evidence.ts":
    "src/projects/gps-relativity/tools/verification/final-evidence.ts",
  "scripts/m8-gps/freeze-inputs.ts":
    "src/projects/gps-relativity/tools/verification/final-inputs.ts",
  "scripts/m8-gps/generate-global-audio.ts":
    "src/projects/gps-relativity/tools/verification/global-audio.ts",
  "scripts/m9-product/approval.ts":
    "src/projects/product-comic-vertical/tools/verification/approval.ts",
  "scripts/m9-product/comic-design-system.ts":
    "src/projects/product-comic-vertical/tools/verification/design-system.ts",
  "scripts/m9-product/final-evidence.ts":
    "src/projects/product-comic-vertical/tools/verification/final-evidence.ts",
  "scripts/m9-product/global-audio.ts":
    "src/projects/product-comic-vertical/tools/verification/global-audio.ts",
  "scripts/m9-product/scene-audio.ts":
    "src/projects/product-comic-vertical/tools/verification/scene-audio.ts",
  "scripts/m9-product/scene-evidence.ts":
    "src/projects/product-comic-vertical/tools/verification/scene-evidence.ts",
  "scripts/m9-product/shotcraft-inventory.ts":
    "src/projects/product-comic-vertical/tools/verification/shotcraft-inventory.ts",
};

export const getFormalProjectArtifactCompatibility = (projectId: string) =>
  formalProjectCompatibility[projectId] ?? null;

export const resolveHistoricalProjectToolPath = (repositoryPath: string) =>
  historicalProjectToolPaths[repositoryPath] ?? repositoryPath;

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
  const compatibility = getFormalProjectArtifactCompatibility(projectId);
  return {
    canonical: join(generatedRoot, "final-preview-evidence.generated.json"),
    legacy:
      compatibility === null
        ? null
        : join(generatedRoot, compatibility.finalPreviewEvidenceLegacyFile),
  } as const;
};

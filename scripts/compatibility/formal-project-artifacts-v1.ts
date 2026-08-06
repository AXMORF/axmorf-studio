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
    "scripts/project-tools/gps-relativity/historical-scene-authoring.ts",
  "scripts/m7-gps/evidence.ts":
    "scripts/project-tools/gps-relativity/scene-evidence.ts",
  "scripts/m7-gps/freeze-inputs.ts":
    "scripts/project-tools/gps-relativity/scene-inputs.ts",
  "scripts/m7-gps/generate-local-audio.ts":
    "scripts/project-tools/gps-relativity/scene-audio.ts",
  "scripts/m8-gps/approval.ts":
    "scripts/project-tools/gps-relativity/approval.ts",
  "scripts/m8-gps/evidence.ts":
    "scripts/project-tools/gps-relativity/final-evidence.ts",
  "scripts/m8-gps/freeze-inputs.ts":
    "scripts/project-tools/gps-relativity/final-inputs.ts",
  "scripts/m8-gps/generate-global-audio.ts":
    "scripts/project-tools/gps-relativity/global-audio.ts",
  "scripts/m9-product/approval.ts":
    "scripts/project-tools/product-comic-vertical/approval.ts",
  "scripts/m9-product/comic-design-system.ts":
    "scripts/project-tools/product-comic-vertical/design-system.ts",
  "scripts/m9-product/final-evidence.ts":
    "scripts/project-tools/product-comic-vertical/final-evidence.ts",
  "scripts/m9-product/global-audio.ts":
    "scripts/project-tools/product-comic-vertical/global-audio.ts",
  "scripts/m9-product/scene-audio.ts":
    "scripts/project-tools/product-comic-vertical/scene-audio.ts",
  "scripts/m9-product/scene-evidence.ts":
    "scripts/project-tools/product-comic-vertical/scene-evidence.ts",
  "scripts/m9-product/shotcraft-inventory.ts":
    "scripts/project-tools/product-comic-vertical/shotcraft-inventory.ts",
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

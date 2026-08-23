import {
  buildProductionRevision,
  type ProductionRevision,
} from "../../../src/contracts";
import type { loadProjectProductionInputs } from "./load-inputs";
import type { ProductionLocations } from "./production-locations";

type LoadedProjectProductionInputs = Awaited<
  ReturnType<typeof loadProjectProductionInputs>
>;

export const buildCurrentProductionRevision = (
  inputs: LoadedProjectProductionInputs,
): ProductionRevision =>
  buildProductionRevision({
    storyId: inputs.projectId,
    storyFingerprint: inputs.fingerprints.story,
    narrationFingerprint: inputs.fingerprints.narration,
    renderFingerprint: inputs.fingerprints.render,
    visualStyleFingerprint: inputs.fingerprints.visualStyle,
    projectSoundFingerprint: inputs.fingerprints.sound,
    authoringRequirementsFingerprint: inputs.fingerprints.requirements,
    globalVisualBriefFingerprint: inputs.fingerprints.globalVisualBrief,
    storyResourcePoolFingerprint: inputs.fingerprints.resourcePool,
    projectAssetManifestFingerprint: inputs.fingerprints.assetManifest,
    narrationGenerationFingerprint: inputs.fingerprints.narrationGeneration,
    scenes: inputs.sceneInputs
      .map(({ revisionInput }) => revisionInput)
      .sort((left, right) => left.meaningId.localeCompare(right.meaningId)),
    selectedResources: inputs.assetManifest.assets
      .map((asset) => ({ id: asset.id, fingerprint: asset.checksum }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    policyFingerprints: [
      {
        id: "runtime-toolchain",
        fingerprint: inputs.runtimePolicyFingerprint,
      },
    ],
  });

type CurrentRevisionDependencies = Readonly<{
  loadInputs: (
    input: Parameters<typeof loadProjectProductionInputs>[0],
  ) => ReturnType<typeof loadProjectProductionInputs>;
}>;

/**
 * Computes the live authoring revision without preparing providers, artifacts,
 * attempts, delivery staging, or task workspaces. Catalog access is check-only.
 */
export const readCurrentProductionRevision = async (
  {
    locations,
    projectId,
  }: {
    readonly locations: ProductionLocations;
    readonly projectId: string;
  },
  dependencies: CurrentRevisionDependencies,
) => {
  const inputs = await dependencies.loadInputs({
    locations,
    projectId,
  });
  return buildCurrentProductionRevision(inputs);
};

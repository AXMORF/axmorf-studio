import {
  buildProductionRevision,
  type ProductionRevision,
} from "@axmorf/studio/contracts";
import type { RuntimePolicyManifest } from "../../../packages/studio/src/runtime/policy-manifest";
import { loadProjectProductionInputs } from "./load-inputs";
import type { ProductionScope } from "./production-scope";

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
    publishingIntentFingerprint: inputs.fingerprints.publishingIntent,
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
      ...(inputs.workspaceConfigurationFingerprint === null
        ? []
        : [
            {
              id: "workspace-configuration",
              fingerprint: inputs.workspaceConfigurationFingerprint,
            },
          ]),
    ],
  });

type CurrentRevisionDependencies = Readonly<{
  loadInputs: typeof loadProjectProductionInputs;
}>;

const defaultDependencies: CurrentRevisionDependencies = {
  loadInputs: loadProjectProductionInputs,
};

/**
 * Computes the live authoring revision without preparing providers, artifacts,
 * attempts, delivery staging, or task workspaces. Catalog access is check-only.
 */
export const readCurrentProductionRevision = async (
  {
    rootDir,
    projectId,
    runtimePolicyManifest,
    scope,
  }: {
    readonly rootDir: string;
    readonly projectId: string;
    readonly runtimePolicyManifest?: RuntimePolicyManifest;
    readonly scope?: ProductionScope;
  },
  dependencies: CurrentRevisionDependencies = defaultDependencies,
) => {
  const inputs = await dependencies.loadInputs({
    rootDir,
    projectId,
    ...(runtimePolicyManifest === undefined ? {} : { runtimePolicyManifest }),
    ...(scope === undefined ? {} : { scope }),
  });
  return buildCurrentProductionRevision(inputs);
};

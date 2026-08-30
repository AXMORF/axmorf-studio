import {
  buildNotApplicableFidelityReceipt,
  buildShotRecipeSelection,
  computeResourceDescriptorFingerprint,
} from "@axmorf/studio/contracts";
import { createScenePlans, sha } from "./scene-input";

export const createScenePackageInput = () => {
  const plans = createScenePlans("empty");
  const selection = buildShotRecipeSelection({
    taskInputFingerprint: plans.task.taskInputFingerprint,
    selections: [],
  });
  const fidelityReceipt = buildNotApplicableFidelityReceipt({
    selectionFingerprint: selection.selectionFingerprint,
    reason: "empty",
  });
  const descriptor = {
    schemaVersion: 1,
    id: "asset.proof-shape",
    kind: "asset",
    status: "approved",
    title: "Proof shape",
    description: "Synthetic proof-only SVG shape.",
    useCases: ["scene proof"],
    tags: ["proof"],
    authority: {
      kind: "repository-file",
      repositoryPath: "src/remotion/catalog/assets.manifest.json",
      sourceChecksum: sha("7"),
    },
    allowedUse: "runtime-approved",
    assetKind: "svg",
    mediaRole: "scene-visual",
    localPath: "public/assets/library/synthetic-proof/meaning-one/proof.svg",
    checksum: sha("8"),
    license: {
      id: "Project-Authored",
      verificationStatus: "verified",
      sourceUrl: null,
      attributionRequired: false,
      attributionText: null,
      verifiedAt: "2026-08-02T00:00:00.000Z",
      sourceEvidenceFingerprint: sha("9"),
    },
  } as const;
  const selected = {
    schemaVersion: 1,
    resourceId: descriptor.id,
    kind: "asset",
    role: "scene-visual",
    descriptorFingerprint: computeResourceDescriptorFingerprint(descriptor),
    catalogFingerprint: plans.task.resourceCatalogFingerprint,
  } as const;
  return {
    ...plans,
    selection,
    fidelityReceipt,
    selectedResources: [{ selected, descriptor }],
    rendererBinding: {
      rendererId: "synthetic-proof-meaning-one",
      rendererSourceFingerprint: sha("a"),
    },
    current: {
      timingBeat: plans.task.timingBeat,
      semanticTimingFingerprint: sha("2"),
      visualStyleFingerprint: plans.task.visualStyleFingerprint,
      resourceCatalogFingerprint: plans.task.resourceCatalogFingerprint,
      snapshotFingerprints: plans.task.allowedSnapshots.map(
        (snapshot) => snapshot.snapshotFingerprint,
      ),
      rendererSourceFingerprint: sha("a"),
      visualRuntimeVersion: "scene-visual-runtime-v3",
      sceneAudioRuntimeVersion: "scene-audio-runtime-v2",
    },
  };
};

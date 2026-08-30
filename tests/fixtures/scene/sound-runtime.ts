import {
  buildSceneSoundPlan,
  computeResourceDescriptorFingerprint,
} from "@axmorf/studio/contracts";
import { resolveSceneSound } from "@axmorf/studio/remotion";
import { buildScenePackage } from "../../../scripts/scene-package/domain";
import { createScenePackageInput } from "./package-input";
import { sha } from "./scene-input";

export const createSoundRuntimeFixture = () => {
  const base = createScenePackageInput();
  const descriptor = {
    schemaVersion: 1,
    id: "asset.proof-sfx",
    kind: "asset",
    status: "approved",
    title: "Proof pulse",
    description: "Project-authored Scene-local proof pulse.",
    useCases: ["scene cue"],
    tags: ["proof", "sfx"],
    authority: {
      kind: "repository-file",
      repositoryPath: "src/remotion/catalog/assets.manifest.json",
      sourceChecksum: sha("d"),
    },
    allowedUse: "runtime-approved",
    assetKind: "audio",
    mediaRole: "sound-effect",
    localPath: "public/assets/library/synthetic-proof/meaning-one/pulse.wav",
    checksum: sha("e"),
    license: {
      id: "Project-Authored",
      verificationStatus: "verified",
      sourceUrl: null,
      attributionRequired: false,
      attributionText: null,
      verifiedAt: "2026-08-02T00:00:00.000Z",
      sourceEvidenceFingerprint: sha("f"),
    },
  } as const;
  const selected = {
    schemaVersion: 1,
    resourceId: descriptor.id,
    kind: "asset",
    role: "sound-effect",
    descriptorFingerprint: computeResourceDescriptorFingerprint(descriptor),
    catalogFingerprint: base.task.resourceCatalogFingerprint,
  } as const;
  const sound = buildSceneSoundPlan({
    taskInputFingerprint: base.task.taskInputFingerprint,
    meaningId: base.task.meaningId,
    sceneDurationInFrames: 120,
    contributions: [
      {
        contributionId: "pulse",
        resource: selected,
        timing: {
          kind: "anchor",
          eventId: "outline-closes",
          offsetFrames: 2,
        },
        durationInFrames: 12,
        volume: 0.5,
      },
    ],
  });
  const scenePackage = buildScenePackage({
    ...base,
    sound,
    selectedResources: [...base.selectedResources, { selected, descriptor }],
  });
  const projection = resolveSceneSound({
    scenePackage,
    soundPlan: sound,
    syncAnchors: base.anchors,
    resources: [{ selected, descriptor }],
  });
  return { ...base, descriptor, selected, sound, scenePackage, projection };
};

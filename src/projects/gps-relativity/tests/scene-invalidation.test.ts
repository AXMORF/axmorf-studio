import assert from "node:assert/strict";
import test from "node:test";

import {
  computeSceneSoundFingerprint,
  computeSceneVisualFingerprint,
  ScenePackageSchema,
  Sha256DigestSchema,
} from "../../../contracts";
import packageJson from "../scenes/net-drift/generated/scene-package.generated.json";

test("GPS Scene visual and sound fingerprints stay independently invalidated", () => {
  const scenePackage = ScenePackageSchema.parse(packageJson);
  const changedRendererFingerprint = Sha256DigestSchema.parse(
    `sha256:${"a".repeat(64)}`,
  );
  const changedSoundFingerprint = Sha256DigestSchema.parse(
    `sha256:${"b".repeat(64)}`,
  );
  const changedAnchorFingerprint = Sha256DigestSchema.parse(
    `sha256:${"c".repeat(64)}`,
  );
  const visualInput = {
    taskInputFingerprint: scenePackage.taskInputFingerprint,
    visualStyleFingerprint: scenePackage.visualStyleFingerprint,
    resourceCatalogFingerprint: scenePackage.resourceCatalogFingerprint,
    externalSnapshotFingerprints: scenePackage.externalSnapshotFingerprints,
    selectionFingerprint: scenePackage.selectionFingerprint,
    fidelityReceiptFingerprint: scenePackage.fidelityReceiptFingerprint,
    visualPlanFingerprint: scenePackage.visualPlanFingerprint,
    shotPlanFingerprint: scenePackage.shotPlanFingerprint,
    syncAnchorFingerprint: scenePackage.syncAnchorFingerprint,
    rendererBinding: scenePackage.rendererBinding,
    selectedResources: scenePackage.selectedResources.filter(
      ({ role }) => role === "scene-visual",
    ),
    visualRuntimeVersion: scenePackage.visualRuntimeVersion,
  };
  const soundInput = {
    taskInputFingerprint: scenePackage.taskInputFingerprint,
    resourceCatalogFingerprint: scenePackage.resourceCatalogFingerprint,
    syncAnchorFingerprint: scenePackage.syncAnchorFingerprint,
    soundPlanFingerprint: scenePackage.soundPlanFingerprint,
    selectedResources: scenePackage.selectedResources.filter(
      ({ role }) => role === "scene-ambience" || role === "scene-sfx",
    ),
    sceneAudioRuntimeVersion: scenePackage.sceneAudioRuntimeVersion,
  };
  const changedRenderer = computeSceneVisualFingerprint({
    ...visualInput,
    rendererBinding: {
      ...visualInput.rendererBinding,
      rendererSourceFingerprint: changedRendererFingerprint,
    },
  });
  const changedSound = computeSceneSoundFingerprint({
    ...soundInput,
    soundPlanFingerprint: changedSoundFingerprint,
  });
  const changedVisualAnchor = computeSceneVisualFingerprint({
    ...visualInput,
    syncAnchorFingerprint: changedAnchorFingerprint,
  });
  const changedSoundAnchor = computeSceneSoundFingerprint({
    ...soundInput,
    syncAnchorFingerprint: changedAnchorFingerprint,
  });

  assert.notEqual(changedRenderer, scenePackage.sceneVisualFingerprint);
  assert.equal(
    computeSceneSoundFingerprint(soundInput),
    scenePackage.sceneSoundFingerprint,
  );
  assert.notEqual(changedSound, scenePackage.sceneSoundFingerprint);
  assert.equal(
    computeSceneVisualFingerprint(visualInput),
    scenePackage.sceneVisualFingerprint,
  );
  assert.notEqual(changedVisualAnchor, scenePackage.sceneVisualFingerprint);
  assert.notEqual(changedSoundAnchor, scenePackage.sceneSoundFingerprint);
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  ScenePackageSchema,
  buildShotRecipeSelection,
} from "../../src/contracts";
import { buildScenePackage } from "../../scripts/scene-package/domain";
import { createScenePackageInput } from "../fixtures/scene/package-input";
import { sha } from "../fixtures/scene/scene-input";

test("ScenePackage binds one renderer and one sound identity without storing duration", () => {
  const scenePackage = buildScenePackage(createScenePackageInput());
  assert.equal(
    scenePackage.rendererBinding.rendererId,
    "synthetic-proof-meaning-one",
  );
  assert.equal(
    scenePackage.soundPlanFingerprint,
    createScenePackageInput().sound.soundPlanFingerprint,
  );
  assert.equal("durationInFrames" in scenePackage, false);
  assert.equal(
    ScenePackageSchema.parse(scenePackage).packageFingerprint,
    scenePackage.packageFingerprint,
  );
});

test("ScenePackage fails when any current layered identity drifts", () => {
  const input = createScenePackageInput();
  const mutations = [
    {
      ...input,
      current: { ...input.current, visualStyleFingerprint: sha("b") },
    },
    {
      ...input,
      current: { ...input.current, semanticTimingFingerprint: sha("b") },
    },
    {
      ...input,
      current: { ...input.current, resourceCatalogFingerprint: sha("b") },
    },
    {
      ...input,
      rendererBinding: {
        ...input.rendererBinding,
        rendererSourceFingerprint: sha("b"),
      },
    },
    {
      ...input,
      selection: { ...input.selection, selectionFingerprint: sha("b") },
    },
    {
      ...input,
      fidelityReceipt: {
        ...input.fidelityReceipt,
        receiptFingerprint: sha("b"),
      },
    },
  ];
  for (const mutation of mutations)
    assert.throws(() => buildScenePackage(mutation));
});

test("recipe state requires matching current fidelity applicability", () => {
  const input = createScenePackageInput();
  const inspiration = buildShotRecipeSelection({
    taskInputFingerprint: input.task.taskInputFingerprint,
    selections: [
      {
        mode: "inspiration-only",
        sourceId: "video-shotcraft",
        snapshotFingerprint: input.task.allowedSnapshots[0].snapshotFingerprint,
        cardId: "draw-svg-trace",
        styleKey: "draw-svg-trace",
        cardFingerprint: sha("c"),
        styleFingerprint: sha("d"),
        selectionReason: "Use only the general trace principle.",
      },
    ],
  });
  assert.throws(() =>
    buildScenePackage({
      ...input,
      selection: inspiration,
      visual: { ...input.visual, recipeDecision: "inspiration-only" },
      fidelityReceipt: input.fidelityReceipt,
    }),
  );
});

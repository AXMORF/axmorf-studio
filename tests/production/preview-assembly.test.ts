import assert from "node:assert/strict";
import test from "node:test";

import {
  ProductionPreviewAssemblySchema,
  buildProductionPreviewAssembly,
} from "../../src/contracts";
import { validPreviewAssemblyInput } from "./preview-fixture";

test("builds a versioned preview assembly with explicit absent enhancements", () => {
  const assembly = buildProductionPreviewAssembly(validPreviewAssemblyInput);
  assert.equal(assembly.schemaVersion, 2);
  assert.equal(assembly.contractVersion, "production-preview-assembly-v2");
  assert.equal(assembly.enhancements.globalSoundPlan, "absent");
  assert.equal(assembly.enhancements.globalVisualLayers, "absent");
  assert.equal(
    assembly.sceneCompositionBoundaryVersion,
    "scene-composition-boundary-v1",
  );
  assert.equal(
    assembly.layerOrder[0],
    "visual-shell",
  );
  assert.equal(assembly.reviewPolicy, "mechanical-only");
  assert.equal(
    ProductionPreviewAssemblySchema.parse(assembly).assemblyFingerprint,
    assembly.assemblyFingerprint,
  );
});

test("rejects implicit global layers duplicate Scenes and approval language", () => {
  for (const invalid of [
    {
      ...validPreviewAssemblyInput,
      enhancements: {
        ...validPreviewAssemblyInput.enhancements,
        globalSoundPlan: "present",
      },
    },
    {
      ...validPreviewAssemblyInput,
      scenePackages: [
        validPreviewAssemblyInput.scenePackages[0],
        validPreviewAssemblyInput.scenePackages[0],
      ],
    },
    { ...validPreviewAssemblyInput, aggregateStatus: "approved" },
  ]) {
    assert.throws(() => buildProductionPreviewAssembly(invalid));
  }
});

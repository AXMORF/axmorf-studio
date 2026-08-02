import assert from "node:assert/strict";
import test from "node:test";

import {
  ResourceDescriptorSchema,
  SelectedResourceRefSchema,
  assertResourceAllowedForUse,
  computeResourceDescriptorFingerprint,
  validateSelectedResourceRef,
} from "../../src/contracts/resource-catalog";

const digest = (character: string) => `sha256:${character.repeat(64)}`;

const verifiedLicense = {
  id: "LicenseRef-Project-Authored",
  verificationStatus: "verified",
  sourceUrl: null,
  attributionRequired: false,
  attributionText: null,
  verifiedAt: "2026-08-02T00:00:00.000Z",
  sourceEvidenceFingerprint: digest("a"),
} as const;

const common = {
  schemaVersion: 1,
  id: "asset.proof-shape",
  status: "approved",
  title: "Proof shape",
  description: "Project-authored proof visual",
  useCases: ["scene proof"],
  tags: ["proof", "synthetic"],
  authority: {
    kind: "repository-file",
    repositoryPath: "src/remotion/catalog/assets.manifest.json",
  },
} as const;

const visualAsset = {
  ...common,
  kind: "asset",
  allowedUse: "runtime-approved",
  assetKind: "svg",
  mediaRole: "scene-visual",
  localPath: "public/assets/library/m6-scene-runtime/proof-shape.svg",
  checksum: digest("b"),
  license: verifiedLicense,
} as const;

test("resource descriptors are strict discriminated declarations with canonical arrays", () => {
  assert.equal(ResourceDescriptorSchema.parse(visualAsset).kind, "asset");
  assert.equal(
    ResourceDescriptorSchema.parse({
      ...common,
      id: "style.cinematic-3d",
      kind: "style-profile",
      allowedUse: "runtime-approved",
      styleProfileId: "cinematic-3d",
      exportName: "cinematic3dProfile",
      sourceFile: "src/remotion/capabilities/styles/cinematic-3d.ts",
    }).kind,
    "style-profile",
  );
  assert.equal(
    ResourceDescriptorSchema.parse({
      ...common,
      id: "capability.camera-2d",
      kind: "capability",
      allowedUse: "runtime-approved",
      exportName: "createCamera2D",
      sourceFile: "src/remotion/capabilities/camera/index.ts",
    }).kind,
    "capability",
  );
  assert.equal(
    ResourceDescriptorSchema.parse({
      ...common,
      id: "reference.draw-svg-trace",
      kind: "authoring-reference",
      allowedUse: "localize-code",
      referenceType: "shot-recipe",
      sourceId: "video-shotcraft",
      sourceSnapshotFingerprint: digest("c"),
      repositoryPath: "demos/ui-entrance/draw-svg-trace/DrawSvgTrace.tsx",
      contentChecksum: digest("d"),
      license: verifiedLicense,
    }).kind,
    "authoring-reference",
  );

  assert.throws(() =>
    ResourceDescriptorSchema.parse({ ...visualAsset, extra: true }),
  );
  assert.throws(() =>
    ResourceDescriptorSchema.parse({ ...visualAsset, kind: "unknown" }),
  );
  assert.throws(() =>
    ResourceDescriptorSchema.parse({
      ...visualAsset,
      tags: ["synthetic", "proof"],
    }),
  );
  assert.throws(() =>
    ResourceDescriptorSchema.parse({ ...visualAsset, useCases: [] }),
  );
  assert.throws(() =>
    ResourceDescriptorSchema.parse({
      ...visualAsset,
      tags: ["proof", "proof"],
    }),
  );
});

test("allowed-use policy keeps runtime assets capabilities and authoring references distinct", () => {
  assert.doesNotThrow(() =>
    assertResourceAllowedForUse(visualAsset, "scene-visual"),
  );
  assert.throws(() =>
    ResourceDescriptorSchema.parse({
      ...visualAsset,
      allowedUse: "localize-code",
    }),
  );
  assert.throws(() =>
    ResourceDescriptorSchema.parse({
      ...common,
      id: "reference.preview",
      kind: "authoring-reference",
      allowedUse: "runtime-approved",
      referenceType: "preview",
      sourceId: "video-shotcraft",
      sourceSnapshotFingerprint: digest("c"),
      repositoryPath: "gallery/media/draw-svg-trace.mp4",
      contentChecksum: digest("d"),
      license: verifiedLicense,
    }),
  );
  const blocked = ResourceDescriptorSchema.parse({
    ...visualAsset,
    status: "blocked",
    allowedUse: "blocked",
    license: { ...verifiedLicense, verificationStatus: "unverified" },
  });
  assert.throws(() => assertResourceAllowedForUse(blocked, "scene-visual"));
});

test("runtime assets require public checksums and current item-level authorization", () => {
  assert.throws(() =>
    ResourceDescriptorSchema.parse({
      ...visualAsset,
      localPath: "../proof.svg",
    }),
  );
  assert.throws(() =>
    ResourceDescriptorSchema.parse({ ...visualAsset, checksum: digest("A") }),
  );
  assert.throws(() =>
    ResourceDescriptorSchema.parse({
      ...visualAsset,
      license: { ...verifiedLicense, verificationStatus: "unknown" },
    }),
  );
  assert.throws(() =>
    ResourceDescriptorSchema.parse({
      ...visualAsset,
      license: {
        ...verifiedLicense,
        attributionRequired: true,
        attributionText: null,
      },
    }),
  );
});

test("SelectedResourceRef binds the exact descriptor and Catalog fingerprints", () => {
  const descriptor = ResourceDescriptorSchema.parse(visualAsset);
  const descriptorFingerprint =
    computeResourceDescriptorFingerprint(descriptor);
  const catalogFingerprint = digest("e");
  const selected = SelectedResourceRefSchema.parse({
    schemaVersion: 1,
    resourceId: descriptor.id,
    kind: descriptor.kind,
    role: "scene-visual",
    descriptorFingerprint,
    catalogFingerprint,
  });
  assert.equal(
    validateSelectedResourceRef({
      selected,
      descriptor,
      currentCatalogFingerprint: catalogFingerprint,
    }).resourceId,
    descriptor.id,
  );
  assert.throws(() =>
    validateSelectedResourceRef({
      selected: { ...selected, descriptorFingerprint: digest("f") },
      descriptor,
      currentCatalogFingerprint: catalogFingerprint,
    }),
  );
  assert.throws(() =>
    validateSelectedResourceRef({
      selected,
      descriptor,
      currentCatalogFingerprint: digest("f"),
    }),
  );
  assert.notEqual(
    descriptorFingerprint,
    computeResourceDescriptorFingerprint({
      ...visualAsset,
      checksum: digest("f"),
    }),
  );
});

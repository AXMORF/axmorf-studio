import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import {
  FinalAssemblyPlanSchema,
  ResourceCatalogSchema,
  SealedNarrationManifestSchema,
  SemanticTimingSchema,
} from "../../src/contracts";
import { productComicVerticalFinalAssemblyData } from "../../src/projects/product-comic-vertical/final-assembly-data";
import { rendererRegistryFingerprint } from "../../src/projects/product-comic-vertical/renderer-registry.generated";

const rootDir = process.cwd();
const readJson = async (path: string): Promise<unknown> =>
  JSON.parse(await readFile(join(rootDir, path), "utf8"));

test("Product Comic FinalAssembly binds narrative Scene reference Catalog global and Composition identities", async () => {
  const data = productComicVerticalFinalAssemblyData;
  const assembly = FinalAssemblyPlanSchema.parse(data.finalAssembly);
  const sealed = SealedNarrationManifestSchema.parse(
    await readJson(
      "src/projects/product-comic-vertical/generated/sealed-narration.generated.json",
    ),
  );
  const timing = SemanticTimingSchema.parse(
    await readJson(
      "src/projects/product-comic-vertical/generated/semantic-timing.generated.json",
    ),
  );
  const coverage = (await readJson(
    "src/projects/product-comic-vertical/generated/scene-coverage.generated.json",
  )) as {
    coverageFingerprint: string;
    entries: { packageFingerprint: string }[];
  };
  const catalog = ResourceCatalogSchema.parse(data.assemblyCatalog);
  assert.equal(
    assembly.narrativeReportFingerprint,
    data.narrativeReportFingerprint,
  );
  assert.equal(assembly.sealedNarrationChecksum, sealed.completeAudio.checksum);
  assert.equal(
    assembly.sealedNarrationFingerprint,
    sealed.sealedNarrationFingerprint,
  );
  assert.equal(assembly.semanticTimingFingerprint, timing.fingerprint);
  assert.equal(assembly.captionCuesFingerprint, data.captionCuesFingerprint);
  assert.equal(assembly.sceneCoverageFingerprint, coverage.coverageFingerprint);
  assert.deepEqual(
    assembly.scenePackageFingerprints,
    coverage.entries.map(({ packageFingerprint }) => packageFingerprint).sort(),
  );
  assert.equal(
    assembly.rendererRegistryFingerprint,
    rendererRegistryFingerprint,
  );
  assert.equal(assembly.resourceCatalogFingerprint, catalog.catalogFingerprint);
  assert.ok(
    catalog.entries.filter(
      ({ descriptor }) => descriptor.kind === "authoring-reference",
    ).length >= 3,
  );
  assert.equal(
    assembly.storyVisualProjectionFingerprint,
    data.storyVisualProjectionFingerprint,
  );
  assert.equal(
    assembly.soundDesignProjectionFingerprint,
    data.sceneSoundProjectionFingerprint,
  );
  assert.equal(
    assembly.finalSoundProjectionFingerprint,
    data.finalSound.projection.projectionFingerprint,
  );
});

test("M9 Composition keeps fixed Scene GlobalVisual Caption narration SceneSound GlobalSound order", async () => {
  const source = await readFile(
    join(rootDir, "src/projects/product-comic-vertical/Composition.tsx"),
    "utf8",
  );
  const order = [
    "storyVisualTrack=",
    "globalVisualLayers=",
    "narrativeCore=",
    "soundDesignTrack=",
    "<SoundDesignTrack",
    "<GlobalSoundTrack",
  ].map((needle) => source.indexOf(needle));
  assert.ok(order.every((index) => index >= 0));
  assert.deepEqual(
    order,
    [...order].sort((left, right) => left - right),
  );
  assert.doesNotMatch(
    source,
    /node:fs|readdir\s*\(|glob\s*\(|fetch\s*\(|https?:|git\s|Agent|skill|MCP|import\s*\(/u,
  );
});

test("M9 FinalAssembly fails closed on every render-critical identity drift", () => {
  const assembly = productComicVerticalFinalAssemblyData.finalAssembly;
  for (const changed of [
    { ...assembly, resourceCatalogFingerprint: `sha256:${"3".repeat(64)}` },
    { ...assembly, compositionSourceChecksum: `sha256:${"4".repeat(64)}` },
    { ...assembly, globalSoundPlanFingerprint: `sha256:${"5".repeat(64)}` },
    { ...assembly, globalVisualPlanFingerprint: `sha256:${"6".repeat(64)}` },
    {
      ...assembly,
      scenePackageFingerprints: [
        `sha256:${"7".repeat(64)}`,
        ...assembly.scenePackageFingerprints.slice(1),
      ].sort(),
    },
  ]) {
    assert.throws(() => FinalAssemblyPlanSchema.parse(changed));
  }
});

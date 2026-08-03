import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

import {
  FinalAssemblyPlanSchema,
  GlobalSoundPlanSchema,
  GlobalVisualPlanSchema,
  GlobalVisualProjectionSchema,
  ResourceCatalogSchema,
} from "../../src/contracts";
import {gpsRelativityFinalAssemblyData} from "../../src/projects/gps-relativity/final-assembly-data";

test("GPS final assembly statically binds current M7 M8 and source identities", () => {
  const data = gpsRelativityFinalAssemblyData;
  assert.doesNotThrow(() => FinalAssemblyPlanSchema.parse(data.finalAssembly));
  assert.equal(
    data.finalAssembly.soundDesignProjectionFingerprint,
    data.sceneSoundProjectionFingerprint,
  );
  assert.equal(
    data.finalAssembly.globalSoundPlanFingerprint,
    data.finalSound.plan.planFingerprint,
  );
  assert.equal(
    data.finalAssembly.globalVisualPlanFingerprint,
    data.globalVisualPlan.planFingerprint,
  );
});

test("M8 runtime uses static imports and no executable data or external systems", async () => {
  const source = await readFile(
    new URL("../../src/projects/gps-relativity/final-assembly-data.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /node:fs|readdir\s*\(|\bglob\s*\(|fetch\s*\(|https?:|git\s|Agent|skill|MCP|import\s*\(/,
  );
  assert.match(source, /global-sound-plan\.json/);
  assert.match(source, /global-visual-plan\.json/);
  assert.match(source, /final-assembly\.generated\.json/);
});

test("GlobalVisual renderer is frame-driven caption-safe and not a generic DSL", async () => {
  const source = await readFile(
    new URL("../../src/projects/gps-relativity/global-visual/GlobalVisualLayers.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /useCurrentFrame/);
  assert.match(source, /pointerEvents:\s*["']none["']/);
  assert.doesNotMatch(source, /animation|transition|Caption|subtitle|layers\.map|componentId|modulePath|auto.*layout/i);
});

test("M8 assembly identities fail closed on every render-critical mutation", () => {
  const data = gpsRelativityFinalAssemblyData;
  const sound = data.finalSound.plan;
  const visual = data.globalVisualPlan;
  const projection = data.globalVisualProjection;
  const assembly = data.finalAssembly;

  assert.throws(() =>
    GlobalSoundPlanSchema.parse({
      ...sound,
      duckingPolicy: {...sound.duckingPolicy, attackFrames: 10},
    }),
  );
  assert.throws(() =>
    GlobalSoundPlanSchema.parse({
      ...sound,
      masteringPolicy: {...sound.masteringPolicy, bgmGain: 0.23},
    }),
  );
  assert.throws(() =>
    GlobalSoundPlanSchema.parse({...sound, durationInFrames: 1730}),
  );
  assert.throws(() => GlobalSoundPlanSchema.parse({...sound, fps: 29}));
  assert.throws(() =>
    GlobalSoundPlanSchema.parse({...sound, meaningId: "satellite-view"}),
  );
  assert.throws(() =>
    ResourceCatalogSchema.parse({
      ...data.assemblyCatalog,
      entries: data.assemblyCatalog.entries.filter(
        (entry) =>
          entry.descriptor.kind !== "asset" ||
          entry.descriptor.mediaRole !== "global-bgm",
      ),
    }),
  );
  assert.throws(() =>
    GlobalVisualPlanSchema.parse({
      ...visual,
      captionSafeArea: {...visual.captionSafeArea, top: 0},
    }),
  );
  assert.throws(() =>
    GlobalVisualProjectionSchema.parse({
      ...projection,
      sourceChecksum: `sha256:${"a".repeat(64)}`,
    }),
  );
  for (const changed of [
    {
      ...assembly,
      soundDesignProjectionFingerprint: `sha256:${"b".repeat(64)}`,
    },
    {
      ...assembly,
      scenePackageFingerprints: [
        `sha256:${"c".repeat(64)}`,
        ...assembly.scenePackageFingerprints.slice(1),
      ],
    },
    {...assembly, zOrderVersion: "caption-under-visual"},
    {
      ...assembly,
      compositionSourceChecksum: `sha256:${"d".repeat(64)}`,
    },
  ]) {
    assert.throws(() => FinalAssemblyPlanSchema.parse(changed));
  }
  assert.throws(() =>
    FinalAssemblyPlanSchema.parse({
      ...assembly,
      planFingerprint: undefined,
    }),
  );
});

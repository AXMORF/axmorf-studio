import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isValidElement } from "react";
import test from "node:test";

import {
  ReferenceFidelityReceiptSchema,
  SceneCoverageMapSchema,
  ScenePackageSchema,
  ShotRecipeSelectionSchema,
} from "@axmorf/studio/contracts";
import SceneRuntimeProof, {
  sceneRuntimeProofMetadata,
} from "../../proofs/scene-runtime/source/Composition";
import {
  sceneRuntimeProofCoverage,
  sceneRuntimeProofFidelityReceipt,
  sceneRuntimeProofScenePackage,
  sceneRuntimeProofSelection,
  sceneRuntimeProofSoundDesignProjection,
  sceneRuntimeProofStoryVisualProjection,
} from "../../proofs/scene-runtime/source/proof-data";
import { CompositionAssembly } from "@axmorf/studio/remotion";

test("synthetic proof binds one exact current Scene package coverage and both projections", () => {
  assert.deepEqual(sceneRuntimeProofMetadata, {
    id: "SceneRuntimeProof",
    durationInFrames: 120,
    fps: 30,
    width: 1920,
    height: 1080,
  });
  assert.equal(
    ScenePackageSchema.parse(sceneRuntimeProofScenePackage).meaningId,
    "runtime-proof-scene",
  );
  assert.deepEqual(
    SceneCoverageMapSchema.parse(sceneRuntimeProofCoverage).entries.map(
      (entry) => entry.status,
    ),
    ["ready"],
  );
  assert.equal(
    ShotRecipeSelectionSchema.parse(sceneRuntimeProofSelection).selections[0]
      ?.mode,
    "exact-demo-localized",
  );
  assert.equal(
    ReferenceFidelityReceiptSchema.parse(sceneRuntimeProofFidelityReceipt)
      .status,
    "pass",
  );
  assert.equal(sceneRuntimeProofStoryVisualProjection.entries.length, 1);
  assert.equal(sceneRuntimeProofSoundDesignProjection.entries.length, 1);
});

test("synthetic proof assembly mounts explicit visual narrative and Scene sound slots", () => {
  const element = SceneRuntimeProof();
  assert.ok(
    isValidElement<{
      globalVisualBackgroundLayers: unknown;
      storyVisualTrack: unknown;
      narrativeCore: unknown;
      soundDesignTrack: unknown;
    }>(element),
  );
  assert.equal(element.type, CompositionAssembly);
  assert.deepEqual(Object.keys(element.props), [
    "globalVisualBackgroundLayers",
    "storyVisualTrack",
    "narrativeCore",
    "soundDesignTrack",
  ]);
});

test("proof Renderer is visual-only and has real adapted Shot frame binding", async () => {
  const renderer = await readFile(
    new URL(
      "../../proofs/scene-runtime/fixtures/scenes/runtime-proof-scene/Renderer.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const shot = await readFile(
    new URL(
      "../../proofs/scene-runtime/fixtures/scenes/runtime-proof-scene/shots/DrawSvgTraceShot.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(renderer, /import \{ DrawSvgTraceShot \}/);
  assert.match(renderer, /const shotFrame = sceneFrame/);
  assert.match(renderer, /<DrawSvgTraceShot[\s\S]*shotFrame=\{shotFrame\}/);
  assert.match(shot, /pathLength=\{1\}/);
  assert.match(shot, /\[8, 48\]/);
  assert.match(shot, /\[48, 56\]/);
  for (const forbidden of [
    "<Audio",
    "Html5Audio",
    "CaptionLayer",
    "Narration",
    "animation:",
    "transition:",
  ]) {
    assert.equal(`${renderer}\n${shot}`.includes(forbidden), false);
  }
});

test("proof is isolated from GPS and the normal Root registry", async () => {
  const paths = [
    "../../proofs/scene-runtime/source/Root.tsx",
    "../../proofs/scene-runtime/source/Composition.tsx",
    "../../proofs/scene-runtime/source/proof-data.ts",
  ];
  const source = (
    await Promise.all(
      paths.map((path) => readFile(new URL(path, import.meta.url), "utf8")),
    )
  ).join("\n");
  assert.equal(source.includes("gps-relativity"), false);
  const normalRoot = await readFile(
    new URL("../../src/Root.tsx", import.meta.url),
    "utf8",
  );
  assert.equal(normalRoot.includes("scene-runtime"), false);
});

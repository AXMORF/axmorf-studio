import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isValidElement } from "react";
import test from "node:test";

import {
  ReferenceFidelityReceiptSchema,
  SceneCoverageMapSchema,
  ScenePackageSchema,
  ShotRecipeSelectionSchema,
} from "../../src/contracts";
import M6SceneRuntimeProof, {
  m6SceneRuntimeProofMetadata,
} from "../../src/remotion/proofs/m6-scene-runtime/Composition";
import {
  m6ProofCoverage,
  m6ProofFidelityReceipt,
  m6ProofScenePackage,
  m6ProofSelection,
  m6ProofSoundDesignProjection,
  m6ProofStoryVisualProjection,
} from "../../src/remotion/proofs/m6-scene-runtime/proof-data";
import { CompositionAssembly } from "../../src/remotion/runtime/composition-assembly";

test("synthetic proof binds one exact current Scene package coverage and both projections", () => {
  assert.deepEqual(m6SceneRuntimeProofMetadata, {
    id: "M6SceneRuntimeProof",
    durationInFrames: 120,
    fps: 30,
    width: 1920,
    height: 1080,
  });
  assert.equal(
    ScenePackageSchema.parse(m6ProofScenePackage).meaningId,
    "m6-scene-proof",
  );
  assert.deepEqual(
    SceneCoverageMapSchema.parse(m6ProofCoverage).entries.map(
      (entry) => entry.status,
    ),
    ["ready"],
  );
  assert.equal(
    ShotRecipeSelectionSchema.parse(m6ProofSelection).selections[0]?.mode,
    "exact-demo-localized",
  );
  assert.equal(
    ReferenceFidelityReceiptSchema.parse(m6ProofFidelityReceipt).status,
    "pass",
  );
  assert.equal(m6ProofStoryVisualProjection.entries.length, 1);
  assert.equal(m6ProofSoundDesignProjection.entries.length, 1);
});

test("synthetic proof assembly mounts explicit visual narrative and Scene sound slots", () => {
  const element = M6SceneRuntimeProof();
  assert.ok(
    isValidElement<{
      storyVisualTrack: unknown;
      narrativeCore: unknown;
      soundDesignTrack: unknown;
    }>(element),
  );
  assert.equal(element.type, CompositionAssembly);
  assert.deepEqual(Object.keys(element.props), [
    "storyVisualTrack",
    "narrativeCore",
    "soundDesignTrack",
  ]);
});

test("proof Renderer is visual-only and has real adapted Shot frame binding", async () => {
  const renderer = await readFile(
    new URL(
      "../../src/remotion/proofs/m6-scene-runtime/scenes/m6-scene-proof/Renderer.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const shot = await readFile(
    new URL(
      "../../src/remotion/proofs/m6-scene-runtime/scenes/m6-scene-proof/shots/DrawSvgTraceShot.tsx",
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
    "../../src/remotion/proofs/m6-scene-runtime/Root.tsx",
    "../../src/remotion/proofs/m6-scene-runtime/Composition.tsx",
    "../../src/remotion/proofs/m6-scene-runtime/proof-data.ts",
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
  assert.equal(normalRoot.includes("m6-scene-runtime"), false);
});

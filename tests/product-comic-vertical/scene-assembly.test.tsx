import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import {
  SceneCoverageMapSchema,
  ScenePackageSchema,
  SemanticTimingSchema,
} from "../../src/contracts";
import {
  productComicVerticalCoverage,
  productComicVerticalRendererPropsByMeaning,
  productComicVerticalRendererRegistry,
  productComicVerticalSoundDesignProjection,
  productComicVerticalStoryVisualProjection,
} from "../../src/projects/product-comic-vertical/scene-runtime-data";
import {
  rendererRegistryFingerprint,
  rendererSourceGraphFingerprints,
} from "../../src/projects/product-comic-vertical/renderer-registry.generated";

const rootDir = process.cwd();
const meaningIds = [
  "problem-hook",
  "problem-friction",
  "product-reveal",
  "core-capabilities",
  "workflow-input",
  "workflow-create",
  "workflow-result",
  "differentiated-value",
  "proof-and-fit",
  "call-to-action",
] as const;

const readJson = async (path: string): Promise<unknown> =>
  JSON.parse(await readFile(join(rootDir, path), "utf8"));

test("Product Comic coverage and registry contain ten literal Scene bindings", async () => {
  const coverage = SceneCoverageMapSchema.parse(
    await readJson(
      "src/projects/product-comic-vertical/generated/scene-coverage.generated.json",
    ),
  );
  assert.deepEqual(coverage.storyBeatOrder, meaningIds);
  assert.deepEqual(productComicVerticalCoverage, coverage);
  assert.equal(coverage.entries.length, 10);
  assert.ok(coverage.entries.every((entry) => entry.status === "ready"));
  assert.deepEqual(Object.keys(productComicVerticalRendererRegistry), [
    "product-comic-vertical-call-to-action",
    "product-comic-vertical-core-capabilities",
    "product-comic-vertical-differentiated-value",
    "product-comic-vertical-problem-friction",
    "product-comic-vertical-problem-hook",
    "product-comic-vertical-product-reveal",
    "product-comic-vertical-proof-and-fit",
    "product-comic-vertical-workflow-create",
    "product-comic-vertical-workflow-input",
    "product-comic-vertical-workflow-result",
  ]);
  assert.match(rendererRegistryFingerprint, /^sha256:[0-9a-f]{64}$/u);
  const sourceGraphs: Readonly<Record<string, string>> =
    rendererSourceGraphFingerprints;
  for (const [index, meaningId] of meaningIds.entries()) {
    const scenePackage = ScenePackageSchema.parse(
      await readJson(
        `src/projects/product-comic-vertical/scenes/${meaningId}/generated/scene-package.generated.json`,
      ),
    );
    const coverageEntry: (typeof coverage.entries)[number] | undefined =
      coverage.entries[index];
    assert.ok(coverageEntry?.status === "ready");
    assert.equal(coverageEntry.meaningId, meaningId);
    assert.equal(
      coverageEntry.packageFingerprint,
      scenePackage.packageFingerprint,
    );
    assert.equal(
      sourceGraphs[scenePackage.rendererBinding.rendererId],
      scenePackage.rendererBinding.rendererSourceFingerprint,
    );
  }
});

test("M9 visual and sound projections preserve sealed order timing and Scene ownership", async () => {
  const timing = SemanticTimingSchema.parse(
    await readJson(
      "src/projects/product-comic-vertical/generated/semantic-timing.generated.json",
    ),
  );
  assert.equal(
    productComicVerticalStoryVisualProjection.storyId,
    "product-comic-vertical",
  );
  assert.equal(
    productComicVerticalStoryVisualProjection.durationInFrames,
    5116,
  );
  assert.equal(productComicVerticalStoryVisualProjection.leadInFrames, 15);
  assert.equal(productComicVerticalStoryVisualProjection.tailFrames, 15);
  assert.equal(
    productComicVerticalStoryVisualProjection.registryFingerprint,
    rendererRegistryFingerprint,
  );
  assert.deepEqual(
    productComicVerticalStoryVisualProjection.entries.map(
      ({ meaningId }) => meaningId,
    ),
    meaningIds,
  );
  assert.deepEqual(
    productComicVerticalStoryVisualProjection.entries.map(
      ({ startFrame, endFrame }) => ({
        startFrame,
        endFrame,
      }),
    ),
    timing.storyBeats.map(({ startFrame, endFrame }) => ({
      startFrame,
      endFrame,
    })),
  );
  assert.equal(productComicVerticalStoryVisualProjection.transitions.length, 9);
  assert.ok(
    productComicVerticalStoryVisualProjection.transitions.every(
      (transition) =>
        transition.kind === "hard-cut" && transition.durationInFrames === 0,
    ),
  );
  assert.deepEqual(
    productComicVerticalSoundDesignProjection.entries.map(
      ({ meaningId }) => meaningId,
    ),
    meaningIds,
  );
  for (const entry of productComicVerticalSoundDesignProjection.entries) {
    assert.equal(entry.status, "ready");
    if (entry.status !== "ready") continue;
    const beatDuration =
      entry.sceneSoundProjection.beatEndFrame -
      entry.sceneSoundProjection.beatStartFrame;
    assert.ok(
      entry.sceneSoundProjection.contributions.every(
        ({ startFrame, endFrame, publicPath }) =>
          startFrame >= 0 &&
          endFrame > startFrame &&
          endFrame <= beatDuration &&
          publicPath.startsWith(
            `public/projects/product-comic-vertical/scene-audio/${entry.meaningId}/`,
          ),
      ),
    );
  }
  assert.deepEqual(
    Object.keys(productComicVerticalRendererPropsByMeaning),
    meaningIds,
  );
});

test("M9 aggregate runtime is static and does not take over captions narration or global layers", async () => {
  const runtimeSource = await readFile(
    join(rootDir, "src/projects/product-comic-vertical/scene-runtime-data.ts"),
    "utf8",
  );
  const registrySource = await readFile(
    join(
      rootDir,
      "src/projects/product-comic-vertical/renderer-registry.generated.ts",
    ),
    "utf8",
  );
  assert.doesNotMatch(
    runtimeSource + registrySource,
    /node:fs|readdir|glob\s*\(|fetch\s*\(|https?:|child_process|\.git|CaptionLayer|NarrativeCore|GlobalVisual|GlobalSound/u,
  );
  assert.equal(
    (registrySource.match(/^import Renderer\d+ from /gmu) ?? []).length,
    10,
  );
  assert.doesNotMatch(registrySource, /import\s*\(/u);
});

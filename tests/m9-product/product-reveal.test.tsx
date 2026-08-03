import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {access, readFile} from "node:fs/promises";
import {join} from "node:path";
import test from "node:test";

import {
  LocalizationManifestSchema,
  ReferenceFidelityReceiptSchema,
  ReferenceFidelityReviewSchema,
  ResourceCatalogSchema,
  ScenePackageSchema,
  SceneSoundPlanSchema,
  SceneSyncAnchorSetSchema,
  SceneTaskInputSchema,
  SceneVisualPlanSchema,
  ShotPlanSetSchema,
  ShotRecipeSelectionSchema,
  serializeCanonicalJson,
  validateScenePlanBundle,
} from "../../src/contracts";
import {proveRendererFrameBinding} from "../../scripts/external-references/fidelity";

const rootDir = process.cwd();
const sceneRoot =
  "src/projects/product-comic-vertical/scenes/product-reveal";

const requiredSceneFiles = [
  "Renderer.tsx",
  "shots/ProductRevealPanels.tsx",
  "authoring/Composition.tsx",
  "authoring/Root.tsx",
  "authoring/index.ts",
  "task-input.generated.json",
  "visual-plan.json",
  "shot-plan.json",
  "shot-recipe-selection.json",
  "sound-plan.json",
  "sync-anchors.json",
  "selected-resources.json",
  "generated/reference-fidelity.generated.json",
  "generated/reference-fidelity-review.generated.json",
  "generated/scene-package.generated.json",
  "shots/video-shotcraft/draw-svg-trace/LICENSE",
  "shots/video-shotcraft/draw-svg-trace/localization-manifest.generated.json",
  "shots/video-shotcraft/draw-svg-trace/upstream/demos/_fixtures/Fixtures.tsx",
  "shots/video-shotcraft/draw-svg-trace/upstream/demos/ui-entrance/draw-svg-trace/DrawSvgTrace.tsx",
  "shots/video-shotcraft/draw-svg-trace/AdaptedShot.tsx",
] as const;

const readJson = async (path: string): Promise<unknown> =>
  JSON.parse(await readFile(join(rootDir, path), "utf8"));

const checksum = async (path: string) =>
  `sha256:${createHash("sha256")
    .update(new Uint8Array(await readFile(join(rootDir, path))))
    .digest("hex")}`;

test("product-reveal owns the fixed exact ScenePackage file set", async () => {
  const missing: string[] = [];
  for (const repositoryPath of requiredSceneFiles) {
    try {
      await access(join(rootDir, sceneRoot, repositoryPath));
    } catch {
      missing.push(repositoryPath);
    }
  }
  assert.deepEqual(missing, [], `missing product-reveal contracts: ${missing.join(", ")}`);
});

test("product-reveal frozen inputs still bind the exact Beat window source and cue", async () => {
  const [story, timing, inventory, coverage, catalog] = await Promise.all(
    [
      "src/projects/product-comic-vertical/story.json",
      "src/projects/product-comic-vertical/generated/semantic-timing.generated.json",
      "src/projects/product-comic-vertical/references/video-shotcraft/shot-inventory.generated.json",
      "src/projects/product-comic-vertical/references/video-shotcraft/shot-coverage.json",
      "src/projects/product-comic-vertical/generated/resource-catalog.generated.json",
    ].map(async (path) => JSON.parse(await readFile(join(rootDir, path), "utf8"))),
  );
  assert.ok(
    story.beats.some((beat: {meaningId: string}) => beat.meaningId === "product-reveal"),
  );
  assert.deepEqual(
    timing.storyBeats.find(
      (beat: {meaningId: string}) => beat.meaningId === "product-reveal",
    ),
    {meaningId: "product-reveal", startFrame: 1083, endFrame: 1316},
  );
  const item = inventory.items.find(
    (candidate: {cardName: string; styleKey: string}) =>
      candidate.cardName === "draw-svg-trace" &&
      candidate.styleKey === "draw-svg-trace",
  );
  assert.equal(item.exactDemo.status, "resolved");
  assert.equal(item.sourceCommit, "d4915443232e89527fdc9d7e79f132ba411fc440");
  const coverageItem = coverage.items.find(
    (candidate: {cardName: string; styleKey: string}) =>
      candidate.cardName === "draw-svg-trace" &&
      candidate.styleKey === "draw-svg-trace",
  );
  assert.equal(coverageItem.decision, "selected-exact");
  assert.equal(coverageItem.selection.meaningId, "product-reveal");
  assert.ok(
    catalog.entries.some(
      (entry: {descriptor: {id: string; checksum?: string}}) =>
        entry.descriptor.id ===
          "asset.product-comic-vertical.scene.product-reveal.ink-close-snap" &&
        entry.descriptor.checksum ===
          "sha256:2dbf3408e0d92f519f6e80d9dd311bdb0be00747c0e5afb9021a511721a65073",
    ),
  );
});

test("product-reveal Renderer and authoring boundaries are explicit", async () => {
  const [renderer, adapted, authoring, root] = await Promise.all(
    [
      "Renderer.tsx",
      "shots/video-shotcraft/draw-svg-trace/AdaptedShot.tsx",
      "authoring/Composition.tsx",
      "authoring/Root.tsx",
    ].map((path) => readFile(join(rootDir, sceneRoot, path), "utf8")),
  );
  assert.match(renderer, /import\s*\{AdaptedShot\}\s*from\s*"\.\/shots\/video-shotcraft\/draw-svg-trace\/AdaptedShot"/u);
  assert.match(renderer, /const shotFrame = sceneFrame/u);
  assert.match(renderer, /<AdaptedShot shotFrame=\{shotFrame\}/u);
  assert.match(adapted, /strokeDashoffset=\{/u);
  assert.doesNotMatch(
    renderer + adapted,
    /fetch\s*\(|https?:\/\/|child_process|\.git|readdir|glob\s*\(|CaptionLayer|Narration|<Audio|<Video|\banimation\s*:|\btransition\s*:/u,
  );
  assert.match(authoring, /ink-close-snap\.wav/u);
  assert.match(authoring, /<Sequence from=\{80\} durationInFrames=\{9\}/u);
  assert.match(root, /id="ProductComicVertical-product-reveal-Authoring"/u);
});

test("product-reveal task plans and presealed cue form one fail-closed 233-frame bundle", async () => {
  const [task, visual, shots, anchors, sound, catalog, selectedInput] =
    await Promise.all([
      readJson(`${sceneRoot}/task-input.generated.json`).then(
        SceneTaskInputSchema.parse,
      ),
      readJson(`${sceneRoot}/visual-plan.json`).then(SceneVisualPlanSchema.parse),
      readJson(`${sceneRoot}/shot-plan.json`).then(ShotPlanSetSchema.parse),
      readJson(`${sceneRoot}/sync-anchors.json`).then(
        SceneSyncAnchorSetSchema.parse,
      ),
      readJson(`${sceneRoot}/sound-plan.json`).then(SceneSoundPlanSchema.parse),
      readJson(
        "src/projects/product-comic-vertical/generated/resource-catalog.generated.json",
      ).then(ResourceCatalogSchema.parse),
      readJson(`${sceneRoot}/selected-resources.json`),
    ]);
  validateScenePlanBundle({
    taskInputFingerprint: task.taskInputFingerprint,
    meaningId: "product-reveal",
    sceneDurationInFrames: 233,
    allowedResourceIds: task.allowedResourceIds,
    visualPlan: visual,
    shotPlan: shots,
    syncAnchors: anchors,
    soundPlan: sound,
  });
  assert.deepEqual(task.timingBeat, {
    meaningId: "product-reveal",
    startFrame: 1083,
    endFrame: 1316,
  });
  assert.equal(task.continuity.previousMeaningId, "problem-friction");
  assert.equal(task.continuity.nextMeaningId, "core-capabilities");
  assert.match(task.continuity.continuityBrief, /创作权威.*runtime projection/u);
  assert.equal(visual.recipeDecision, "exact-demo-localized");
  assert.deepEqual(visual.orderedShotIds, ["product-reveal-panels"]);
  assert.deepEqual(anchors.anchors, [
    {
      eventId: "ink-close",
      sceneLocalFrame: 80,
      purpose:
        "准确闭合墨线完成一圈并闪黑，产品内容开始接棒，触发已封存 ink-close-snap。",
    },
  ]);
  assert.equal(sound.ambience, null);
  assert.equal(sound.cues.length, 1);
  assert.deepEqual(sound.cues[0]?.timing, {
    kind: "anchor",
    eventId: "ink-close",
    offsetFrames: 0,
  });
  assert.equal(sound.cues[0]?.durationInFrames, 9);
  assert.equal(sound.cues[0]?.volume, 0.28);

  assert.ok(typeof selectedInput === "object" && selectedInput !== null);
  const selectedResources = (
    selectedInput as {selectedResources?: readonly unknown[]}
  ).selectedResources;
  assert.ok(selectedResources && selectedResources.length === 1);
  const audioEntry = catalog.entries.find(
    ({descriptor}) =>
      descriptor.id ===
      "asset.product-comic-vertical.scene.product-reveal.ink-close-snap",
  );
  assert.ok(audioEntry && audioEntry.descriptor.kind === "asset");
  const selectedRecord = selectedResources[0] as {
    descriptor: unknown;
    selected: {descriptorFingerprint: string; resourceId: string};
  };
  assert.equal(
    serializeCanonicalJson(selectedRecord.descriptor),
    serializeCanonicalJson(audioEntry.descriptor),
  );
  assert.equal(
    selectedRecord.selected.descriptorFingerprint,
    audioEntry.descriptorFingerprint,
  );
  assert.equal(audioEntry.descriptor.checksum, await checksum(
    "public/projects/product-comic-vertical/scene-audio/product-reveal/ink-close-snap.wav",
  ));
});

test("product-reveal exact lineage closure real frame binding and media evidence reproduce a pass-only receipt", async () => {
  const [task, selection, localization, review, receipt, rendererSource, adaptedShotSource, inventory, coverage] =
    await Promise.all([
      readJson(`${sceneRoot}/task-input.generated.json`).then(
        SceneTaskInputSchema.parse,
      ),
      readJson(`${sceneRoot}/shot-recipe-selection.json`).then(
        ShotRecipeSelectionSchema.parse,
      ),
      readJson(
        `${sceneRoot}/shots/video-shotcraft/draw-svg-trace/localization-manifest.generated.json`,
      ).then(LocalizationManifestSchema.parse),
      readJson(
        `${sceneRoot}/generated/reference-fidelity-review.generated.json`,
      ).then(ReferenceFidelityReviewSchema.parse),
      readJson(`${sceneRoot}/generated/reference-fidelity.generated.json`).then(
        ReferenceFidelityReceiptSchema.parse,
      ),
      readFile(join(rootDir, sceneRoot, "Renderer.tsx"), "utf8"),
      readFile(
        join(
          rootDir,
          sceneRoot,
          "shots/video-shotcraft/draw-svg-trace/AdaptedShot.tsx",
        ),
        "utf8",
      ),
      readJson(
        "src/projects/product-comic-vertical/references/video-shotcraft/shot-inventory.generated.json",
      ),
      readJson(
        "src/projects/product-comic-vertical/references/video-shotcraft/shot-coverage.json",
      ),
    ]);
  assert.equal(selection.selections.length, 1);
  const exact = selection.selections[0];
  assert.ok(exact && exact.mode === "exact-demo-localized");
  assert.equal(exact.cardId, "draw-svg-trace");
  assert.equal(exact.styleKey, "draw-svg-trace");
  assert.equal(exact.adaptationMode, "adapted");
  assert.equal(exact.snapshotFingerprint, task.allowedSnapshots[0]?.snapshotFingerprint);
  assert.equal(exact.closureFingerprint, localization.closureFingerprint);
  assert.equal(
    exact.localizationFingerprint,
    localization.localizationFingerprint,
  );
  assert.ok(typeof inventory === "object" && inventory !== null);
  assert.ok(typeof coverage === "object" && coverage !== null);
  const item = (
    inventory as {items: readonly Record<string, unknown>[]}
  ).items.find(
    (candidate) =>
      candidate.cardName === "draw-svg-trace" &&
      candidate.styleKey === "draw-svg-trace",
  );
  const coverageItem = (
    coverage as {items: readonly Record<string, unknown>[]}
  ).items.find(
    (candidate) =>
      candidate.cardName === "draw-svg-trace" &&
      candidate.styleKey === "draw-svg-trace",
  );
  assert.ok(item && coverageItem);
  assert.equal(item.sourceCommit, "d4915443232e89527fdc9d7e79f132ba411fc440");
  assert.equal(item.cardChecksum, exact.cardDocumentChecksum);
  assert.equal(
    (item.preview as {checksum: string}).checksum,
    exact.previewChecksum,
  );
  assert.equal(
    ((item.exactDemo as {sourceFiles: readonly {path: string; checksum: string}[]})
      .sourceFiles.find(({path}) => path.endsWith("DrawSvgTrace.tsx")))
      ?.checksum,
    exact.demoSourceChecksum,
  );
  assert.equal(coverageItem.decision, "selected-exact");
  assert.equal(
    (coverageItem.selection as {meaningId: string}).meaningId,
    "product-reveal",
  );
  assert.equal(localization.licenseId, "Apache-2.0");
  assert.equal(localization.files.length, 3);
  for (const file of localization.files) {
    assert.equal(
      await checksum(`${localization.targetRoot}/${file.destinationPath}`),
      file.localizedChecksum,
    );
  }

  const rendererPath = `${sceneRoot}/Renderer.tsx`;
  const adaptedShotPath = `${sceneRoot}/shots/video-shotcraft/draw-svg-trace/AdaptedShot.tsx`;
  const binding = proveRendererFrameBinding({
    rendererPath,
    rendererSource,
    adaptedShotPath,
    adaptedShotSource,
  });
  assert.deepEqual(binding, {
    importSpecifier:
      "./shots/video-shotcraft/draw-svg-trace/AdaptedShot",
    componentIdentifier: "AdaptedShot",
    sceneFrameIdentifier: "sceneFrame",
    derivedFrameIdentifier: "shotFrame",
    frameProp: "shotFrame",
  });
  assert.throws(() =>
    proveRendererFrameBinding({
      rendererPath,
      rendererSource: rendererSource.replace(
        "<AdaptedShot shotFrame={shotFrame}",
        "<AdaptedShot shotFrame={0}",
      ),
      adaptedShotPath,
      adaptedShotSource,
    }),
  );

  assert.equal(review.selectionFingerprint, selection.selectionFingerprint);
  assert.equal(review.items.length, 1);
  const reviewItem = review.items[0];
  assert.ok(reviewItem);
  assert.equal(reviewItem.sourceDurationInFrames, 140);
  assert.equal(reviewItem.adaptationDurationInFrames, 233);
  assert.deepEqual(
    reviewItem.phasePairs.map(({normalizedPhase, sourceFrame, adaptationFrame}) => ({
      normalizedPhase,
      sourceFrame,
      adaptationFrame,
    })),
    [
      {normalizedPhase: 0.2, sourceFrame: 28, adaptationFrame: 46},
      {normalizedPhase: 0.38, sourceFrame: 53, adaptationFrame: 89},
      {normalizedPhase: 0.7, sourceFrame: 98, adaptationFrame: 163},
    ],
  );
  assert.deepEqual(
    reviewItem.traitReviews.map(({trait}) => trait),
    exact.requiredTraits,
  );
  for (const artifact of [
    reviewItem.sourcePreview,
    reviewItem.adaptationPreview,
    ...reviewItem.phasePairs.flatMap((pair) => [
      pair.sourceEvidence,
      pair.adaptationEvidence,
    ]),
  ]) {
    assert.equal(await checksum(artifact.artifactPath), artifact.checksum);
  }
  assert.equal(receipt.status, "pass");
  if (receipt.status !== "pass") throw new Error("exact receipt must pass");
  assert.equal(receipt.selectionFingerprint, selection.selectionFingerprint);
  assert.equal(receipt.reviewFingerprint, review.reviewFingerprint);
  assert.equal(receipt.items[0]?.reviewItemFingerprint, reviewItem.itemFingerprint);
  assert.equal(receipt.items[0]?.rendererBinding.importSpecifier, binding.importSpecifier);
  assert.equal(receipt.items[0]?.rendererBinding.sceneFrameIdentifier, "sceneFrame");
  assert.equal(receipt.items[0]?.rendererBinding.derivedFrameIdentifier, "shotFrame");
});

test("product-reveal ScenePackage binds the current exact receipt Renderer and Scene-local sound only", async () => {
  const [scenePackage, receipt, selection] = await Promise.all([
    readJson(`${sceneRoot}/generated/scene-package.generated.json`).then(
      ScenePackageSchema.parse,
    ),
    readJson(`${sceneRoot}/generated/reference-fidelity.generated.json`).then(
      ReferenceFidelityReceiptSchema.parse,
    ),
    readJson(`${sceneRoot}/shot-recipe-selection.json`).then(
      ShotRecipeSelectionSchema.parse,
    ),
  ]);
  assert.equal(scenePackage.storyId, "product-comic-vertical");
  assert.equal(scenePackage.meaningId, "product-reveal");
  assert.deepEqual(scenePackage.beatFrameRange, {
    startFrame: 1083,
    endFrame: 1316,
  });
  assert.equal(
    scenePackage.rendererBinding.rendererId,
    "product-comic-vertical-product-reveal",
  );
  assert.equal(scenePackage.selectionFingerprint, selection.selectionFingerprint);
  assert.equal(
    scenePackage.fidelityReceiptFingerprint,
    receipt.receiptFingerprint,
  );
  assert.equal(scenePackage.selectedResources.length, 1);
  assert.equal(scenePackage.selectedResources[0]?.role, "scene-sfx");
  assert.equal(
    scenePackage.selectedResources[0]?.resourceId,
    "asset.product-comic-vertical.scene.product-reveal.ink-close-snap",
  );
});

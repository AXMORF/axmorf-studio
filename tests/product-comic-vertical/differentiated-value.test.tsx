import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  ReferenceFidelityReceiptSchema,
  RenderSpecSchema,
  ResourceCatalogSchema,
  ResourceDescriptorSchema,
  ScenePackageSchema,
  SceneSoundPlanSchema,
  SceneSyncAnchorSetSchema,
  SceneTaskInputSchema,
  SceneVisualPlanSchema,
  SelectedResourceRefSchema,
  SemanticTimingSchema,
  Sha256DigestSchema,
  ShotPlanSetSchema,
  ShotRecipeSelectionSchema,
  StorySpecSchema,
  VisualStyleSpecSchema,
  buildSceneTaskInput,
  computeRenderSpecFingerprint,
  computeStoryFingerprint,
  computeVisualStyleFingerprint,
  createFingerprint,
  serializeCanonicalJson,
  validateScenePlanBundle,
} from "../../src/contracts";
import { derivePreFinalSceneCatalog } from "../../scripts/project-check/final-run";
import {
  validateCoverageDocument,
  validateInventoryDocument,
} from "../../scripts/project-tools/product-comic-vertical/shotcraft-inventory";

const rootDir = process.cwd();
const sceneRoot =
  "src/projects/product-comic-vertical/scenes/differentiated-value";
const audioPath =
  "public/projects/product-comic-vertical/scene-audio/differentiated-value/invalidation-crack.wav";
const audioResourceId =
  "asset.product-comic-vertical.scene.differentiated-value.invalidation-crack";

const requiredSceneFiles = [
  "Renderer.tsx",
  "shots/EvidenceBoundaryPanels.tsx",
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
  "generated/scene-package.generated.json",
] as const;

const readJson = async (repositoryPath: string): Promise<unknown> =>
  JSON.parse(await readFile(join(rootDir, repositoryPath), "utf8"));

const checksum = async (repositoryPath: string) =>
  `sha256:${createHash("sha256")
    .update(new Uint8Array(await readFile(join(rootDir, repositoryPath))))
    .digest("hex")}`;

const readInventory = () =>
  readJson(
    "src/projects/product-comic-vertical/references/video-shotcraft/shot-inventory.generated.json",
  ).then(validateInventoryDocument);

const readCoverage = async () => {
  const [rawCoverage, inventory] = await Promise.all([
    readJson(
      "src/projects/product-comic-vertical/references/video-shotcraft/shot-coverage.json",
    ),
    readInventory(),
  ]);
  return validateCoverageDocument(rawCoverage, inventory);
};

const readUpstreamFingerprint = async () => {
  const raw = await readJson(
    "src/projects/product-comic-vertical/references/video-shotcraft/upstream-receipt.generated.json",
  );
  assert.ok(typeof raw === "object" && raw !== null);
  return Sha256DigestSchema.parse(
    (raw as Record<string, unknown>).receiptFingerprint,
  );
};

const readSelectedResourceInput = async () => {
  const raw = await readJson(`${sceneRoot}/selected-resources.json`);
  assert.ok(typeof raw === "object" && raw !== null);
  const selectedResources = (raw as Record<string, unknown>).selectedResources;
  assert.ok(Array.isArray(selectedResources));
  return selectedResources.map((entry) => {
    assert.ok(typeof entry === "object" && entry !== null);
    const record = entry as Record<string, unknown>;
    return {
      selected: SelectedResourceRefSchema.parse(record.selected),
      descriptor: ResourceDescriptorSchema.parse(record.descriptor),
    };
  });
};

test("differentiated-value owns the fixed Renderer plan and ScenePackage file set", async () => {
  for (const repositoryPath of requiredSceneFiles) {
    await access(join(rootDir, sceneRoot, repositoryPath));
  }
});

test("differentiated-value task input binds current Story timing style Catalog Shotcraft and continuity", async () => {
  const [story, render, timing, visualStyle, catalog, upstream] =
    await Promise.all([
      readJson("src/projects/product-comic-vertical/story.json").then(
        StorySpecSchema.parse,
      ),
      readJson("src/projects/product-comic-vertical/render.json").then(
        RenderSpecSchema.parse,
      ),
      readJson(
        "src/projects/product-comic-vertical/generated/semantic-timing.generated.json",
      ).then(SemanticTimingSchema.parse),
      readJson("src/projects/product-comic-vertical/visual-style.json").then(
        VisualStyleSpecSchema.parse,
      ),
      readJson(
        "src/projects/product-comic-vertical/generated/resource-catalog.generated.json",
      ).then(derivePreFinalSceneCatalog),
      readUpstreamFingerprint(),
    ]);
  const storyBeat = story.beats.find(
    ({ meaningId }) => meaningId === "differentiated-value",
  );
  const timingBeat = timing.storyBeats.find(
    ({ meaningId }) => meaningId === "differentiated-value",
  );
  const previousBeat = story.beats.find(
    ({ meaningId }) => meaningId === "workflow-result",
  );
  const nextBeat = story.beats.find(
    ({ meaningId }) => meaningId === "proof-and-fit",
  );
  const styleEntry = catalog.entries.find(
    ({ descriptor }) => descriptor.id === "style.comic-anime",
  );
  const audioEntry = catalog.entries.find(
    ({ descriptor }) => descriptor.id === audioResourceId,
  );
  assert.ok(
    storyBeat &&
      timingBeat &&
      previousBeat &&
      nextBeat &&
      styleEntry &&
      audioEntry,
  );
  const expected = buildSceneTaskInput({
    storyId: story.storyId,
    meaningId: "differentiated-value",
    storyBeat,
    timingBeat,
    storyFingerprint: computeStoryFingerprint(story),
    semanticTimingFingerprint: timing.fingerprint,
    renderFingerprint: computeRenderSpecFingerprint(render),
    visualStyleFingerprint: computeVisualStyleFingerprint({
      visualStyle,
      resolvedStyleDescriptorFingerprint: styleEntry.descriptorFingerprint,
    }),
    resourceCatalogFingerprint: catalog.catalogFingerprint,
    allowedSnapshots: [
      {
        sourceId: "video-shotcraft",
        snapshotFingerprint: upstream,
        allowedCardIds: ["transition-hidden-cut"],
      },
    ],
    allowedResourceIds: [audioResourceId],
    continuity: {
      previousMeaningId: previousBeat.meaningId,
      previousSummary: previousBeat.narrativePurpose,
      nextMeaningId: nextBeat.meaningId,
      nextSummary: nextBeat.narrativePurpose,
      continuityBrief:
        "入口继承 workflow-result 的 current evidence stamp；不做竞品比较，versus-slam 仅表现 current evidence 与 stale evidence 的因果分界。出口保持 verified-vs-invalidated boundary，供 proof-and-fit 回到团队适配与人工批准边界。",
    },
    allowedDirectories: {
      sceneRoot,
      publicAssetRoot:
        "public/projects/product-comic-vertical/scenes/differentiated-value",
    },
  });
  const task = SceneTaskInputSchema.parse(
    await readJson(`${sceneRoot}/task-input.generated.json`),
  );
  assert.equal(serializeCanonicalJson(task), serializeCanonicalJson(expected));
  assert.deepEqual(task.timingBeat, {
    meaningId: "differentiated-value",
    startFrame: 3651,
    endFrame: 4212,
  });
});

test("differentiated-value plans bind inspiration-only versus-slam to a causal evidence boundary", async () => {
  const [
    task,
    visual,
    shots,
    anchors,
    sound,
    selection,
    fidelity,
    inventory,
    coverage,
    upstream,
  ] = await Promise.all([
    readJson(`${sceneRoot}/task-input.generated.json`).then(
      SceneTaskInputSchema.parse,
    ),
    readJson(`${sceneRoot}/visual-plan.json`).then(SceneVisualPlanSchema.parse),
    readJson(`${sceneRoot}/shot-plan.json`).then(ShotPlanSetSchema.parse),
    readJson(`${sceneRoot}/sync-anchors.json`).then(
      SceneSyncAnchorSetSchema.parse,
    ),
    readJson(`${sceneRoot}/sound-plan.json`).then(SceneSoundPlanSchema.parse),
    readJson(`${sceneRoot}/shot-recipe-selection.json`).then(
      ShotRecipeSelectionSchema.parse,
    ),
    readJson(`${sceneRoot}/generated/reference-fidelity.generated.json`).then(
      ReferenceFidelityReceiptSchema.parse,
    ),
    readInventory(),
    readCoverage(),
    readUpstreamFingerprint(),
  ]);
  validateScenePlanBundle({
    taskInputFingerprint: task.taskInputFingerprint,
    meaningId: "differentiated-value",
    sceneDurationInFrames: 561,
    allowedResourceIds: task.allowedResourceIds,
    visualPlan: visual,
    shotPlan: shots,
    syncAnchors: anchors,
    soundPlan: sound,
  });
  assert.equal(visual.recipeDecision, "inspiration-only");
  assert.match(visual.semanticObjective, /失效|identity/u);
  assert.doesNotMatch(
    serializeCanonicalJson(visual),
    /优于竞品|领先竞品|比.+更快|比.+更智能|客户证明|效果提升/u,
  );
  assert.equal(selection.selections.length, 1);
  const selected = selection.selections[0];
  assert.ok(selected && selected.mode === "inspiration-only");
  assert.equal(selected.cardId, "transition-hidden-cut");
  assert.equal(selected.styleKey, "versus-slam");
  assert.equal(selected.snapshotFingerprint, upstream);
  const item = inventory.items.find(
    (candidate) =>
      candidate.cardName === "transition-hidden-cut" &&
      candidate.styleKey === "versus-slam",
  );
  const coverageItem = coverage.items.find(
    (candidate) =>
      candidate.cardName === "transition-hidden-cut" &&
      candidate.styleKey === "versus-slam",
  );
  assert.ok(item && coverageItem);
  assert.equal(coverageItem.decision, "selected-inspiration");
  assert.equal(coverageItem.selection?.meaningId, "differentiated-value");
  assert.equal(
    selected.cardFingerprint,
    createFingerprint({
      namespace: "m9-shotcraft-card-provenance",
      version: 1,
      value: {
        inventoryFingerprint: inventory.inventoryFingerprint,
        sourceCommit: item.sourceCommit,
        libraryRevision: item.libraryRevision,
        cardName: item.cardName,
        cardPath: item.cardPath,
        cardChecksum: item.cardChecksum,
        recipeChecksum: item.recipeChecksum,
      },
    }),
  );
  assert.equal(
    selected.styleFingerprint,
    createFingerprint({
      namespace: "m9-shotcraft-style-provenance",
      version: 1,
      value: {
        coverageFingerprint: coverage.coverageFingerprint,
        cardName: item.cardName,
        styleKey: item.styleKey,
        styleDescription: item.styleDescription,
        previewChecksum: item.preview.checksum,
        decision: coverageItem.decision,
        selection: coverageItem.selection,
      },
    }),
  );
  assert.equal(fidelity.status, "not-applicable");
  if (fidelity.status === "not-applicable") {
    assert.equal(fidelity.reason, "inspiration-only");
  }
  assert.equal(fidelity.selectionFingerprint, selection.selectionFingerprint);
  assert.deepEqual(anchors.anchors, [
    {
      eventId: "evidence-invalidated",
      sceneLocalFrame: 280,
      purpose:
        "输入 identity 改变时 current evidence 与 stale evidence 在斜切边界撞合，旧证据同帧裂开并标为 invalidated。",
    },
  ]);
});

test("differentiated-value binds exactly the presealed Catalog PCM as one Scene-local cue", async () => {
  const [catalog, sound, selectedResources] = await Promise.all([
    readJson(
      "src/projects/product-comic-vertical/generated/resource-catalog.generated.json",
    ).then(ResourceCatalogSchema.parse),
    readJson(`${sceneRoot}/sound-plan.json`).then(SceneSoundPlanSchema.parse),
    readSelectedResourceInput(),
  ]);
  const entry = catalog.entries.find(
    ({ descriptor }) => descriptor.id === audioResourceId,
  );
  assert.ok(entry && entry.descriptor.kind === "asset");
  assert.equal(entry.descriptor.mediaRole, "scene-sfx");
  assert.equal(entry.descriptor.localPath, audioPath);
  assert.equal(entry.descriptor.checksum, await checksum(audioPath));
  assert.equal(selectedResources.length, 1);
  assert.equal(
    serializeCanonicalJson(selectedResources[0]?.descriptor),
    serializeCanonicalJson(entry.descriptor),
  );
  assert.equal(sound.ambience, null);
  assert.equal(sound.cues.length, 1);
  assert.deepEqual(sound.cues[0]?.timing, {
    kind: "anchor",
    eventId: "evidence-invalidated",
    offsetFrames: 0,
  });
  assert.equal(sound.cues[0]?.durationInFrames, 9);
  assert.equal(sound.cues[0]?.volume, 0.28);
});

test("differentiated-value ScenePackage has current identities and visual-only ownership", async () => {
  const scenePackage = ScenePackageSchema.parse(
    await readJson(`${sceneRoot}/generated/scene-package.generated.json`),
  );
  assert.equal(scenePackage.storyId, "product-comic-vertical");
  assert.equal(scenePackage.meaningId, "differentiated-value");
  assert.deepEqual(scenePackage.beatFrameRange, {
    startFrame: 3651,
    endFrame: 4212,
  });
  assert.equal(
    scenePackage.rendererBinding.rendererId,
    "product-comic-vertical-differentiated-value",
  );
  assert.equal(scenePackage.selectedResources.length, 1);
  assert.equal(scenePackage.selectedResources[0]?.role, "scene-sfx");
  assert.equal(scenePackage.selectedResources[0]?.resourceId, audioResourceId);
});

test("differentiated-value Renderer is frame-driven portrait-safe and excludes narration captions and sound", async () => {
  const [module, story, visualStyle, task, visualPlan, shots, syncAnchors] =
    await Promise.all([
      import(pathToFileURL(join(rootDir, sceneRoot, "Renderer.tsx")).href),
      readJson("src/projects/product-comic-vertical/story.json").then(
        StorySpecSchema.parse,
      ),
      readJson("src/projects/product-comic-vertical/visual-style.json").then(
        VisualStyleSpecSchema.parse,
      ),
      readJson(`${sceneRoot}/task-input.generated.json`).then(
        SceneTaskInputSchema.parse,
      ),
      readJson(`${sceneRoot}/visual-plan.json`).then(
        SceneVisualPlanSchema.parse,
      ),
      readJson(`${sceneRoot}/shot-plan.json`).then(ShotPlanSetSchema.parse),
      readJson(`${sceneRoot}/sync-anchors.json`).then(
        SceneSyncAnchorSetSchema.parse,
      ),
    ]);
  const storyBeat = story.beats.find(
    ({ meaningId }) => meaningId === "differentiated-value",
  );
  assert.ok(storyBeat);
  assert.equal(typeof module.default, "function");
  const baseProps = {
    storyId: "product-comic-vertical",
    meaningId: "differentiated-value",
    durationInFrames: 561,
    fps: 30,
    width: 1080,
    height: 1920,
    storyBeat,
    timingBeat: task.timingBeat,
    visualStyle,
    visualPlan,
    shots,
    syncAnchors,
    visualResources: [],
  } as const;
  const frames = [36, 176, 300, 500].map((sceneFrame) =>
    renderToStaticMarkup(
      createElement(module.default, { ...baseProps, sceneFrame }),
    ),
  );
  assert.equal(new Set(frames).size, 4);
  assert.match(frames[0] ?? "", /CURRENT EVIDENCE/u);
  assert.match(frames[1] ?? "", /OWNERSHIP/u);
  assert.match(frames[2] ?? "", /INVALIDATED/u);
  assert.match(frames[3] ?? "", /NO AGENT · NO NETWORK/u);
  assert.match(frames[3] ?? "", /TIME[\s\S]*FINGERPRINT/u);
  assert.match(frames[3] ?? "", /REFERENCE[\s\S]*CHECKSUM/u);
  assert.match(frames[3] ?? "", /APPROVAL[\s\S]*RECEIPT/u);
  assert.doesNotMatch(frames.join("\n"), /T-08|R-16|A-01/u);
  assert.doesNotMatch(frames.join("\n"), /<audio|<video|caption|subtitle/iu);
  assert.match(frames[3] ?? "", /data-character="producer"/u);
  assert.match(frames[3] ?? "", /data-character="checker"/u);
  assert.match(frames[3] ?? "", /data-exit-state="verified-vs-invalidated"/u);
});

test("differentiated-value source boundary excludes runtime Agent network Git scans and CSS animation", async () => {
  const [renderer, shot, authoring, root] = await Promise.all(
    [
      "Renderer.tsx",
      "shots/EvidenceBoundaryPanels.tsx",
      "authoring/Composition.tsx",
      "authoring/Root.tsx",
    ].map((repositoryPath) =>
      readFile(join(rootDir, sceneRoot, repositoryPath), "utf8"),
    ),
  );
  assert.doesNotMatch(
    renderer + shot,
    /fetch\s*\(|https?:\/\/|child_process|\.git|readdir|glob\s*\(|CaptionLayer|Narration|<Audio|<Video|\banimation\s*:|\btransition\s*:|\bMCP\b/u,
  );
  const authoredFontSizes = [...shot.matchAll(/fontSize:\s*(\d+)/gu)].map(
    (match) => Number(match[1]),
  );
  assert.ok(authoredFontSizes.length > 0);
  assert.ok(authoredFontSizes.every((fontSize) => fontSize >= 36));
  assert.match(authoring, /invalidation-crack\.wav/u);
  assert.match(authoring, /<Sequence from=\{280\} durationInFrames=\{9\}/u);
  assert.doesNotMatch(authoring, /narration|global-bgm|cross-scene/iu);
  assert.match(
    root,
    /id="ProductComicVertical-differentiated-value-Authoring"/u,
  );
});

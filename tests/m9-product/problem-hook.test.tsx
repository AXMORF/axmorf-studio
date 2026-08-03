import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {access, readFile} from "node:fs/promises";
import {join} from "node:path";
import test from "node:test";

import {renderToStaticMarkup} from "react-dom/server";

import {
  ReferenceFidelityReceiptSchema,
  RenderSpecSchema,
  ResourceDescriptorSchema,
  ResourceCatalogSchema,
  SelectedResourceRefSchema,
  ScenePackageSchema,
  SceneSoundPlanSchema,
  SceneSyncAnchorSetSchema,
  SceneTaskInputSchema,
  SceneVisualPlanSchema,
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
import Renderer from "../../src/projects/product-comic-vertical/scenes/problem-hook/Renderer";
import {
  validateCoverageDocument,
  validateInventoryDocument,
} from "../../scripts/m9-product/shotcraft-inventory";

const rootDir = process.cwd();
const sceneRoot =
  "src/projects/product-comic-vertical/scenes/problem-hook";
const audioPath =
  "public/projects/product-comic-vertical/scene-audio/problem-hook/identity-break-pulse.wav";
const audioResourceId =
  "asset.product-comic-vertical.scene.problem-hook.identity-break-pulse";

const requiredSceneFiles = [
  "Renderer.tsx",
  "shots/ProblemHookPanels.tsx",
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

test("problem-hook owns the fixed Renderer plan and ScenePackage file set", async () => {
  for (const repositoryPath of requiredSceneFiles) {
    await access(join(rootDir, sceneRoot, repositoryPath));
  }
});

test("problem-hook task input binds current Story timing style Catalog Shotcraft and continuity", async () => {
  const [story, render, timing, visualStyle, catalog, inventory, coverage, upstream] =
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
      ).then(ResourceCatalogSchema.parse),
      readInventory(),
      readCoverage(),
      readUpstreamFingerprint(),
    ]);
  const storyBeat = story.beats.find(
    ({meaningId}) => meaningId === "problem-hook",
  );
  const timingBeat = timing.storyBeats.find(
    ({meaningId}) => meaningId === "problem-hook",
  );
  const nextBeat = story.beats.find(
    ({meaningId}) => meaningId === "problem-friction",
  );
  const styleEntry = catalog.entries.find(
    ({descriptor}) => descriptor.id === "style.comic-anime",
  );
  const audioEntry = catalog.entries.find(
    ({descriptor}) => descriptor.id === audioResourceId,
  );
  assert.ok(storyBeat && timingBeat && nextBeat && styleEntry && audioEntry);
  const expected = buildSceneTaskInput({
    storyId: story.storyId,
    meaningId: "problem-hook",
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
        allowedCardIds: ["line-boil"],
      },
    ],
    allowedResourceIds: [audioResourceId],
    continuity: {
      previousMeaningId: null,
      previousSummary: null,
      nextMeaningId: nextBeat.meaningId,
      nextSummary: nextBeat.narrativePurpose,
      continuityBrief:
        "建立暖纸漫画、Producer 左侧输入、Checker 右侧机械证据与连续蓝色 identity thread；以 coral 断链结束输入变化，下一 Scene 继承 broken-by-drift 状态并展开具体制作摩擦。",
    },
    allowedDirectories: {
      sceneRoot,
      publicAssetRoot:
        "public/projects/product-comic-vertical/scenes/problem-hook",
    },
  });
  const task = SceneTaskInputSchema.parse(
    await readJson(`${sceneRoot}/task-input.generated.json`),
  );
  assert.equal(serializeCanonicalJson(task), serializeCanonicalJson(expected));
  assert.deepEqual(task.timingBeat, {
    meaningId: "problem-hook",
    startFrame: 15,
    endFrame: 580,
  });
  assert.equal(inventory.expected.cards, 104);
  assert.equal(inventory.expected.styles, 161);
  assert.equal(coverage.expected.previews, 161);
});

test("problem-hook plans are fail-closed and bind one inspiration-only line-boil provenance", async () => {
  const [task, visual, shots, anchors, sound, selection, fidelity, inventory, coverage, upstream] =
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
    meaningId: "problem-hook",
    sceneDurationInFrames: 565,
    allowedResourceIds: task.allowedResourceIds,
    visualPlan: visual,
    shotPlan: shots,
    syncAnchors: anchors,
    soundPlan: sound,
  });
  assert.equal(visual.recipeDecision, "inspiration-only");
  assert.equal(selection.selections.length, 1);
  const selected = selection.selections[0];
  assert.ok(selected && selected.mode === "inspiration-only");
  assert.equal(selected.cardId, "line-boil");
  assert.equal(selected.styleKey, "line-boil");
  assert.equal(selected.snapshotFingerprint, upstream);
  const item = inventory.items.find(
    (candidate) =>
      candidate.cardName === "line-boil" && candidate.styleKey === "line-boil",
  );
  const coverageItem = coverage.items.find(
    (candidate) =>
      candidate.cardName === "line-boil" && candidate.styleKey === "line-boil",
  );
  assert.ok(item && coverageItem);
  assert.equal(coverageItem.decision, "selected-inspiration");
  assert.ok(coverageItem.selection);
  assert.equal(coverageItem.selection.meaningId, "problem-hook");
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
      eventId: "identity-break",
      sceneLocalFrame: 314,
      purpose:
        "输入卡翻为 changed、蓝色 identity thread 在同帧断开并转为 coral stale 证据。",
    },
  ]);
});

test("problem-hook binds exactly the presealed Catalog PCM as one Scene-local cue", async () => {
  const [catalog, sound, selectedResources] = await Promise.all([
    readJson(
      "src/projects/product-comic-vertical/generated/resource-catalog.generated.json",
    ).then(ResourceCatalogSchema.parse),
    readJson(`${sceneRoot}/sound-plan.json`).then(SceneSoundPlanSchema.parse),
    readSelectedResourceInput(),
  ]);
  const entry = catalog.entries.find(
    ({descriptor}) => descriptor.id === audioResourceId,
  );
  assert.ok(entry && entry.descriptor.kind === "asset");
  assert.equal(entry.descriptor.mediaRole, "scene-sfx");
  assert.equal(entry.descriptor.localPath, audioPath);
  assert.equal(entry.descriptor.checksum, await checksum(audioPath));
  assert.equal(entry.descriptor.license.verificationStatus, "verified");
  assert.equal(selectedResources.length, 1);
  assert.equal(
    serializeCanonicalJson(selectedResources[0]?.descriptor),
    serializeCanonicalJson(entry.descriptor),
  );
  assert.equal(
    selectedResources[0]?.selected.descriptorFingerprint,
    entry.descriptorFingerprint,
  );
  assert.equal(sound.ambience, null);
  assert.equal(sound.cues.length, 1);
  assert.deepEqual(sound.cues[0]?.timing, {
    kind: "anchor",
    eventId: "identity-break",
    offsetFrames: 0,
  });
  assert.equal(sound.cues[0]?.durationInFrames, 11);
  assert.equal(sound.cues[0]?.volume, 0.3);
});

test("problem-hook ScenePackage has current identities and visual-only ownership", async () => {
  const scenePackage = ScenePackageSchema.parse(
    await readJson(`${sceneRoot}/generated/scene-package.generated.json`),
  );
  assert.equal(scenePackage.storyId, "product-comic-vertical");
  assert.equal(scenePackage.meaningId, "problem-hook");
  assert.deepEqual(scenePackage.beatFrameRange, {
    startFrame: 15,
    endFrame: 580,
  });
  assert.equal(
    scenePackage.rendererBinding.rendererId,
    "product-comic-vertical-problem-hook",
  );
  assert.equal(scenePackage.selectedResources.length, 1);
  assert.equal(scenePackage.selectedResources[0]?.role, "scene-sfx");
  assert.equal(
    scenePackage.selectedResources[0]?.resourceId,
    audioResourceId,
  );
});

test("problem-hook Renderer is frame-driven portrait-safe and excludes narration captions and sound", async () => {
  const [story, visualStyle, task, visualPlan, shots, syncAnchors] =
    await Promise.all([
      readJson("src/projects/product-comic-vertical/story.json").then(
        StorySpecSchema.parse,
      ),
      readJson("src/projects/product-comic-vertical/visual-style.json").then(
        VisualStyleSpecSchema.parse,
      ),
      readJson(`${sceneRoot}/task-input.generated.json`).then(
        SceneTaskInputSchema.parse,
      ),
      readJson(`${sceneRoot}/visual-plan.json`).then(SceneVisualPlanSchema.parse),
      readJson(`${sceneRoot}/shot-plan.json`).then(ShotPlanSetSchema.parse),
      readJson(`${sceneRoot}/sync-anchors.json`).then(
        SceneSyncAnchorSetSchema.parse,
      ),
    ]);
  const storyBeat = story.beats.find(
    ({meaningId}) => meaningId === "problem-hook",
  );
  assert.ok(storyBeat);
  const baseProps = {
    storyId: "product-comic-vertical",
    meaningId: "problem-hook",
    durationInFrames: 565,
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
  const frames = [30, 170, 340, 520].map((sceneFrame) =>
    renderToStaticMarkup(<Renderer {...baseProps} sceneFrame={sceneFrame} />),
  );
  assert.equal(new Set(frames).size, 4);
  assert.match(frames[0] ?? "", /完整视频生产/u);
  assert.match(frames[1] ?? "", /故事/u);
  assert.match(frames[2] ?? "", /INPUT CHANGED/u);
  assert.match(frames[3] ?? "", /守住作品身份/u);
  assert.doesNotMatch(frames.join("\n"), /<audio|<video|caption|subtitle/iu);
  assert.match(frames[3] ?? "", /data-character="producer"/u);
  assert.match(frames[3] ?? "", /data-character="checker"/u);
  assert.match(frames[3] ?? "", /top:1378px/u);
});

test("problem-hook source boundary excludes runtime network Git scans and CSS animation", async () => {
  const [renderer, shot, authoring, root] = await Promise.all(
    [
      "Renderer.tsx",
      "shots/ProblemHookPanels.tsx",
      "authoring/Composition.tsx",
      "authoring/Root.tsx",
    ].map((repositoryPath) =>
      readFile(join(rootDir, sceneRoot, repositoryPath), "utf8"),
    ),
  );
  assert.doesNotMatch(
    renderer + shot,
    /fetch\s*\(|https?:\/\/|child_process|\.git|readdir|glob\s*\(|CaptionLayer|Narration|<Audio|<Video|\banimation\s*:|\btransition\s*:/u,
  );
  const authoredFontSizes = [...shot.matchAll(/fontSize:\s*(\d+)/gu)].map(
    (match) => Number(match[1]),
  );
  assert.ok(authoredFontSizes.length > 0);
  assert.ok(authoredFontSizes.every((fontSize) => fontSize >= 36));
  assert.match(shot, /Math\.floor\([\s\S]*\/ 3/);
  assert.match(authoring, /identity-break-pulse\.wav/u);
  assert.match(authoring, /<Sequence from=\{314\} durationInFrames=\{11\}/u);
  assert.doesNotMatch(authoring, /narration|global-bgm|cross-scene/iu);
  assert.match(
    root,
    /id="ProductComicVertical-problem-hook-Authoring"/u,
  );
});

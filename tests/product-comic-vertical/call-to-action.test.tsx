import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
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
const sceneRoot = "src/projects/product-comic-vertical/scenes/call-to-action";
const audioPath =
  "public/projects/product-comic-vertical/scene-audio/call-to-action/process-start-chime.wav";
const audioResourceId =
  "asset.product-comic-vertical.scene.call-to-action.process-start-chime";

const requiredSceneFiles = [
  "Renderer.tsx",
  "shots/CallToActionPanels.tsx",
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

test("call-to-action owns the fixed Renderer plan and ScenePackage file set", async () => {
  for (const repositoryPath of requiredSceneFiles) {
    await access(join(rootDir, sceneRoot, repositoryPath));
  }
});

test("call-to-action task input binds the current sealed timing and final continuity", async () => {
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
    ({ meaningId }) => meaningId === "call-to-action",
  );
  const previousBeat = story.beats.find(
    ({ meaningId }) => meaningId === "proof-and-fit",
  );
  const timingBeat = timing.storyBeats.find(
    ({ meaningId }) => meaningId === "call-to-action",
  );
  const styleEntry = catalog.entries.find(
    ({ descriptor }) => descriptor.id === "style.comic-anime",
  );
  const audioEntry = catalog.entries.find(
    ({ descriptor }) => descriptor.id === audioResourceId,
  );
  assert.ok(
    storyBeat && previousBeat && timingBeat && styleEntry && audioEntry,
  );
  const expected = buildSceneTaskInput({
    storyId: story.storyId,
    meaningId: "call-to-action",
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
        allowedCardIds: ["marker-underline-title"],
      },
    ],
    allowedResourceIds: [audioResourceId],
    continuity: {
      previousMeaningId: previousBeat.meaningId,
      previousSummary: previousBeat.narrativePurpose,
      nextMeaningId: null,
      nextSummary: null,
      continuityBrief:
        "入口承接 proof-and-fit 的用户最终决定权；收束真实价值：视频不只是一次导出，而是可继续验证的作品；行动只说从一份主题资料开始，按可验证生产链完成第一支作品。出口形成安静稳定的蓝 identity thread 与 completed work handoff。",
    },
    allowedDirectories: {
      sceneRoot,
      publicAssetRoot:
        "public/projects/product-comic-vertical/scenes/call-to-action",
    },
  });
  const task = SceneTaskInputSchema.parse(
    await readJson(`${sceneRoot}/task-input.generated.json`),
  );
  assert.equal(serializeCanonicalJson(task), serializeCanonicalJson(expected));
  assert.deepEqual(task.timingBeat, {
    meaningId: "call-to-action",
    startFrame: 4703,
    endFrame: 5101,
  });
});

test("call-to-action plans bind the inspiration-only marker underline and current 398f window", async () => {
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
    meaningId: "call-to-action",
    sceneDurationInFrames: 398,
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
  assert.equal(selected.cardId, "marker-underline-title");
  assert.equal(selected.styleKey, "marker-underline-title");
  assert.equal(selected.snapshotFingerprint, upstream);
  const item = inventory.items.find(
    (candidate) =>
      candidate.cardName === "marker-underline-title" &&
      candidate.styleKey === "marker-underline-title",
  );
  const coverageItem = coverage.items.find(
    (candidate) =>
      candidate.cardName === "marker-underline-title" &&
      candidate.styleKey === "marker-underline-title",
  );
  assert.ok(item && coverageItem);
  assert.equal(coverageItem.decision, "selected-inspiration");
  assert.equal(coverageItem.selection?.meaningId, "call-to-action");
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
      eventId: "process-start",
      sceneLocalFrame: 182,
      purpose:
        "第二个已封存 narration chunk 开始时，一份主题资料进入可验证生产链并触发 Scene-local chime。",
    },
  ]);
});

test("call-to-action binds exactly the presealed process-start Scene cue", async () => {
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
    eventId: "process-start",
    offsetFrames: 0,
  });
  assert.equal(sound.cues[0]?.durationInFrames, 12);
  assert.equal(sound.cues[0]?.volume, 0.28);
});

test("call-to-action ScenePackage stays visual/local-sound only", async () => {
  const scenePackage = ScenePackageSchema.parse(
    await readJson(`${sceneRoot}/generated/scene-package.generated.json`),
  );
  assert.equal(scenePackage.storyId, "product-comic-vertical");
  assert.equal(scenePackage.meaningId, "call-to-action");
  assert.deepEqual(scenePackage.beatFrameRange, {
    startFrame: 4703,
    endFrame: 5101,
  });
  assert.equal(
    scenePackage.rendererBinding.rendererId,
    "product-comic-vertical-call-to-action",
  );
  assert.equal(scenePackage.selectedResources.length, 1);
  assert.equal(scenePackage.selectedResources[0]?.role, "scene-sfx");
  assert.equal(scenePackage.selectedResources[0]?.resourceId, audioResourceId);
});

test("call-to-action Renderer is frame-driven portrait-safe and ends on a completed work handoff", async () => {
  const [
    story,
    visualStyle,
    task,
    visualPlan,
    shots,
    syncAnchors,
    rendererModule,
  ] = await Promise.all([
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
    import("../../src/projects/product-comic-vertical/scenes/call-to-action/Renderer"),
  ]);
  const storyBeat = story.beats.find(
    ({ meaningId }) => meaningId === "call-to-action",
  );
  assert.ok(storyBeat);
  const baseProps = {
    storyId: "product-comic-vertical",
    meaningId: "call-to-action",
    durationInFrames: 398,
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
  const frames = [20, 130, 215, 365].map((sceneFrame) =>
    renderToStaticMarkup(
      createElement(rendererModule.default, { ...baseProps, sceneFrame }),
    ),
  );
  assert.equal(new Set(frames).size, 4);
  assert.match(frames[0] ?? "", /用户最终决定/u);
  assert.match(frames[1] ?? "", /可继续验证的作品/u);
  assert.match(frames[2] ?? "", /一份主题资料/u);
  assert.match(frames[3] ?? "", /第一支作品/u);
  assert.match(frames[3] ?? "", /COMPLETED WORK/u);
  assert.match(frames[3] ?? "", /data-character="producer"/u);
  assert.match(frames[3] ?? "", /data-character="checker"/u);
  assert.match(frames[3] ?? "", /top:1378px/u);
  assert.doesNotMatch(frames.join("\n"), /<audio|<video|caption|subtitle/iu);
});

test("call-to-action source excludes promotion claims runtime services and CSS animation", async () => {
  const [renderer, shot, authoring, root] = await Promise.all(
    [
      "Renderer.tsx",
      "shots/CallToActionPanels.tsx",
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
  assert.doesNotMatch(
    renderer + shot,
    /logo|官网|网站|remote|M10|用户增长|效率提升|成功率|客户案例/iu,
  );
  const authoredFontSizes = [...shot.matchAll(/fontSize:\s*(\d+)/gu)].map(
    (match) => Number(match[1]),
  );
  assert.ok(authoredFontSizes.length > 0);
  assert.ok(authoredFontSizes.every((fontSize) => fontSize >= 36));
  assert.match(shot, /markerUnderlineProgress/u);
  assert.match(authoring, /process-start-chime\.wav/u);
  assert.match(authoring, /<Sequence from=\{182\} durationInFrames=\{12\}/u);
  assert.doesNotMatch(authoring, /narration|global-bgm|cross-scene/iu);
  assert.match(root, /id="ProductComicVertical-call-to-action-Authoring"/u);
});

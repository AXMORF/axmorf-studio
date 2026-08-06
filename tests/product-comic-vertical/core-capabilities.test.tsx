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
const sceneRoot =
  "src/projects/product-comic-vertical/scenes/core-capabilities";
const audioPath =
  "public/projects/product-comic-vertical/scene-audio/core-capabilities/authority-stack-chime.wav";
const audioResourceId =
  "asset.product-comic-vertical.scene.core-capabilities.authority-stack-chime";

const requiredSceneFiles = [
  "Renderer.tsx",
  "shots/CapabilityCascade.tsx",
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
  const record = raw as Record<string, unknown>;
  assert.equal(
    record.schemaVersion,
    1,
    "core-capabilities selected resources must declare schemaVersion 1",
  );
  const selectedResources = record.selectedResources;
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

test("core-capabilities owns the fixed Renderer plan and ScenePackage file set", async () => {
  for (const repositoryPath of requiredSceneFiles) {
    await access(join(rootDir, sceneRoot, repositoryPath));
  }
});

test("core-capabilities task binds Story timing style Catalog Shotcraft and frozen continuity", async () => {
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
    ({ meaningId }) => meaningId === "core-capabilities",
  );
  const timingBeat = timing.storyBeats.find(
    ({ meaningId }) => meaningId === "core-capabilities",
  );
  const previousBeat = story.beats.find(
    ({ meaningId }) => meaningId === "product-reveal",
  );
  const nextBeat = story.beats.find(
    ({ meaningId }) => meaningId === "workflow-input",
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
    meaningId: "core-capabilities",
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
        allowedCardIds: ["canvas-materialize-moves"],
      },
    ],
    allowedResourceIds: [audioResourceId],
    continuity: {
      previousMeaningId: previousBeat.meaningId,
      previousSummary: previousBeat.narrativePurpose,
      nextMeaningId: nextBeat.meaningId,
      nextSummary: nextBeat.narrativePurpose,
      continuityBrief:
        "入口继承准确墨线闭合的证据绑定代码生产链与恢复的蓝色 identity thread；本 Scene 将四份规格、语义节奏创作的 ttsChunks、封存 PCM、累计整数 sample-frame 边界、ScenePackage 与最终装配的位置组织成可验证系统，但不抢讲后续 workflow；出口保留四份规格、PCM 与绝对帧组成的 current stack，交给 workflow-input 接收 RenderSpec 与 Story 输入。",
    },
    allowedDirectories: {
      sceneRoot,
      publicAssetRoot:
        "public/projects/product-comic-vertical/scenes/core-capabilities",
    },
  });
  const task = SceneTaskInputSchema.parse(
    await readJson(`${sceneRoot}/task-input.generated.json`),
  );
  assert.equal(serializeCanonicalJson(task), serializeCanonicalJson(expected));
  assert.deepEqual(task.timingBeat, {
    meaningId: "core-capabilities",
    startFrame: 1316,
    endFrame: 1816,
  });
});

test("core-capabilities plans bind fail-closed diagram-cascade inspiration provenance", async () => {
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
    meaningId: "core-capabilities",
    sceneDurationInFrames: 500,
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
  assert.equal(selected.cardId, "canvas-materialize-moves");
  assert.equal(selected.styleKey, "diagram-cascade");
  assert.equal(selected.snapshotFingerprint, upstream);
  const item = inventory.items.find(
    (candidate) =>
      candidate.cardName === "canvas-materialize-moves" &&
      candidate.styleKey === "diagram-cascade",
  );
  const coverageItem = coverage.items.find(
    (candidate) =>
      candidate.cardName === "canvas-materialize-moves" &&
      candidate.styleKey === "diagram-cascade",
  );
  assert.ok(item && coverageItem);
  assert.equal(coverageItem.decision, "selected-inspiration");
  assert.equal(coverageItem.selection?.meaningId, "core-capabilities");
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
      eventId: "four-specs-settled",
      sceneLocalFrame: 170,
      purpose:
        "VideoBrief、StorySpec、NarrationSpec 与 RenderSpec 四份规格完成逐层生成并稳定持有。",
    },
    {
      eventId: "semantic-chunks-linked",
      sceneLocalFrame: 248,
      purpose:
        "ttsChunks 作为按语义、语气与朗读节奏创作的单元接入系统，明确不按标点机械拆分。",
    },
    {
      eventId: "pcm-sealed",
      sceneLocalFrame: 324,
      purpose:
        "声音生成结果封存为唯一时间权威 PCM，蓝色 identity thread 在同帧接入累计采样边界。",
    },
    {
      eventId: "absolute-frames-derived",
      sceneLocalFrame: 398,
      purpose:
        "累计整数 sample-frame 边界推导出绝对帧，形成可复算的 timing stack。",
    },
    {
      eventId: "verified-stack-ready",
      sceneLocalFrame: 456,
      purpose:
        "四份规格、封存 PCM 与绝对帧保持 current，ScenePackage 和最终装配只显示其系统位置。",
    },
  ]);
});

test("core-capabilities binds exactly its presealed Catalog PCM as one Scene-local cue", async () => {
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
    eventId: "pcm-sealed",
    offsetFrames: 0,
  });
  assert.equal(sound.cues[0]?.durationInFrames, 13);
  assert.equal(sound.cues[0]?.volume, 0.28);
});

test("core-capabilities ScenePackage owns current visual and Scene-local sound identities", async () => {
  const scenePackage = ScenePackageSchema.parse(
    await readJson(`${sceneRoot}/generated/scene-package.generated.json`),
  );
  assert.equal(scenePackage.storyId, "product-comic-vertical");
  assert.equal(scenePackage.meaningId, "core-capabilities");
  assert.deepEqual(scenePackage.beatFrameRange, {
    startFrame: 1316,
    endFrame: 1816,
  });
  assert.equal(
    scenePackage.rendererBinding.rendererId,
    "product-comic-vertical-core-capabilities",
  );
  assert.equal(scenePackage.selectedResources.length, 1);
  assert.equal(scenePackage.selectedResources[0]?.role, "scene-sfx");
  assert.equal(scenePackage.selectedResources[0]?.resourceId, audioResourceId);
});

test("core-capabilities Renderer reveals a readable causal stack without media or captions", async () => {
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
      readJson(`${sceneRoot}/visual-plan.json`).then(
        SceneVisualPlanSchema.parse,
      ),
      readJson(`${sceneRoot}/shot-plan.json`).then(ShotPlanSetSchema.parse),
      readJson(`${sceneRoot}/sync-anchors.json`).then(
        SceneSyncAnchorSetSchema.parse,
      ),
    ]);
  const storyBeat = story.beats.find(
    ({ meaningId }) => meaningId === "core-capabilities",
  );
  assert.ok(storyBeat);
  const { default: Renderer } =
    await import("../../src/projects/product-comic-vertical/scenes/core-capabilities/Renderer");
  const baseProps = {
    storyId: "product-comic-vertical",
    meaningId: "core-capabilities",
    durationInFrames: 500,
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
  const frames = [24, 170, 260, 405, 472].map((sceneFrame) =>
    renderToStaticMarkup(createElement(Renderer, { ...baseProps, sceneFrame })),
  );
  assert.equal(new Set(frames).size, 5);
  assert.match(frames[0] ?? "", /可验证系统/u);
  assert.match(frames[1] ?? "", /VideoBrief/u);
  assert.match(frames[2] ?? "", /语义 · 语气 · 节奏/u);
  assert.match(frames[3] ?? "", /绝对帧/u);
  assert.match(frames[4] ?? "", /FINAL ASSEMBLY/u);
  assert.match(frames[4] ?? "", /data-character="producer"/u);
  assert.match(frames[4] ?? "", /data-character="checker"/u);
  assert.match(frames[4] ?? "", /data-safe-bottom="1470"/u);
  assert.doesNotMatch(frames.join("\n"), /<audio|<video|subtitle/iu);
});

test("core-capabilities source is frame-only local and authoring alone plays the frozen cue", async () => {
  const [renderer, shot, authoring, root] = await Promise.all(
    [
      "Renderer.tsx",
      "shots/CapabilityCascade.tsx",
      "authoring/Composition.tsx",
      "authoring/Root.tsx",
    ].map((repositoryPath) =>
      readFile(join(rootDir, sceneRoot, repositoryPath), "utf8"),
    ),
  );
  assert.doesNotMatch(
    renderer + shot,
    /fetch\s*\(|https?:\/\/|child_process|\.git|readdir|glob\s*\(|CaptionLayer|NarrationLayer|narration\.wav|\/narration\/|<Audio|<Video|\banimation\s*:|\btransition\s*:/u,
  );
  const authoredFontSizes = [...shot.matchAll(/fontSize:\s*(\d+)/gu)].map(
    (match) => Number(match[1]),
  );
  assert.ok(authoredFontSizes.length > 0);
  assert.ok(authoredFontSizes.every((fontSize) => fontSize >= 36));
  assert.match(shot, /interpolate\(/u);
  assert.match(shot, /spring\(/u);
  assert.match(authoring, /authority-stack-chime\.wav/u);
  assert.match(authoring, /<Sequence from=\{324\} durationInFrames=\{13\}/u);
  assert.doesNotMatch(authoring, /narration|global-bgm|cross-scene/iu);
  assert.match(root, /id="ProductComicVertical-core-capabilities-Authoring"/u);
});

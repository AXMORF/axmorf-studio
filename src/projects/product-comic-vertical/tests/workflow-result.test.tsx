import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

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
} from "../../../contracts";
import { derivePreFinalSceneCatalog } from "../../../../scripts/project-check/final-run";
import Renderer from "../scenes/workflow-result/Renderer";
import {
  validateCoverageDocument,
  validateInventoryDocument,
} from "../tools/verification/shotcraft-inventory";

const rootDir = process.cwd();
const sceneRoot = "src/projects/product-comic-vertical/scenes/workflow-result";
const audioPath =
  "public/projects/product-comic-vertical/scene-audio/workflow-result/evidence-stamp.wav";
const audioResourceId =
  "asset.product-comic-vertical.scene.workflow-result.evidence-stamp";

const requiredSceneFiles = [
  "Renderer.tsx",
  "shots/WorkflowResultPanels.tsx",
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

test("workflow-result owns the fixed Renderer plan and ScenePackage file set", async () => {
  for (const repositoryPath of requiredSceneFiles) {
    await access(join(rootDir, sceneRoot, repositoryPath));
  }
});

test("workflow-result task input binds current Story timing style Catalog Shotcraft and frozen continuity", async () => {
  const [
    story,
    render,
    timing,
    visualStyle,
    catalog,
    inventory,
    coverage,
    upstream,
  ] = await Promise.all([
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
    readInventory(),
    readCoverage(),
    readUpstreamFingerprint(),
  ]);
  const storyBeat = story.beats.find(
    ({ meaningId }) => meaningId === "workflow-result",
  );
  const timingBeat = timing.storyBeats.find(
    ({ meaningId }) => meaningId === "workflow-result",
  );
  const previousBeat = story.beats.find(
    ({ meaningId }) => meaningId === "workflow-create",
  );
  const nextBeat = story.beats.find(
    ({ meaningId }) => meaningId === "differentiated-value",
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
    meaningId: "workflow-result",
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
        allowedCardIds: ["brand-frame-snap"],
      },
    ],
    allowedResourceIds: [audioResourceId],
    continuity: {
      previousMeaningId: previousBeat.meaningId,
      previousSummary: previousBeat.narrativePurpose,
      nextMeaningId: nextBeat.meaningId,
      nextSummary: nextBeat.narrativePurpose,
      continuityBrief:
        "入口继承 sealed/static/evidence-bound creation chain；以纵向交付清单展示成片、媒体参数、完整解码与批量 review，并明确 GPS 已完成 M1–M8、五个 Scene、全局装配、用户批准和最终检查可复核。出口稳定为 current evidence stamp 与连续蓝色 evidence thread，交给 differentiated-value 解释 identity、invalidation 与 runtime boundary。",
    },
    allowedDirectories: {
      sceneRoot,
      publicAssetRoot:
        "public/projects/product-comic-vertical/scenes/workflow-result",
    },
  });
  const task = SceneTaskInputSchema.parse(
    await readJson(`${sceneRoot}/task-input.generated.json`),
  );
  assert.equal(serializeCanonicalJson(task), serializeCanonicalJson(expected));
  assert.deepEqual(task.timingBeat, {
    meaningId: "workflow-result",
    startFrame: 3103,
    endFrame: 3651,
  });
  assert.equal(inventory.expected.cards, 104);
  assert.equal(inventory.expected.styles, 161);
  assert.equal(coverage.expected.previews, 161);
});

test("workflow-result plans bind one inspiration-only frame-snap provenance and current stamp", async () => {
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
    meaningId: "workflow-result",
    sceneDurationInFrames: 548,
    allowedResourceIds: task.allowedResourceIds,
    visualPlan: visual,
    shotPlan: shots,
    syncAnchors: anchors,
    soundPlan: sound,
  });
  assert.equal(visual.recipeDecision, "inspiration-only");
  assert.deepEqual(anchors.anchors, [
    {
      eventId: "current-evidence-stamp",
      sceneLocalFrame: 356,
      purpose:
        "Checker 落下 current evidence stamp，蓝色外框和内部状态同帧切到 evidence-bound 完成态。",
    },
  ]);
  assert.equal(selection.selections.length, 1);
  const selected = selection.selections[0];
  assert.ok(selected && selected.mode === "inspiration-only");
  assert.equal(selected.cardId, "brand-frame-snap");
  assert.equal(selected.styleKey, "brand-frame-snap");
  assert.equal(selected.snapshotFingerprint, upstream);
  const item = inventory.items.find(
    (candidate) =>
      candidate.cardName === "brand-frame-snap" &&
      candidate.styleKey === "brand-frame-snap",
  );
  const coverageItem = coverage.items.find(
    (candidate) =>
      candidate.cardName === "brand-frame-snap" &&
      candidate.styleKey === "brand-frame-snap",
  );
  assert.ok(item && coverageItem);
  assert.equal(coverageItem.decision, "selected-inspiration");
  assert.equal(coverageItem.selection?.meaningId, "workflow-result");
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
});

test("workflow-result binds exactly the presealed Catalog PCM as one Scene-local cue", async () => {
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
    eventId: "current-evidence-stamp",
    offsetFrames: 0,
  });
  assert.equal(sound.cues[0]?.durationInFrames, 10);
  assert.equal(sound.cues[0]?.volume, 0.28);
});

test("workflow-result ScenePackage is current and visual ownership excludes top-level narrative", async () => {
  const scenePackage = ScenePackageSchema.parse(
    await readJson(`${sceneRoot}/generated/scene-package.generated.json`),
  );
  assert.equal(scenePackage.storyId, "product-comic-vertical");
  assert.equal(scenePackage.meaningId, "workflow-result");
  assert.deepEqual(scenePackage.beatFrameRange, {
    startFrame: 3103,
    endFrame: 3651,
  });
  assert.equal(
    scenePackage.rendererBinding.rendererId,
    "product-comic-vertical-workflow-result",
  );
  assert.equal(scenePackage.selectedResources.length, 1);
  assert.equal(scenePackage.selectedResources[0]?.role, "scene-sfx");
  assert.equal(scenePackage.selectedResources[0]?.resourceId, audioResourceId);
});

test("workflow-result Renderer is frame-driven portrait-safe and keeps the caption band clear", async () => {
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
    ({ meaningId }) => meaningId === "workflow-result",
  );
  assert.ok(storyBeat);
  const baseProps = {
    storyId: "product-comic-vertical",
    meaningId: "workflow-result",
    durationInFrames: 548,
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
  const frames = [24, 170, 300, 356, 510].map((sceneFrame) =>
    renderToStaticMarkup(<Renderer {...baseProps} sceneFrame={sceneFrame} />),
  );
  assert.equal(new Set(frames).size, 5);
  assert.match(frames[0] ?? "", /SEALED · STATIC · EVIDENCE-BOUND/u);
  assert.match(frames[1] ?? "", /FINAL PREVIEW/u);
  assert.match(frames[2] ?? "", /GPS 当前实证/u);
  assert.match(frames[3] ?? "", /CURRENT · EVIDENCE BOUND/u);
  assert.match(frames[4] ?? "", /data-scene-state="current-evidence-bound"/u);
  assert.match(frames[4] ?? "", /M1–M8 完成/u);
  assert.match(frames[4] ?? "", /5 SCENES/u);
  assert.match(frames[4] ?? "", /全局装配/u);
  assert.match(frames[4] ?? "", /用户批准/u);
  assert.match(frames[4] ?? "", /最终检查/u);
  assert.doesNotMatch(
    frames.join("\n"),
    /<audio|<video|CaptionLayer|subtitle/iu,
  );
  assert.match(frames[4] ?? "", /data-character="producer"/u);
  assert.match(frames[4] ?? "", /data-character="checker"/u);
  assert.match(frames[4] ?? "", /top:1366px/u);
  assert.doesNotMatch(frames.join("\n"), /logo|官网|brand identity/iu);

  const mobile = renderToStaticMarkup(
    <Renderer {...baseProps} width={360} height={640} sceneFrame={510} />,
  );
  assert.match(mobile, /scale\(0\.3333333333333333\)/u);
  assert.match(mobile, /CURRENT · EVIDENCE BOUND/u);
});

test("workflow-result source boundary excludes network Git scans runtime sound and CSS animation", async () => {
  const [renderer, shot, authoring, root] = await Promise.all(
    [
      "Renderer.tsx",
      "shots/WorkflowResultPanels.tsx",
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
  assert.match(shot, /sceneFrame >= 356/u);
  assert.match(shot, /data-frame-state/u);
  assert.match(
    shot,
    /data-continuity="identity-invalidation-runtime-boundary-next"/u,
  );
  assert.doesNotMatch(shot, /logo|官网/iu);
  assert.match(authoring, /evidence-stamp\.wav/u);
  assert.match(authoring, /<Sequence from=\{356\} durationInFrames=\{10\}/u);
  assert.doesNotMatch(authoring, /narration|global-bgm|cross-scene/iu);
  assert.match(root, /id="ProductComicVertical-workflow-result-Authoring"/u);
});

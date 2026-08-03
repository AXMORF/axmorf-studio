import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {access, readFile} from "node:fs/promises";
import {join} from "node:path";
import test from "node:test";

import {renderToStaticMarkup} from "react-dom/server";

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
import {
  validateCoverageDocument,
  validateInventoryDocument,
} from "../../scripts/m9-product/shotcraft-inventory";

const rootDir = process.cwd();
const sceneRoot = "src/projects/product-comic-vertical/scenes/proof-and-fit";
const audioPath =
  "public/projects/product-comic-vertical/scene-audio/proof-and-fit/handoff-confirm.wav";
const audioResourceId =
  "asset.product-comic-vertical.scene.proof-and-fit.handoff-confirm";

const files = [
  "Renderer.tsx",
  "shots/ProofAndFitPanels.tsx",
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
  const [raw, inventory] = await Promise.all([
    readJson(
      "src/projects/product-comic-vertical/references/video-shotcraft/shot-coverage.json",
    ),
    readInventory(),
  ]);
  return validateCoverageDocument(raw, inventory);
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

test("proof-and-fit owns one complete ScenePackage authoring surface", async () => {
  for (const file of files) await access(join(rootDir, sceneRoot, file));
});

test("proof-and-fit frozen task binds the 491-frame Beat and user-only approval handoff", async () => {
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
      ).then(ResourceCatalogSchema.parse),
      readUpstreamFingerprint(),
    ]);
  const storyBeat = story.beats.find(
    ({meaningId}) => meaningId === "proof-and-fit",
  );
  const timingBeat = timing.storyBeats.find(
    ({meaningId}) => meaningId === "proof-and-fit",
  );
  const previousBeat = story.beats.find(
    ({meaningId}) => meaningId === "differentiated-value",
  );
  const nextBeat = story.beats.find(
    ({meaningId}) => meaningId === "call-to-action",
  );
  const styleEntry = catalog.entries.find(
    ({descriptor}) => descriptor.id === "style.comic-anime",
  );
  assert.ok(storyBeat && timingBeat && previousBeat && nextBeat && styleEntry);
  const expected = buildSceneTaskInput({
    storyId: story.storyId,
    meaningId: "proof-and-fit",
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
        allowedCardIds: ["collab-cursor-moves"],
      },
    ],
    allowedResourceIds: [audioResourceId],
    continuity: {
      previousMeaningId: previousBeat.meaningId,
      previousSummary: previousBeat.narrativePurpose,
      nextMeaningId: nextBeat.meaningId,
      nextSummary: nextBeat.narrativePurpose,
      continuityBrief:
        "入口承接 verified-vs-invalidated 对照与 authoring-to-runtime boundary；把创作、工程和审查证据收进同一仓库，Producer 只负责创作、Checker 只负责机械校验，Scene 逐段制作；出口明确最终批准只由用户作出，并把决定权交给用户，供 call-to-action 从主题资料开始。",
    },
    allowedDirectories: {
      sceneRoot,
      publicAssetRoot:
        "public/projects/product-comic-vertical/scenes/proof-and-fit",
    },
  });
  const task = SceneTaskInputSchema.parse(
    await readJson(`${sceneRoot}/task-input.generated.json`),
  );
  assert.equal(serializeCanonicalJson(task), serializeCanonicalJson(expected));
  assert.deepEqual(task.timingBeat, {
    meaningId: "proof-and-fit",
    startFrame: 4212,
    endFrame: 4703,
  });
});

test("proof-and-fit plans bind dialogue-duet inspiration and one handoff cue", async () => {
  const [task, visual, shots, anchors, sound, selection, fidelity, catalog] =
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
      readJson(
        "src/projects/product-comic-vertical/generated/resource-catalog.generated.json",
      ).then(ResourceCatalogSchema.parse),
    ]);
  validateScenePlanBundle({
    taskInputFingerprint: task.taskInputFingerprint,
    meaningId: task.meaningId,
    sceneDurationInFrames: 491,
    allowedResourceIds: task.allowedResourceIds,
    visualPlan: visual,
    shotPlan: shots,
    syncAnchors: anchors,
    soundPlan: sound,
  });
  assert.equal(visual.recipeDecision, "inspiration-only");
  assert.match(
    visual.styleRealization.join("\n"),
    /Producer.*coral #f05b3d.*pencil tab.*Checker.*blue #3b78cc.*square lens\/checksum card/u,
  );
  const selected = selection.selections[0];
  assert.ok(selected && selected.mode === "inspiration-only");
  assert.equal(selected.cardId, "collab-cursor-moves");
  assert.equal(selected.styleKey, "dialogue-duet");
  assert.equal(fidelity.status, "not-applicable");
  if (fidelity.status === "not-applicable") {
    assert.equal(fidelity.reason, "inspiration-only");
  }
  assert.deepEqual(anchors.anchors, [
    {
      eventId: "user-handoff",
      sceneLocalFrame: 390,
      purpose:
        "Checker 把已校验证据交回用户决定，用户批准保持独立且不会被 Agent 或 Checker 自动代签。",
    },
  ]);
  const cue = sound.cues[0];
  assert.ok(cue);
  assert.deepEqual(cue.timing, {
    kind: "anchor",
    eventId: "user-handoff",
    offsetFrames: 0,
  });
  assert.equal(cue.durationInFrames, 11);
  const audioEntry = catalog.entries.find(
    ({descriptor}) => descriptor.id === audioResourceId,
  );
  assert.ok(audioEntry && audioEntry.descriptor.kind === "asset");
  assert.equal(audioEntry.descriptor.checksum, await checksum(audioPath));
});

test("proof-and-fit selection provenance matches the frozen 104-card 161-style inventory", async () => {
  const [selection, inventory, coverage, upstream] = await Promise.all([
    readJson(`${sceneRoot}/shot-recipe-selection.json`).then(
      ShotRecipeSelectionSchema.parse,
    ),
    readInventory(),
    readCoverage(),
    readUpstreamFingerprint(),
  ]);
  const selected = selection.selections[0];
  const item = inventory.items.find(
    (candidate) =>
      candidate.cardName === "collab-cursor-moves" &&
      candidate.styleKey === "dialogue-duet",
  );
  const coverageItem = coverage.items.find(
    (candidate) =>
      candidate.cardName === "collab-cursor-moves" &&
      candidate.styleKey === "dialogue-duet",
  );
  assert.ok(selected && item && coverageItem && coverageItem.selection);
  assert.equal(selected.snapshotFingerprint, upstream);
  assert.equal(coverageItem.decision, "selected-inspiration");
  assert.equal(coverageItem.selection.meaningId, "proof-and-fit");
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
});

test("proof-and-fit ScenePackage and selected resources keep visual and local-sound ownership separate", async () => {
  const [scenePackage, rawResources, catalog] = await Promise.all([
    readJson(`${sceneRoot}/generated/scene-package.generated.json`).then(
      ScenePackageSchema.parse,
    ),
    readJson(`${sceneRoot}/selected-resources.json`),
    readJson(
      "src/projects/product-comic-vertical/generated/resource-catalog.generated.json",
    ).then(ResourceCatalogSchema.parse),
  ]);
  assert.deepEqual(scenePackage.beatFrameRange, {
    startFrame: 4212,
    endFrame: 4703,
  });
  assert.equal(
    scenePackage.rendererBinding.rendererId,
    "product-comic-vertical-proof-and-fit",
  );
  assert.equal(scenePackage.selectedResources.length, 1);
  assert.equal(scenePackage.selectedResources[0]?.role, "scene-sfx");
  assert.ok(typeof rawResources === "object" && rawResources !== null);
  const entries = (rawResources as {selectedResources?: unknown[]})
    .selectedResources;
  assert.ok(Array.isArray(entries) && entries.length === 1);
  const record = entries[0] as {selected?: unknown; descriptor?: unknown};
  const selected = SelectedResourceRefSchema.parse(record.selected);
  const descriptor = ResourceDescriptorSchema.parse(record.descriptor);
  const current = catalog.entries.find(
    ({descriptor: candidate}) => candidate.id === audioResourceId,
  );
  assert.ok(current);
  assert.equal(serializeCanonicalJson(descriptor), serializeCanonicalJson(current.descriptor));
  assert.equal(selected.descriptorFingerprint, current.descriptorFingerprint);
});

test("proof-and-fit Renderer is frame-driven portrait-safe and never auto-approves", async () => {
  const [{default: Renderer}, story, visualStyle, task, visualPlan, shots, syncAnchors] =
    await Promise.all([
      import("../../src/projects/product-comic-vertical/scenes/proof-and-fit/Renderer"),
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
    ({meaningId}) => meaningId === "proof-and-fit",
  );
  assert.ok(storyBeat);
  const baseProps = {
    storyId: "product-comic-vertical",
    meaningId: "proof-and-fit",
    durationInFrames: 491,
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
  const frames = [40, 170, 310, 410, 475].map((sceneFrame) =>
    renderToStaticMarkup(<Renderer {...baseProps} sceneFrame={sceneFrame} />),
  );
  assert.equal(new Set(frames).size, 5);
  assert.match(frames[0] ?? "", /同一仓库/u);
  assert.match(frames[1] ?? "", /创作.*工程.*审查证据/u);
  assert.match(frames[2] ?? "", /Producer.*Checker/us);
  assert.match(
    frames[2] ?? "",
    /data-character="producer" data-palette="#f05b3d" data-accessory="coral-pencil-tab"/u,
  );
  assert.match(
    frames[2] ?? "",
    /data-character="checker" data-palette="#3b78cc" data-accessory="blue-square-lens-checksum-card"/u,
  );
  assert.match(frames[3] ?? "", /最终批准.*用户/u);
  assert.match(frames[4] ?? "", /从主题资料开始/u);
  assert.doesNotMatch(frames.join("\n"), /自动批准|已批准|approved|<audio|<video|caption|subtitle/iu);
  assert.doesNotMatch(frames.join("\n"), /#1d9b66|green|绿色/iu);
});

test("proof-and-fit source excludes captions network Git scans and CSS animation", async () => {
  const sources = await Promise.all(
    [
      "Renderer.tsx",
      "shots/ProofAndFitPanels.tsx",
      "authoring/Composition.tsx",
      "authoring/Root.tsx",
    ].map((file) => readFile(join(rootDir, sceneRoot, file), "utf8")),
  );
  const [renderer, shot, authoring, root] = sources;
  assert.doesNotMatch(
    renderer + shot,
    /fetch\s*\(|https?:\/\/|child_process|\.git|readdir|glob\s*\(|CaptionLayer|Narration|<Audio|<Video|\banimation\s*:|\btransition\s*:/u,
  );
  const fontSizes = [...shot.matchAll(/fontSize:\s*(\d+)/gu)].map((match) =>
    Number(match[1]),
  );
  assert.ok(fontSizes.length > 0 && fontSizes.every((size) => size >= 36));
  assert.match(shot, /sceneFrame/u);
  assert.doesNotMatch(shot, /#1d9b66|COLORS\.green|绿色角色/iu);
  assert.match(shot, /top:\s*1370/u);
  assert.match(authoring, /handoff-confirm\.wav/u);
  assert.match(authoring, /<Sequence from=\{390\} durationInFrames=\{11\}/u);
  assert.doesNotMatch(authoring, /narration|global-bgm|cross-scene/iu);
  assert.match(root, /id="ProductComicVertical-proof-and-fit-Authoring"/u);
});

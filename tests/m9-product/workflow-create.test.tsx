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
import Renderer from "../../src/projects/product-comic-vertical/scenes/workflow-create/Renderer";
import {
  validateCoverageDocument,
  validateInventoryDocument,
} from "../../scripts/m9-product/shotcraft-inventory";

const rootDir = process.cwd();
const sceneRoot =
  "src/projects/product-comic-vertical/scenes/workflow-create";
const audioPath =
  "public/projects/product-comic-vertical/scene-audio/workflow-create/seal-lock-pulse.wav";
const audioResourceId =
  "asset.product-comic-vertical.scene.workflow-create.seal-lock-pulse";

const requiredSceneFiles = [
  "Renderer.tsx",
  "shots/WorkflowCreationChain.tsx",
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

test("workflow-create owns the fixed Renderer plan and ScenePackage file set", async () => {
  for (const repositoryPath of requiredSceneFiles) {
    await access(join(rootDir, sceneRoot, repositoryPath));
  }
});

test("workflow-create task input binds the frozen Beat window and continuity", async () => {
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
    ({meaningId}) => meaningId === "workflow-create",
  );
  const timingBeat = timing.storyBeats.find(
    ({meaningId}) => meaningId === "workflow-create",
  );
  const previousBeat = story.beats.find(
    ({meaningId}) => meaningId === "workflow-input",
  );
  const nextBeat = story.beats.find(
    ({meaningId}) => meaningId === "workflow-result",
  );
  const styleEntry = catalog.entries.find(
    ({descriptor}) => descriptor.id === "style.comic-anime",
  );
  const audioEntry = catalog.entries.find(
    ({descriptor}) => descriptor.id === audioResourceId,
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
    meaningId: "workflow-create",
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
        allowedCardIds: ["timeline-travel"],
      },
    ],
    allowedResourceIds: [audioResourceId],
    continuity: {
      previousMeaningId: previousBeat.meaningId,
      previousSummary: previousBeat.narrativePurpose,
      nextMeaningId: nextBeat.meaningId,
      nextSummary: nextBeat.narrativePurpose,
      continuityBrief:
        "入口接收 workflow-input 已核验的 input packet；依次呈现 VoxCPM 分块候选到选中 PCM、实测采样数与 checksum 封存，外部参考到冻结来源、准确 demo、依赖闭包与 license 绑定，再到 Renderer 静态 registry 绑定 Scene 且不改旁白、不吞帧；出口保持 sealed、static、evidence-bound creation chain，供 workflow-result 汇总媒体与 review。",
    },
    allowedDirectories: {
      sceneRoot,
      publicAssetRoot:
        "public/projects/product-comic-vertical/scenes/workflow-create",
    },
  });
  const task = SceneTaskInputSchema.parse(
    await readJson(`${sceneRoot}/task-input.generated.json`),
  );
  assert.equal(serializeCanonicalJson(task), serializeCanonicalJson(expected));
  assert.deepEqual(task.timingBeat, {
    meaningId: "workflow-create",
    startFrame: 2373,
    endFrame: 3103,
  });
});

test("workflow-create plans bind one inspiration-only timeline-travel provenance", async () => {
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
    meaningId: "workflow-create",
    sceneDurationInFrames: 730,
    allowedResourceIds: task.allowedResourceIds,
    visualPlan: visual,
    shotPlan: shots,
    syncAnchors: anchors,
    soundPlan: sound,
  });
  assert.equal(visual.recipeDecision, "inspiration-only");
  const selected = selection.selections[0];
  assert.ok(selected && selected.mode === "inspiration-only");
  assert.equal(selection.selections.length, 1);
  assert.equal(selected.cardId, "timeline-travel");
  assert.equal(selected.styleKey, "timeline-travel");
  assert.equal(selected.snapshotFingerprint, upstream);
  const item = inventory.items.find(
    (candidate) =>
      candidate.cardName === "timeline-travel" &&
      candidate.styleKey === "timeline-travel",
  );
  const coverageItem = coverage.items.find(
    (candidate) =>
      candidate.cardName === "timeline-travel" &&
      candidate.styleKey === "timeline-travel",
  );
  assert.ok(item && coverageItem?.selection);
  assert.equal(coverageItem.decision, "selected-inspiration");
  assert.equal(coverageItem.selection.meaningId, "workflow-create");
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
      eventId: "creation-chain-sealed",
      sceneLocalFrame: 590,
      purpose:
        "PCM、参考闭包与静态 Renderer 绑定在同一证据链中锁定为 sealed/static/evidence-bound。",
    },
  ]);
});

test("workflow-create binds exactly the presealed Catalog PCM as one Scene-local cue", async () => {
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
    eventId: "creation-chain-sealed",
    offsetFrames: 0,
  });
  assert.equal(sound.cues[0]?.durationInFrames, 11);
  assert.equal(sound.cues[0]?.volume, 0.3);
});

test("workflow-create ScenePackage stays within its fixed visual/local-sound ownership", async () => {
  const scenePackage = ScenePackageSchema.parse(
    await readJson(`${sceneRoot}/generated/scene-package.generated.json`),
  );
  assert.equal(scenePackage.storyId, "product-comic-vertical");
  assert.equal(scenePackage.meaningId, "workflow-create");
  assert.deepEqual(scenePackage.beatFrameRange, {
    startFrame: 2373,
    endFrame: 3103,
  });
  assert.equal(
    scenePackage.rendererBinding.rendererId,
    "product-comic-vertical-workflow-create",
  );
  assert.deepEqual(
    scenePackage.selectedResources.map(({resourceId, role}) => ({
      resourceId,
      role,
    })),
    [{resourceId: audioResourceId, role: "scene-sfx"}],
  );
});

test("workflow-create Renderer tells the implemented creation chain and remains visual-only", async () => {
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
    ({meaningId}) => meaningId === "workflow-create",
  );
  assert.ok(storyBeat);
  const baseProps = {
    storyId: "product-comic-vertical",
    meaningId: "workflow-create",
    durationInFrames: 730,
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
  const frames = [40, 210, 390, 620, 700].map((sceneFrame) =>
    renderToStaticMarkup(<Renderer {...baseProps} sceneFrame={sceneFrame} />),
  );
  assert.equal(new Set(frames).size, frames.length);
  assert.match(frames[0] ?? "", /VERIFIED INPUT/u);
  assert.match(frames[1] ?? "", /实测采样数/u);
  assert.match(frames[2] ?? "", /依赖闭包/u);
  assert.match(frames[3] ?? "", /STATIC REGISTRY/u);
  assert.match(frames[4] ?? "", /EVIDENCE-BOUND/u);
  assert.match(frames[4] ?? "", /data-chain-state="sealed-static-evidence-bound"/u);
  assert.doesNotMatch(frames.join("\n"), /<audio|<video|caption|subtitle/iu);
  assert.match(frames[4] ?? "", /data-character="producer"/u);
  assert.match(frames[4] ?? "", /data-character="checker"/u);
});

test("workflow-create source excludes render-time integrations and CSS animation", async () => {
  const [renderer, shot, authoring, root] = await Promise.all(
    [
      "Renderer.tsx",
      "shots/WorkflowCreationChain.tsx",
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
  assert.match(shot, /interpolate\(/u);
  assert.match(shot, /spring\(/u);
  assert.match(authoring, /seal-lock-pulse\.wav/u);
  assert.match(
    authoring,
    /<Sequence from=\{590\} durationInFrames=\{11\}/u,
  );
  assert.doesNotMatch(authoring, /narration|global-bgm|cross-scene/iu);
  assert.match(
    root,
    /id="ProductComicVertical-workflow-create-Authoring"/u,
  );
});

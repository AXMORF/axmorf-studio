import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import test from "node:test";

import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";

import {
  ReferenceFidelityReceiptSchema,
  ResourceCatalogSchema,
  ScenePackageSchema,
  SceneSoundPlanSchema,
  SceneSyncAnchorSetSchema,
  SceneTaskInputSchema,
  SceneVisualPlanSchema,
  SelectedResourceRefSchema,
  ShotPlanSetSchema,
  ShotRecipeSelectionSchema,
  VisualStyleSpecSchema,
  computeSceneTaskInputFingerprint,
  computeShotRecipeSelectionFingerprint,
  computeVisualStyleFingerprint,
  createFingerprint,
} from "../../src/contracts";
import {computeRenderSpecFingerprint} from "../../src/contracts/auto-check";
import {computeStoryFingerprint} from "../../src/contracts/generation-input";
import {RenderSpecSchema} from "../../src/contracts/render";
import {StorySpecSchema} from "../../src/contracts/story";
import Renderer from "../../src/projects/product-comic-vertical/scenes/workflow-input/Renderer";

const root = new URL("../../", import.meta.url);
const sceneRoot = new URL(
  "src/projects/product-comic-vertical/scenes/workflow-input/",
  root,
);
const readJson = async (relativePath: string) =>
  JSON.parse(await readFile(new URL(relativePath, root), "utf8")) as unknown;
const readSceneJson = async (relativePath: string) =>
  JSON.parse(await readFile(new URL(relativePath, sceneRoot), "utf8")) as unknown;
const sha256 = (bytes: Uint8Array) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

const loadFrozen = async () => {
  const story = StorySpecSchema.parse(
    await readJson("src/projects/product-comic-vertical/story.json"),
  );
  const render = RenderSpecSchema.parse(
    await readJson("src/projects/product-comic-vertical/render.json"),
  );
  const timing = (await readJson(
    "src/projects/product-comic-vertical/generated/semantic-timing.generated.json",
  )) as {
    readonly fingerprint: string;
    readonly storyBeats: readonly {
      readonly meaningId: string;
      readonly startFrame: number;
      readonly endFrame: number;
    }[];
  };
  const visualStyle = VisualStyleSpecSchema.parse(
    await readJson("src/projects/product-comic-vertical/visual-style.json"),
  );
  const catalog = ResourceCatalogSchema.parse(
    await readJson(
      "src/projects/product-comic-vertical/generated/resource-catalog.generated.json",
    ),
  );
  const inventory = (await readJson(
    "src/projects/product-comic-vertical/references/video-shotcraft/shot-inventory.generated.json",
  )) as {
    readonly inventoryFingerprint: string;
    readonly items: readonly Record<string, unknown>[];
  };
  const coverage = (await readJson(
    "src/projects/product-comic-vertical/references/video-shotcraft/shot-coverage.json",
  )) as {
    readonly coverageFingerprint: string;
    readonly items: readonly {
      readonly cardName: string;
      readonly styleKey: string;
      readonly decision: string;
      readonly reason: string;
      readonly selection: {readonly meaningId: string} | null;
    }[];
  };
  const upstream = (await readJson(
    "src/projects/product-comic-vertical/references/video-shotcraft/upstream-receipt.generated.json",
  )) as {readonly receiptFingerprint: string};
  return {story, render, timing, visualStyle, catalog, inventory, coverage, upstream};
};

test("workflow-input freezes the Story/timing/style/Catalog/continuity task identity", async () => {
  const {story, render, timing, visualStyle, catalog, upstream} =
    await loadFrozen();
  const task = SceneTaskInputSchema.parse(
    await readSceneJson("task-input.generated.json"),
  );
  const beat = story.beats.find(({meaningId}) => meaningId === "workflow-input");
  const timingBeat = timing.storyBeats.find(
    ({meaningId}) => meaningId === "workflow-input",
  );
  const styleEntry = catalog.entries.find(
    ({descriptor}) =>
      descriptor.kind === "style-profile" &&
      descriptor.styleProfileId === visualStyle.styleProfileId,
  );
  assert.ok(beat);
  assert.ok(timingBeat);
  assert.ok(styleEntry);
  assert.deepEqual(task.storyBeat, beat);
  assert.deepEqual(task.timingBeat, {
    meaningId: "workflow-input",
    startFrame: 1816,
    endFrame: 2373,
  });
  assert.equal(task.storyFingerprint, computeStoryFingerprint(story));
  assert.equal(task.semanticTimingFingerprint, timing.fingerprint);
  assert.equal(task.renderFingerprint, computeRenderSpecFingerprint(render));
  assert.equal(
    task.visualStyleFingerprint,
    computeVisualStyleFingerprint({
      visualStyle,
      resolvedStyleDescriptorFingerprint: styleEntry.descriptorFingerprint,
    }),
  );
  assert.equal(task.resourceCatalogFingerprint, catalog.catalogFingerprint);
  assert.deepEqual(task.allowedSnapshots, [
    {
      sourceId: "video-shotcraft",
      snapshotFingerprint: upstream.receiptFingerprint,
      allowedCardIds: ["document-typewriter-reveal"],
    },
  ]);
  assert.match(task.continuity.continuityBrief, /四份规格.*PCM.*绝对帧/u);
  assert.match(task.continuity.continuityBrief, /verified input packet/u);
  assert.equal(
    task.taskInputFingerprint,
    computeSceneTaskInputFingerprint(task),
  );
});

test("workflow-input binds the frozen inspiration-only provenance and one approved PCM cue", async () => {
  const {inventory, coverage, upstream} = await loadFrozen();
  const task = SceneTaskInputSchema.parse(
    await readSceneJson("task-input.generated.json"),
  );
  const selection = ShotRecipeSelectionSchema.parse(
    await readSceneJson("shot-recipe-selection.json"),
  );
  const selectedCoverage = coverage.items.find(
    (item) => item.selection?.meaningId === "workflow-input",
  );
  const inventoryRow = inventory.items.find(
    (item) =>
      item.cardName === "document-typewriter-reveal" &&
      item.styleKey === "document-typewriter-reveal",
  );
  assert.ok(selectedCoverage);
  assert.ok(inventoryRow);
  assert.equal(selectedCoverage.decision, "selected-inspiration");
  assert.equal(selection.selections.length, 1);
  assert.deepEqual(selection.selections[0], {
    mode: "inspiration-only",
    sourceId: "video-shotcraft",
    snapshotFingerprint: upstream.receiptFingerprint,
    cardId: "document-typewriter-reveal",
    styleKey: "document-typewriter-reveal",
    cardFingerprint: inventoryRow.cardChecksum,
    styleFingerprint: createFingerprint({
      namespace: "m9-shotcraft-inspiration-style",
      version: 1,
      value: {
        inventoryFingerprint: inventory.inventoryFingerprint,
        coverageFingerprint: coverage.coverageFingerprint,
        cardName: inventoryRow.cardName,
        styleKey: inventoryRow.styleKey,
        styleDescription: inventoryRow.styleDescription,
        recipeChecksum: inventoryRow.recipeChecksum,
        previewChecksum: (inventoryRow.preview as {readonly checksum: string})
          .checksum,
      },
    }),
    selectionReason: selectedCoverage.reason,
  });
  assert.equal(
    selection.selectionFingerprint,
    computeShotRecipeSelectionFingerprint(selection),
  );
  assert.equal(selection.taskInputFingerprint, task.taskInputFingerprint);

  const resourcesFile = (await readSceneJson("selected-resources.json")) as {
    readonly selectedResources: readonly {
      readonly selected: unknown;
      readonly descriptor: {readonly id: string; readonly checksum?: string};
    }[];
  };
  const cuePair = resourcesFile.selectedResources.find(
    ({descriptor}) =>
      descriptor.id ===
      "asset.product-comic-vertical.scene.workflow-input.source-check-tick",
  );
  assert.ok(cuePair);
  const selectedCue = SelectedResourceRefSchema.parse(cuePair.selected);
  assert.equal(selectedCue.role, "scene-sfx");
  const cueBytes = await readFile(
    new URL(
      "public/projects/product-comic-vertical/scene-audio/workflow-input/source-check-tick.wav",
      root,
    ),
  );
  assert.equal(
    sha256(new Uint8Array(cueBytes)),
    cuePair.descriptor.checksum,
  );
});

test("workflow-input plans one local Shot, stays visual-only, and packages the fixed 557-frame Beat", async () => {
  const task = SceneTaskInputSchema.parse(
    await readSceneJson("task-input.generated.json"),
  );
  const visualPlan = SceneVisualPlanSchema.parse(
    await readSceneJson("visual-plan.json"),
  );
  const shotPlan = ShotPlanSetSchema.parse(
    await readSceneJson("shot-plan.json"),
  );
  const anchors = SceneSyncAnchorSetSchema.parse(
    await readSceneJson("sync-anchors.json"),
  );
  const soundPlan = SceneSoundPlanSchema.parse(
    await readSceneJson("sound-plan.json"),
  );
  const fidelity = ReferenceFidelityReceiptSchema.parse(
    await readSceneJson("generated/reference-fidelity.generated.json"),
  );
  const scenePackage = ScenePackageSchema.parse(
    await readSceneJson("generated/scene-package.generated.json"),
  );
  assert.equal(shotPlan.sceneDurationInFrames, 557);
  assert.equal(anchors.sceneDurationInFrames, 557);
  assert.equal(soundPlan.sceneDurationInFrames, 557);
  assert.deepEqual(visualPlan.orderedShotIds, ["verified-input-packet"]);
  assert.deepEqual(
    shotPlan.shots.map(({shotId}) => shotId),
    ["verified-input-packet"],
  );
  assert.equal(visualPlan.recipeDecision, "inspiration-only");
  assert.equal(fidelity.status, "not-applicable");
  assert.equal(fidelity.reason, "inspiration-only");
  assert.equal(scenePackage.beatFrameRange.startFrame, 1816);
  assert.equal(scenePackage.beatFrameRange.endFrame, 2373);
  assert.equal(
    scenePackage.rendererBinding.rendererId,
    "product-comic-vertical-workflow-input",
  );
  assert.equal(scenePackage.taskInputFingerprint, task.taskInputFingerprint);
  assert.equal(soundPlan.cues.length, 1);
  assert.equal(soundPlan.cues[0]?.timing.kind, "anchor");

  const rendererSource = await readFile(new URL("Renderer.tsx", sceneRoot), "utf8");
  const shotSource = await readFile(
    new URL("shots/VerifiedInputPacketShot.tsx", sceneRoot),
    "utf8",
  );
  assert.match(rendererSource, /VerifiedInputPacketShot/u);
  assert.doesNotMatch(rendererSource, /(?:CaptionLayer|<Audio|staticFile\(|fetch\(|https?:\/\/|animation\s*:|transition\s*:)/u);
  assert.doesNotMatch(shotSource, /(?:fetch\(|https?:\/\/|animation\s*:|transition\s*:)/u);

  for (const sceneFrame of [0, 278, 556]) {
    const markup = renderToStaticMarkup(
      createElement(Renderer, {
        meaningId: task.meaningId,
        sceneFrame,
        durationInFrames: 557,
      }),
    );
    assert.match(markup, /data-scene="workflow-input"/u);
    assert.match(markup, /data-shot="verified-input-packet"/u);
    assert.match(markup, /PRODUCER/u);
    assert.match(markup, /CHECKER/u);
  }
});

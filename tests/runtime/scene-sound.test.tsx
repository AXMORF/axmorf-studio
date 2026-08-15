import assert from "node:assert/strict";
import { Children, isValidElement, type ReactNode } from "react";
import test from "node:test";
import { Html5Audio, Sequence } from "remotion";

import {
  Sha256DigestSchema,
  buildNotApplicableFidelityReceipt,
  buildSceneSoundPlan,
  buildSceneSyncAnchors,
  buildSceneTaskInputV5,
  buildSceneVisualPlan,
  buildShotPlanSet,
  buildShotRecipeSelection,
  buildSilentScenePreset,
  computeScenePackageFingerprint,
} from "../../src/contracts";
import { SceneSoundContribution } from "../../src/remotion/runtime/scene-sound/SceneSoundContribution";
import { resolveSceneSound } from "../../src/remotion/runtime/scene-sound/resolve-scene-sound";
import { buildScenePackage } from "../../scripts/scene-package/domain";
import { createM6PackageInput } from "../fixtures/scene/m6-package-input";
import { createSoundRuntimeFixture } from "../fixtures/scene/m6-sound-runtime";
import { sha } from "../fixtures/scene/m6-scene-input";

test("Scene sound resolves current selected local audio and exact anchor ranges", () => {
  const fixture = createSoundRuntimeFixture();
  assert.deepEqual(fixture.projection.contributions, [
    {
      contributionId: "pulse",
      kind: "cue",
      resourceId: "asset.proof-sfx",
      publicPath: fixture.descriptor.localPath,
      checksum: fixture.descriptor.checksum,
      startFrame: 56,
      endFrame: 68,
      volume: 0.5,
    },
  ]);
  for (const descriptor of [
    { ...fixture.descriptor, checksum: sha("0") },
    {
      ...fixture.descriptor,
      status: "blocked",
      allowedUse: "blocked",
    },
    { ...fixture.descriptor, mediaRole: "global-bgm" },
  ]) {
    assert.throws(() =>
      resolveSceneSound({
        scenePackage: fixture.scenePackage,
        soundPlan: fixture.sound,
        syncAnchors: fixture.anchors,
        resources: [{ selected: fixture.selected, descriptor }],
      }),
    );
  }
});

test("Scene sound never clamps cue ranges and empty plans mount no audio", () => {
  const fixture = createSoundRuntimeFixture();
  const invalidSound = buildSceneSoundPlan({
    ...fixture.sound,
    cues: [
      {
        ...fixture.sound.cues[0],
        timing: { kind: "explicit", sceneLocalFrame: 115 },
        durationInFrames: 10,
      },
    ],
  });
  assert.throws(() =>
    resolveSceneSound({
      scenePackage: fixture.scenePackage,
      soundPlan: invalidSound,
      syncAnchors: fixture.anchors,
      resources: [
        { selected: fixture.selected, descriptor: fixture.descriptor },
      ],
    }),
  );
  const emptyPackage = buildScenePackage(createM6PackageInput());
  const emptyInput = createM6PackageInput();
  const empty = resolveSceneSound({
    scenePackage: emptyPackage,
    soundPlan: emptyInput.sound,
    syncAnchors: emptyInput.anchors,
    resources: [],
  });
  assert.equal(SceneSoundContribution({ projection: empty }), null);
});

test("SceneSoundContribution mounts only fixed local Html5Audio Sequences", () => {
  const { projection } = createSoundRuntimeFixture();
  const element = SceneSoundContribution({ projection });
  assert.ok(isValidElement<{ children?: ReactNode }>(element));
  const children = Children.toArray(element.props.children);
  assert.equal(children.length, 1);
  const sequence = children[0];
  assert.ok(
    isValidElement<{
      from: number;
      durationInFrames: number;
      children?: ReactNode;
    }>(sequence),
  );
  assert.equal(sequence.type, Sequence);
  assert.equal(sequence.props.from, 76);
  assert.equal(sequence.props.durationInFrames, 12);
  assert.ok(isValidElement(sequence.props.children));
  assert.equal(sequence.props.children.type, Html5Audio);
});

test("silent intro uses the ordinary ScenePackage and Scene sound projection", () => {
  const fixture = createSoundRuntimeFixture();
  const preset = buildSilentScenePreset({
    sceneRole: "intro",
    presetId: "proof-intro-v1",
    durationInFrames: 120,
    visualIntent: "Render the proof shape as the intro visual.",
    soundIntent: "Play the proof pulse as the intro local cue.",
    resourceIds: ["asset.proof-sfx", "asset.proof-shape"],
    implementation: { kind: "scene-owner" },
  });
  const { taskInputFingerprint: _oldTaskFingerprint, ...taskBase } =
    fixture.task;
  void _oldTaskFingerprint;
  const task = buildSceneTaskInputV5({
    ...taskBase,
    storyBeat: {
      kind: "silent-scene",
      sceneRole: "intro",
      meaningId: taskBase.meaningId,
      narrativePurpose: "Open with an ordinary fixed-duration Scene.",
      preset,
    },
    timingBeat: {
      kind: "silent-scene",
      sceneRole: "intro",
      presetFingerprint: preset.presetFingerprint,
      presetDurationInFrames: preset.durationInFrames,
      meaningId: taskBase.meaningId,
      startFrame: 20,
      endFrame: 140,
    },
    allowedResourceIds: preset.resourceIds,
  });
  const anchors = buildSceneSyncAnchors({
    ...fixture.anchors,
    taskInputFingerprint: task.taskInputFingerprint,
  });
  const shots = buildShotPlanSet({
    ...fixture.shots,
    taskInputFingerprint: task.taskInputFingerprint,
  });
  const visual = buildSceneVisualPlan({
    ...fixture.visual,
    taskInputFingerprint: task.taskInputFingerprint,
  });
  const sound = buildSceneSoundPlan({
    ...fixture.sound,
    taskInputFingerprint: task.taskInputFingerprint,
  });
  const selection = buildShotRecipeSelection({
    taskInputFingerprint: task.taskInputFingerprint,
    selections: [],
  });
  const fidelityReceipt = buildNotApplicableFidelityReceipt({
    selectionFingerprint: selection.selectionFingerprint,
    reason: "empty",
  });
  const scenePackage = buildScenePackage({
    ...fixture,
    task,
    anchors,
    shots,
    visual,
    sound,
    selection,
    fidelityReceipt,
    selectedResources: [
      ...fixture.selectedResources,
      { selected: fixture.selected, descriptor: fixture.descriptor },
    ],
    current: {
      ...fixture.current,
      timingBeat: task.timingBeat,
    },
  });
  const projection = resolveSceneSound({
    scenePackage,
    soundPlan: sound,
    syncAnchors: anchors,
    resources: [{ selected: fixture.selected, descriptor: fixture.descriptor }],
  });
  assert.equal(scenePackage.scenePresetFingerprint, preset.presetFingerprint);
  assert.deepEqual(
    scenePackage.selectedResources.map(({ resourceId }) => resourceId),
    preset.resourceIds,
  );
  assert.equal(projection.beatStartFrame, 20);
  assert.equal(projection.contributions[0]?.startFrame, 56);
  const element = SceneSoundContribution({ projection });
  assert.ok(isValidElement<{ children?: ReactNode }>(element));
  const sequence = Children.toArray(element.props.children)[0];
  assert.ok(isValidElement<{ from: number }>(sequence));
  assert.equal(sequence.props.from, 76);
});

test("Scene sound fingerprint ignores visual-only package identity changes", () => {
  const fixture = createSoundRuntimeFixture();
  const visualChangedInput = {
    ...fixture.scenePackage,
    sceneVisualFingerprint: Sha256DigestSchema.parse(
      `sha256:${"9".repeat(64)}`,
    ),
  };
  const visualChangedPackage = {
    ...visualChangedInput,
    packageFingerprint: computeScenePackageFingerprint(visualChangedInput),
  };
  const changed = resolveSceneSound({
    scenePackage: visualChangedPackage,
    soundPlan: fixture.sound,
    syncAnchors: fixture.anchors,
    resources: [{ selected: fixture.selected, descriptor: fixture.descriptor }],
  });
  assert.equal(
    changed.sceneSoundProjectionFingerprint,
    fixture.projection.sceneSoundProjectionFingerprint,
  );
});

import assert from "node:assert/strict";
import { Children, isValidElement, type ReactNode } from "react";
import test from "node:test";
import { Html5Audio, Sequence } from "remotion";

import {
  Sha256DigestSchema,
  buildSceneSoundPlan,
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
      resources: [{ selected: fixture.selected, descriptor: fixture.descriptor }],
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

test("Scene sound fingerprint ignores visual-only package identity changes", () => {
  const fixture = createSoundRuntimeFixture();
  const visualChangedInput = {
    ...fixture.scenePackage,
    sceneVisualFingerprint: Sha256DigestSchema.parse(`sha256:${"9".repeat(64)}`),
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

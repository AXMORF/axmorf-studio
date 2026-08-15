import assert from "node:assert/strict";
import { Children, isValidElement, type ReactNode } from "react";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildSceneCoverageMap,
  buildSceneFallbackDeclaration,
} from "../../src/contracts";
import { SceneSoundContribution } from "../../src/remotion/runtime/scene-sound";
import {
  SoundDesignTrack,
  buildSoundDesignProjection,
} from "../../src/remotion/runtime/sound-design/SoundDesignTrack";
import { createSoundRuntimeFixture } from "../fixtures/scene/sound-runtime";

const makeSoundDesign = () => {
  const fixture = createSoundRuntimeFixture();
  const fallback = buildSceneFallbackDeclaration({
    taskInputFingerprint: `sha256:${"b".repeat(64)}`,
    meaningId: "meaning-two",
    reason: "Explicit transparent fallback.",
  });
  const coverage = buildSceneCoverageMap({
    storyId: "synthetic-proof",
    storyBeatOrder: ["meaning-one", "meaning-two"],
    packages: [fixture.scenePackage],
    fallbacks: [fallback],
    stalePackages: [],
  });
  const projection = buildSoundDesignProjection({
    storyId: "synthetic-proof",
    coverage,
    storyBeatTimings: [
      { meaningId: "meaning-one", startFrame: 20, endFrame: 140 },
      { meaningId: "meaning-two", startFrame: 140, endFrame: 180 },
    ],
    sceneSoundProjections: [fixture.projection],
  });
  return { fixture, fallback, coverage, projection };
};

test("SoundDesignTrack follows ready and fallback Beat order", () => {
  const { projection } = makeSoundDesign();
  assert.deepEqual(
    projection.entries.map((entry) => entry.status),
    ["ready", "fallback"],
  );
  const node = SoundDesignTrack({ projection });
  assert.ok(isValidElement<{ children?: ReactNode }>(node));
  const children = Children.toArray(node.props.children);
  assert.equal(
    children.filter(
      (child) => isValidElement(child) && child.type === SceneSoundContribution,
    ).length,
    1,
  );
});

test("Sound design rejects missing stale duplicate and mismatched Scene projections", () => {
  const fixture = createSoundRuntimeFixture();
  for (const coverage of [
    buildSceneCoverageMap({
      storyId: "synthetic-proof",
      storyBeatOrder: ["meaning-one"],
      packages: [],
      fallbacks: [],
      stalePackages: [],
    }),
    buildSceneCoverageMap({
      storyId: "synthetic-proof",
      storyBeatOrder: ["meaning-one"],
      packages: [],
      fallbacks: [],
      stalePackages: [
        {
          meaningId: "meaning-one",
          packageFingerprint: fixture.scenePackage.packageFingerprint,
          driftLayer: "sound-plan",
        },
      ],
    }),
  ]) {
    assert.throws(() =>
      buildSoundDesignProjection({
        storyId: "synthetic-proof",
        coverage,
        storyBeatTimings: [
          { meaningId: "meaning-one", startFrame: 20, endFrame: 140 },
        ],
        sceneSoundProjections: [fixture.projection],
      }),
    );
  }
  assert.throws(() =>
    buildSoundDesignProjection({
      storyId: "synthetic-proof",
      coverage: makeSoundDesign().coverage,
      storyBeatTimings: [
        { meaningId: "meaning-one", startFrame: 20, endFrame: 140 },
        { meaningId: "meaning-two", startFrame: 140, endFrame: 180 },
      ],
      sceneSoundProjections: [fixture.projection, fixture.projection],
    }),
  );
});

test("Scene sound runtime source owns no narrative global mix provider or network fields", async () => {
  const paths = [
    "../../src/remotion/runtime/scene-sound/resolve-scene-sound.ts",
    "../../src/remotion/runtime/scene-sound/SceneSoundContribution.tsx",
    "../../src/remotion/runtime/sound-design/SoundDesignTrack.tsx",
  ];
  const source = (
    await Promise.all(
      paths.map((path) => readFile(new URL(path, import.meta.url), "utf8")),
    )
  ).join("\n");
  for (const forbidden of [
    "NarrationAudioTrack",
    "completeAudio",
    "globalBgm",
    "crossScene",
    "ducking",
    "mastering",
    "provider",
    "fetch(",
    "node:fs",
  ]) {
    assert.equal(source.includes(forbidden), false);
  }
});

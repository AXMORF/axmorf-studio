import assert from "node:assert/strict";
import { Children, isValidElement, type ReactNode } from "react";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildProjectSoundPlan,
  buildSceneCoverageMap,
  buildSceneFallbackDeclaration,
  computeResourceDescriptorFingerprint,
} from "../../src/contracts";
import { SoundContribution } from "../../src/remotion/runtime/sound-design";
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
      (child) => isValidElement(child) && child.type === SoundContribution,
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

test("one looping background-music contribution spans narrated content but excludes silent boundaries", () => {
  const fixture = createSoundRuntimeFixture();
  const fallbacks = ["configured-intro", "meaning-two", "configured-outro"].map(
    (meaningId, index) =>
      buildSceneFallbackDeclaration({
        taskInputFingerprint: `sha256:${String(index + 3).repeat(64)}`,
        meaningId,
        reason: "Explicit transparent fallback.",
      }),
  );
  const coverage = buildSceneCoverageMap({
    storyId: "synthetic-proof",
    storyBeatOrder: [
      "configured-intro",
      "meaning-one",
      "meaning-two",
      "configured-outro",
    ],
    packages: [fixture.scenePackage],
    fallbacks,
    stalePackages: [],
  });
  const descriptor = {
    ...fixture.descriptor,
    id: "asset.synthetic-proof.background-music",
    title: "Background music",
    description: "Project-local background music.",
    useCases: ["background music"],
    tags: ["background-music", "proof"],
    mediaRole: "background-music",
    localPath: "public/projects/synthetic-proof/sound/background-music.mp3",
  } as const;
  const projectSoundPlan = buildProjectSoundPlan({
    storyId: "synthetic-proof",
    contributions: [
      {
        contributionId: "background-music",
        resourceId: descriptor.id,
        descriptorFingerprint: computeResourceDescriptorFingerprint(descriptor),
        volume: 0.15,
        loop: true,
        playbackScope: "narrated-content",
      },
    ],
  });
  const projection = buildSoundDesignProjection({
    storyId: "synthetic-proof",
    coverage,
    storyBeatTimings: [
      {
        kind: "silent-scene",
        meaningId: "configured-intro",
        startFrame: 0,
        endFrame: 20,
      },
      {
        kind: "narrated-scene",
        meaningId: "meaning-one",
        startFrame: 20,
        endFrame: 140,
      },
      {
        kind: "narrated-scene",
        meaningId: "meaning-two",
        startFrame: 140,
        endFrame: 180,
      },
      {
        kind: "silent-scene",
        meaningId: "configured-outro",
        startFrame: 180,
        endFrame: 220,
      },
    ],
    sceneSoundProjections: [fixture.projection],
    projectSoundPlan,
    projectSoundResources: [descriptor],
  });
  assert.deepEqual(
    projection.contributions.find(
      ({ contributionId }) => contributionId === "project:background-music",
    ),
    {
      contributionId: "project:background-music",
      resourceId: descriptor.id,
      publicPath: descriptor.localPath,
      checksum: descriptor.checksum,
      startFrame: 20,
      endFrame: 180,
      volume: 0.15,
      loop: true,
    },
  );
  assert.throws(
    () =>
      buildSoundDesignProjection({
        storyId: "synthetic-proof",
        coverage,
        storyBeatTimings: [
          {
            kind: "silent-scene",
            meaningId: "configured-intro",
            startFrame: 0,
            endFrame: 20,
          },
          {
            kind: "narrated-scene",
            meaningId: "meaning-one",
            startFrame: 20,
            endFrame: 140,
          },
          {
            kind: "narrated-scene",
            meaningId: "meaning-two",
            startFrame: 140,
            endFrame: 180,
          },
          {
            kind: "silent-scene",
            meaningId: "configured-outro",
            startFrame: 180,
            endFrame: 220,
          },
        ],
        sceneSoundProjections: [fixture.projection],
        projectSoundPlan,
        projectSoundResources: [
          descriptor,
          { ...descriptor, id: "asset.synthetic-proof.unselected-music" },
        ],
      }),
    /resources do not exactly match/iu,
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

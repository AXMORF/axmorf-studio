import assert from "node:assert/strict";
import { Children, isValidElement, type ReactNode } from "react";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildProjectSoundPlan,
  buildSceneCoverageMap,
  buildSceneFallbackDeclaration,
  computeResourceDescriptorFingerprint,
  computeScenePackageFingerprint,
  buildSilentScenePreset,
  StorySpecSchema,
  MeaningIdSchema,
} from "@axmorf/studio/contracts";
import { SoundContribution, resolveSceneSound } from "@axmorf/studio/remotion";
import {
  SoundDesignTrack,
  buildSoundDesignProjection,
} from "@axmorf/studio/remotion";
import { createSoundRuntimeFixture } from "../fixtures/scene/sound-runtime";
import { generateAuthoredFrameTiming } from "../../packages/studio/src/contracts/semantic-timing";
import { RenderSpecSchema } from "../../packages/studio/src/contracts/render";
import { validRenderSpec } from "../fixtures/narrative";

const makeGroupedSoundFixture = () => {
  const fixture = createSoundRuntimeFixture();
  const input = {
    ...fixture.scenePackage,
    schemaVersion: 7 as const,
    coveredMeaningIds: ["meaning-one", "meaning-two"].map((id) =>
      MeaningIdSchema.parse(id),
    ),
  };
  const scenePackage = {
    ...input,
    packageFingerprint: computeScenePackageFingerprint(input),
  };
  const projection = resolveSceneSound({
    scenePackage,
    soundPlan: fixture.sound,
    syncAnchors: fixture.anchors,
    resources: [{ selected: fixture.selected, descriptor: fixture.descriptor }],
  });
  const coverage = buildSceneCoverageMap({
    storyId: "synthetic-proof",
    storyBeatOrder: input.coveredMeaningIds,
    packages: [scenePackage],
    fallbacks: [],
    stalePackages: [],
  });
  const storyBeatTimings = [
    {
      meaningId: "meaning-one",
      kind: "narrated-scene",
      startFrame: 20,
      endFrame: 75,
    },
    {
      meaningId: "meaning-two",
      kind: "narrated-scene",
      startFrame: 75,
      endFrame: 140,
    },
  ];
  return { fixture, scenePackage, projection, coverage, storyBeatTimings };
};

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

test("multi-Beat Scene sound validates the entire owner window and plays each contribution once", () => {
  const fixture = makeGroupedSoundFixture();
  assert.deepEqual(fixture.projection.coveredMeaningIds, [
    "meaning-one",
    "meaning-two",
  ]);
  const projection = buildSoundDesignProjection({
    storyId: "synthetic-proof",
    coverage: fixture.coverage,
    storyBeatTimings: fixture.storyBeatTimings,
    sceneSoundProjections: [fixture.projection],
  });
  assert.deepEqual(
    projection.entries.map(({ meaningId }) => meaningId),
    ["meaning-one", "meaning-two"],
  );
  assert.equal(projection.contributions.length, 1);
  assert.equal(
    projection.contributions[0]?.contributionId,
    "meaning-one:pulse",
  );
  assert.equal(projection.contributions[0]?.startFrame, 76);
  assert.equal(projection.contributions[0]?.endFrame, 88);
  const node = SoundDesignTrack({ projection });
  assert.ok(isValidElement<{ children?: ReactNode }>(node));
  assert.equal(Children.toArray(node.props.children).length, 1);
});

test("multi-Beat sound rejects partial, overlapping, unordered and mismatched ownership", () => {
  const fixture = makeGroupedSoundFixture();
  for (const changed of [
    { ...fixture.projection, coveredMeaningIds: undefined },
    { ...fixture.projection, coveredMeaningIds: ["meaning-one"] },
    {
      ...fixture.projection,
      coveredMeaningIds: ["meaning-two", "meaning-one"],
    },
    {
      ...fixture.projection,
      coveredMeaningIds: ["meaning-one", "meaning-one"],
    },
    { ...fixture.projection, coveredMeaningIds: ["meaning-one", "unknown"] },
    { ...fixture.projection, beatEndFrame: 75 },
    { ...fixture.projection, beatStartFrame: 21 },
  ]) {
    assert.throws(
      () =>
        buildSoundDesignProjection({
          storyId: "synthetic-proof",
          coverage: fixture.coverage,
          storyBeatTimings: fixture.storyBeatTimings,
          sceneSoundProjections: [changed],
        }),
      /ownership do not match/u,
    );
  }
  assert.throws(
    () =>
      buildSoundDesignProjection({
        storyId: "synthetic-proof",
        coverage: fixture.coverage,
        storyBeatTimings: fixture.storyBeatTimings,
        sceneSoundProjections: [
          fixture.projection,
          { ...fixture.projection, meaningId: "meaning-two" },
        ],
      }),
    /ownership do not match/u,
  );
  assert.throws(
    () =>
      buildSoundDesignProjection({
        storyId: "synthetic-proof",
        coverage: makeSoundDesign().coverage,
        storyBeatTimings: fixture.storyBeatTimings,
        sceneSoundProjections: [fixture.projection],
      }),
    /ownership do not match/u,
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

test("authored-frame background music follows all visual content Beats and excludes template boundaries", () => {
  const fixture = makeGroupedSoundFixture();
  const visualBeat = (
    meaningId: string,
    durationInFrames: number,
    template = false,
  ) => ({
    kind: "silent-scene" as const,
    meaningId,
    narrativePurpose: "Express a visual concept.",
    preset: buildSilentScenePreset({
      presetId: meaningId,
      durationInFrames,
      visualIntent: "Continuous visual content.",
      soundIntent: "Project background music.",
      resourceIds: [],
      implementation: template
        ? {
            kind: "template-copy",
            templateId: "boundary",
            templateFingerprint: `sha256:${"a".repeat(64)}`,
            instanceFingerprint: `sha256:${"b".repeat(64)}`,
            rendererSourceFingerprint: `sha256:${"c".repeat(64)}`,
            soundCues: [],
          }
        : { kind: "scene-owner" },
    }),
  });
  const story = StorySpecSchema.parse({
    schemaVersion: 3,
    storyId: "synthetic-proof",
    title: "A visual film",
    timingSource: "authored-frames",
    beats: [
      visualBeat("configured-intro", 20, true),
      visualBeat("meaning-one", 55),
      visualBeat("meaning-two", 65),
      visualBeat("configured-outro", 40, true),
    ],
  });
  const semanticTiming = generateAuthoredFrameTiming({
    story,
    render: RenderSpecSchema.parse({
      ...validRenderSpec,
      leadInFrames: 0,
      tailFrames: 0,
    }),
  });
  const coverage = buildSceneCoverageMap({
    storyId: story.storyId,
    storyBeatOrder: story.beats.map(({ meaningId }) => meaningId),
    packages: [fixture.scenePackage],
    fallbacks: ["configured-intro", "configured-outro"].map((meaningId) =>
      buildSceneFallbackDeclaration({
        taskInputFingerprint: fixture.scenePackage.taskInputFingerprint,
        meaningId,
        reason: "Transparent boundary.",
      }),
    ),
    stalePackages: [],
  });
  const resource = {
    ...fixture.fixture.descriptor,
    id: "asset.synthetic-proof.background-music",
    mediaRole: "background-music",
    localPath: "public/projects/synthetic-proof/sound/background-music.mp3",
  } as const;
  const projectSoundPlan = buildProjectSoundPlan({
    storyId: story.storyId,
    contributions: [
      {
        contributionId: "background-music",
        resourceId: resource.id,
        descriptorFingerprint: computeResourceDescriptorFingerprint(resource),
        volume: 0.2,
        loop: true,
        playbackScope: "content-window",
      },
    ],
  });
  const input = {
    storyId: story.storyId,
    coverage,
    storyBeatTimings: semanticTiming.storyBeats,
    sceneSoundProjections: [fixture.projection],
    projectSoundPlan,
    projectSoundResources: [resource],
    semanticTiming,
  };
  const result = buildSoundDesignProjection(input);
  assert.deepEqual(
    result.contributions.map(({ contributionId, startFrame, endFrame }) => ({
      contributionId,
      startFrame,
      endFrame,
    })),
    [
      { contributionId: "meaning-one:pulse", startFrame: 76, endFrame: 88 },
      {
        contributionId: "project:background-music",
        startFrame: 20,
        endFrame: 140,
      },
    ],
  );
  assert.throws(
    () => buildSoundDesignProjection({ ...input, semanticTiming: undefined }),
    /not runtime-approved/u,
  );
  assert.throws(
    () =>
      buildSoundDesignProjection({
        ...input,
        storyBeatTimings: semanticTiming.storyBeats.map((timing) => ({
          ...timing,
          kind: "narrated-scene",
        })),
      }),
    /current Beat coverage/u,
  );
});

test("Scene sound runtime source owns no narrative global mix provider or network fields", async () => {
  const paths = [
    "../../packages/studio/src/remotion/runtime/scene-sound/resolve-scene-sound.ts",
    "../../packages/studio/src/remotion/runtime/scene-sound/SceneSoundContribution.tsx",
    "../../packages/studio/src/remotion/runtime/sound-design/SoundDesignTrack.tsx",
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

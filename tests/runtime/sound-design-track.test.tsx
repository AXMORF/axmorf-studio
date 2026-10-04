import assert from "node:assert/strict";
import { Children, isValidElement, type ReactNode } from "react";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildProjectSoundPlan,
  buildSceneCoverageMap,
  buildSceneFallbackDeclaration,
  computeResourceDescriptorFingerprint,
} from "@axmorf/studio/contracts";
import { SoundContribution } from "@axmorf/studio/remotion";
import {
  SoundDesignTrack,
  buildSoundDesignProjection,
} from "@axmorf/studio/remotion";
import { createSoundRuntimeFixture } from "../fixtures/scene/sound-runtime";
import type { SoundContributionValue } from "@axmorf/studio/remotion";

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

const contributionAudio = (contribution: SoundContributionValue) => {
  const sequence = SoundContribution({ contribution });
  assert.ok(
    isValidElement<{ durationInFrames: number; children: ReactNode }>(sequence),
  );
  const audio = sequence.props.children;
  assert.ok(
    isValidElement<{
      volume: (frame: number) => number;
      trimBefore?: number;
      loopVolumeCurveBehavior?: "repeat" | "extend";
    }>(audio),
  );
  return { durationInFrames: sequence.props.durationInFrames, ...audio.props };
};

test("a trimmed contribution uses local-frame fades with exact first and last endpoints", () => {
  const audio = contributionAudio({
    contributionId: "outro",
    publicPath: "public/projects/synthetic-proof/sound/outro.mp3",
    startFrame: 100,
    endFrame: 175,
    sourceStartFrame: 165,
    volume: 0.45,
    loop: false,
    fadeInFrames: 8,
    fadeOutFrames: 15,
  });
  assert.equal(audio.durationInFrames, 75);
  assert.equal(audio.trimBefore, 165);
  assert.equal(audio.volume(0), 0);
  assert.equal(audio.volume(7), 0.45);
  assert.equal(audio.volume(60), 0.45);
  assert.equal(audio.volume(67), 0.225);
  assert.equal(audio.volume(74), 0);
  assert.equal(audio.volume(-1), 0);
  assert.equal(audio.volume(75), 0);
  for (let frame = 0; frame < 75; frame += 1) {
    assert.ok(audio.volume(frame) >= 0 && audio.volume(frame) <= 0.45);
  }
});

test("looping music fades once across the contribution rather than restarting each source loop", () => {
  const audio = contributionAudio({
    contributionId: "background-music",
    publicPath: "public/projects/synthetic-proof/sound/music.mp3",
    startFrame: 60,
    endFrame: 810,
    volume: 0.4,
    loop: true,
    fadeInFrames: 10,
    fadeOutFrames: 15,
  });
  assert.equal(audio.loopVolumeCurveBehavior, "extend");
  assert.equal(audio.volume(0), 0);
  assert.equal(audio.volume(9), 0.4);
  assert.equal(audio.volume(240), 0.4);
  assert.equal(audio.volume(480), 0.4);
  assert.equal(audio.volume(742), 0.2);
  assert.equal(audio.volume(749), 0);
});

test("zero, one-frame and overlapping fades stay finite and preserve unspecified playback", () => {
  const contribution = {
    contributionId: "short",
    publicPath: "public/projects/synthetic-proof/sound/pulse.wav",
    startFrame: 0,
    endFrame: 1,
    volume: 0.5,
    loop: false,
  };
  const legacy = contributionAudio(contribution);
  assert.equal(Object.hasOwn(legacy, "trimBefore"), false);
  assert.equal(Object.hasOwn(legacy, "loopVolumeCurveBehavior"), false);
  assert.equal(legacy.volume(0), 0.5);
  assert.equal(
    contributionAudio({
      ...contribution,
      fadeInFrames: 0,
      fadeOutFrames: 0,
    }).volume(0),
    0.5,
  );
  for (const fades of [{ fadeInFrames: 1 }, { fadeOutFrames: 1 }]) {
    assert.equal(contributionAudio({ ...contribution, ...fades }).volume(0), 0);
  }
  const overlapping = contributionAudio({
    ...contribution,
    endFrame: 5,
    volume: 0.6,
    fadeInFrames: 4,
    fadeOutFrames: 4,
  });
  assert.deepEqual([0, 1, 2, 3, 4].map(overlapping.volume), [
    0,
    0.6 / 3,
    (0.6 * 2) / 3,
    0.6 / 3,
    0,
  ]);
});

test("runtime rejects unsafe source ranges and fades longer than a contribution", () => {
  const contribution = {
    contributionId: "bounded",
    publicPath: "public/projects/synthetic-proof/sound/pulse.wav",
    startFrame: 0,
    endFrame: 12,
    volume: 0.5,
    loop: false,
  };
  for (const field of [
    "sourceStartFrame",
    "fadeInFrames",
    "fadeOutFrames",
  ] as const) {
    for (const value of [-1, 0.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(
        () =>
          SoundContribution({
            contribution: { ...contribution, [field]: value },
          }),
        /runtime-safe/u,
      );
    }
  }
  for (const options of [
    { sourceStartFrame: Number.MAX_SAFE_INTEGER },
    { fadeInFrames: 13 },
    { fadeOutFrames: 13 },
  ]) {
    assert.throws(
      () =>
        SoundContribution({ contribution: { ...contribution, ...options } }),
      /runtime-safe/u,
    );
  }
});

test("Project music projects optional fades, fingerprints their changes and rejects oversized ramps", () => {
  const { descriptor: cue } = createSoundRuntimeFixture();
  const descriptor = {
    ...cue,
    id: "asset.synthetic-proof.background-music",
    mediaRole: "background-music",
  } as const;
  const { coverage, fixture } = makeSoundDesign();
  const contribution = {
    contributionId: "background-music",
    resourceId: descriptor.id,
    descriptorFingerprint: computeResourceDescriptorFingerprint(descriptor),
    volume: 0.4,
    loop: true,
    playbackScope: "narrated-content",
  };
  const legacy = buildProjectSoundPlan({
    storyId: "synthetic-proof",
    contributions: [contribution],
  });
  const faded = buildProjectSoundPlan({
    storyId: "synthetic-proof",
    contributions: [{ ...contribution, fadeInFrames: 10, fadeOutFrames: 15 }],
  });
  assert.notEqual(faded.soundPlanFingerprint, legacy.soundPlanFingerprint);
  const project = (projectSoundPlan: unknown) =>
    buildSoundDesignProjection({
      storyId: "synthetic-proof",
      coverage,
      storyBeatTimings: [
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
      ],
      sceneSoundProjections: [fixture.projection],
      projectSoundPlan,
      projectSoundResources: [descriptor],
    });
  const projection = project(faded);
  const music = projection.contributions.at(-1);
  assert.ok(music);
  assert.equal(music.startFrame, 20);
  assert.equal(music.endFrame, 180);
  assert.equal(music.fadeInFrames, 10);
  assert.equal(music.fadeOutFrames, 15);
  assert.notEqual(
    projection.soundDesignProjectionFingerprint,
    project(legacy).soundDesignProjectionFingerprint,
  );
  assert.equal(Object.hasOwn(legacy.contributions[0], "fadeInFrames"), false);
  assert.equal(
    Object.hasOwn(project(legacy).contributions.at(-1)!, "fadeOutFrames"),
    false,
  );
  for (const field of ["fadeInFrames", "fadeOutFrames"] as const) {
    for (const value of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(() =>
        buildProjectSoundPlan({
          storyId: "synthetic-proof",
          contributions: [{ ...contribution, [field]: value }],
        }),
      );
    }
    assert.throws(
      () =>
        project(
          buildProjectSoundPlan({
            storyId: "synthetic-proof",
            contributions: [{ ...contribution, [field]: 161 }],
          }),
        ),
      /runtime-safe/u,
    );
  }
});

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

test("visual background music spans content without leaking into boundary templates", () => {
  const { descriptor: sound } = createSoundRuntimeFixture();
  const descriptor = {
    ...sound,
    id: "asset.synthetic-proof.background-music",
    mediaRole: "background-music",
  } as const;
  const meaningIds = ["intro", "visual-one", "visual-two", "outro"];
  const coverage = buildSceneCoverageMap({
    storyId: "synthetic-proof",
    storyBeatOrder: meaningIds,
    packages: [],
    stalePackages: [],
    fallbacks: meaningIds.map((meaningId) =>
      buildSceneFallbackDeclaration({
        taskInputFingerprint: `sha256:${"b".repeat(64)}`,
        meaningId,
        reason: "Transparent test Scene.",
      }),
    ),
  });
  const timings = [
    { kind: "silent-scene", meaningId: "intro", startFrame: 0, endFrame: 20 },
    {
      kind: "visual-scene",
      meaningId: "visual-one",
      startFrame: 20,
      endFrame: 140,
    },
    {
      kind: "visual-scene",
      meaningId: "visual-two",
      startFrame: 140,
      endFrame: 180,
    },
    {
      kind: "silent-scene",
      meaningId: "outro",
      startFrame: 180,
      endFrame: 220,
    },
  ];
  const projectSoundPlan = buildProjectSoundPlan({
    storyId: "synthetic-proof",
    contributions: [
      {
        contributionId: "background-music",
        resourceId: descriptor.id,
        descriptorFingerprint: computeResourceDescriptorFingerprint(descriptor),
        volume: 0.15,
        loop: true,
        playbackScope: "content",
      },
    ],
  });
  const projection = buildSoundDesignProjection({
    storyId: "synthetic-proof",
    coverage,
    storyBeatTimings: timings,
    sceneSoundProjections: [],
    projectSoundPlan,
    projectSoundResources: [descriptor],
  });
  assert.equal(projection.contributions.length, 1);
  assert.equal(projection.contributions[0].startFrame, 20);
  assert.equal(projection.contributions[0].endFrame, 180);
  assert.throws(
    () =>
      buildSoundDesignProjection({
        storyId: "synthetic-proof",
        coverage,
        storyBeatTimings: timings,
        sceneSoundProjections: [],
        projectSoundPlan: buildProjectSoundPlan({
          storyId: "synthetic-proof",
          contributions: [
            {
              ...projectSoundPlan.contributions[0],
              playbackScope: "narrated-content",
            },
          ],
        }),
        projectSoundResources: [descriptor],
      }),
    /not runtime-approved/u,
  );
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Children, isValidElement, type ReactNode } from "react";
import test from "node:test";
import { Sequence } from "remotion";

import {
  ScenePackageSchema,
  Sha256DigestSchema,
  buildSceneCoverageMap,
  buildSceneFallbackDeclaration,
  computeScenePackageFingerprint,
} from "../../src/contracts";
import {
  SceneSlot,
  resolveSceneRenderer,
} from "../../src/remotion/runtime/story-visual/SceneSlot";
import {
  StoryVisualTrack,
  buildStoryVisualProjection,
} from "../../src/remotion/runtime/story-visual/StoryVisualTrack";
import type { SceneRendererProps } from "../../src/remotion/runtime/story-visual/types";
import { buildScenePackage } from "../../scripts/scene-package/domain";
import { createM6PackageInput } from "../fixtures/scene/m6-package-input";

type ElementProps = {
  readonly from?: number;
  readonly durationInFrames?: number;
  readonly children?: ReactNode;
};

const makeProjection = () => {
  const scenePackage = buildScenePackage(createM6PackageInput());
  const fallback = buildSceneFallbackDeclaration({
    taskInputFingerprint: `sha256:${"b".repeat(64)}`,
    meaningId: "meaning-two",
    reason: "Explicit transparent fallback.",
  });
  const coverage = buildSceneCoverageMap({
    storyId: "synthetic-proof",
    storyBeatOrder: ["meaning-one", "meaning-two"],
    packages: [scenePackage],
    fallbacks: [fallback],
    stalePackages: [],
  });
  const projection = buildStoryVisualProjection({
    storyId: "synthetic-proof",
    leadInFrames: 20,
    tailFrames: 10,
    durationInFrames: 190,
    storyBeatTimings: [
      { meaningId: "meaning-one", startFrame: 20, endFrame: 140 },
      { meaningId: "meaning-two", startFrame: 140, endFrame: 180 },
    ],
    coverage,
    packages: [scenePackage],
    registryFingerprint: `sha256:${"c".repeat(64)}`,
    transitions: [
      {
        fromMeaningId: "meaning-one",
        toMeaningId: "meaning-two",
        kind: "hard-cut",
        durationInFrames: 0,
      },
    ],
  });
  return { scenePackage, fallback, coverage, projection };
};

test("Story visual projection is ordered fixed-duration and rejects missing stale gaps and overlaps", () => {
  const fixture = makeProjection();
  assert.deepEqual(
    fixture.projection.entries.map((entry) => entry.status),
    ["ready", "fallback"],
  );
  assert.equal(fixture.projection.durationInFrames, 190);
  for (const mutation of [
    {
      storyBeatTimings: [
        { meaningId: "meaning-one", startFrame: 20, endFrame: 140 },
        { meaningId: "meaning-two", startFrame: 141, endFrame: 180 },
      ],
    },
    {
      storyBeatTimings: [
        { meaningId: "meaning-two", startFrame: 20, endFrame: 60 },
        { meaningId: "meaning-one", startFrame: 60, endFrame: 180 },
      ],
    },
    { durationInFrames: 191 },
    {
      coverage: buildSceneCoverageMap({
        storyId: "synthetic-proof",
        storyBeatOrder: ["meaning-one", "meaning-two"],
        packages: [fixture.scenePackage],
        fallbacks: [],
        stalePackages: [],
      }),
    },
  ]) {
    assert.throws(() =>
      buildStoryVisualProjection({
        storyId: "synthetic-proof",
        leadInFrames: 20,
        tailFrames: 10,
        durationInFrames: 190,
        storyBeatTimings: [
          { meaningId: "meaning-one", startFrame: 20, endFrame: 140 },
          { meaningId: "meaning-two", startFrame: 140, endFrame: 180 },
        ],
        coverage: fixture.coverage,
        packages: [fixture.scenePackage],
        registryFingerprint: `sha256:${"c".repeat(64)}`,
        transitions: fixture.projection.transitions,
        ...mutation,
      }),
    );
  }
});

test("SceneSlot owns the exact Beat Sequence and resolves one current renderer", () => {
  const { projection } = makeProjection();
  const entry = projection.entries[0];
  assert.equal(entry.status, "ready");
  const Renderer = () => <div />;
  const registry = { [entry.rendererId]: Renderer };
  assert.equal(resolveSceneRenderer(registry, entry.rendererId), Renderer);
  assert.throws(() => resolveSceneRenderer(registry, "unknown"));
  const element = SceneSlot({
    entry,
    registry,
    rendererProps: {} as Omit<SceneRendererProps, "sceneFrame">,
  });
  assert.ok(isValidElement<ElementProps>(element));
  assert.equal(element.type, Sequence);
  assert.equal(element.props.from, 20);
  assert.equal(element.props.durationInFrames, 120);
});

test("v3 SceneSlot keeps boundary policy internal to the mount", () => {
  const { projection } = makeProjection();
  const entry = projection.entries[0];
  assert.equal(entry.status, "ready");
  const Renderer = () => <div />;
  const policy = {
    ...({} as NonNullable<SceneRendererProps["readabilityPolicy"]>),
    policyId: "production-readability-v1" as const,
    policyFingerprint: `sha256:${"d".repeat(64)}`,
    width: 1080,
    height: 1920,
    typographyPolicy: { minFontSizePx: 36 },
    sceneContentSafeAreaPx: { top: 90, right: 90, bottom: 360, left: 90 },
  };
  const element = SceneSlot({
    entry,
    registry: { [entry.rendererId]: Renderer },
    rendererProps: {
      durationInFrames: 120,
      sceneBoundaryVersion: "scene-composition-boundary-v1",
      readabilityPolicy: policy,
    } as Omit<SceneRendererProps, "sceneFrame">,
  });
  assert.ok(isValidElement<ElementProps>(element));
  assert.equal(Children.count(element.props.children), 1);
});

test("StoryVisualTrack mounts ready SceneSlot only and sound-only identity changes do not alter projection", () => {
  const fixture = makeProjection();
  const Renderer = () => <div />;
  const node = StoryVisualTrack({
    projection: fixture.projection,
    registry: {
      [fixture.scenePackage.rendererBinding.rendererId]: Renderer,
    },
    rendererPropsByMeaning: {
      "meaning-one": {} as Omit<SceneRendererProps, "sceneFrame">,
    },
  });
  assert.ok(isValidElement<{ children?: ReactNode }>(node));
  const children = Children.toArray(node.props.children);
  assert.equal(
    children.filter(
      (child) => isValidElement(child) && child.type === SceneSlot,
    ).length,
    1,
  );

  const soundChangedInput = {
    ...fixture.scenePackage,
    sceneSoundFingerprint: Sha256DigestSchema.parse(
      `sha256:${"d".repeat(64)}`,
    ),
  };
  const soundChanged = ScenePackageSchema.parse({
    ...soundChangedInput,
    packageFingerprint: computeScenePackageFingerprint(soundChangedInput),
  });
  const soundCoverage = buildSceneCoverageMap({
    storyId: "synthetic-proof",
    storyBeatOrder: ["meaning-one", "meaning-two"],
    packages: [soundChanged],
    fallbacks: [fixture.fallback],
    stalePackages: [],
  });
  const soundProjection = buildStoryVisualProjection({
    storyId: "synthetic-proof",
    leadInFrames: 20,
    tailFrames: 10,
    durationInFrames: 190,
    storyBeatTimings: fixture.projection.storyBeatTimings,
    coverage: soundCoverage,
    packages: [soundChanged],
    registryFingerprint: fixture.projection.registryFingerprint,
    transitions: fixture.projection.transitions,
  });
  assert.equal(
    soundProjection.projectionFingerprint,
    fixture.projection.projectionFingerprint,
  );
});

test("visual runtime source has no sound caption filesystem network or authored loader", async () => {
  const paths = [
    "../../src/remotion/runtime/story-visual/SceneSlot.tsx",
    "../../src/remotion/runtime/story-visual/StoryVisualTrack.tsx",
  ];
  const source = (
    await Promise.all(
      paths.map((path) => readFile(new URL(path, import.meta.url), "utf8")),
    )
  ).join("\n");
  for (const forbidden of [
    "<Audio",
    "CaptionLayer",
    "NarrationAudioTrack",
    "node:fs",
    "fetch(",
    "animation:",
    "transition:",
    "import(",
  ]) {
    assert.equal(source.includes(forbidden), false);
  }
});

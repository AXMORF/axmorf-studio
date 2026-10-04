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
  resolveSceneReadabilityPolicy,
  buildSilentScenePreset,
} from "@axmorf/studio/contracts";
import {
  renderSceneRendererMount,
  SceneSlot,
  resolveSceneRenderer,
} from "@axmorf/studio/remotion";
import {
  StoryVisualTrack,
  buildStoryVisualProjection,
} from "@axmorf/studio/remotion";
import { SceneViewport } from "@axmorf/studio/remotion";
import type {
  SceneRendererMountProps,
  SceneRendererProps,
} from "@axmorf/studio/remotion";
import { buildScenePackage } from "../../scripts/scene-package/domain";
import { createScenePackageInput } from "../fixtures/scene/package-input";

type ElementProps = {
  readonly from?: number;
  readonly durationInFrames?: number;
  readonly children?: ReactNode;
};

type AssertFalse<Value extends false> = Value;
type AssertTrue<Value extends true> = Value;

const rendererBoundaryIsExcluded: AssertFalse<
  "sceneBoundaryVersion" extends keyof SceneRendererProps ? true : false
> = false;
const rendererPolicyIsExcluded: AssertFalse<
  "readabilityPolicy" extends keyof SceneRendererProps ? true : false
> = false;
const rendererCompositionWidthIsExcluded: AssertFalse<
  "width" extends keyof SceneRendererProps ? true : false
> = false;
const rendererViewportIsIncluded: AssertTrue<
  "viewportWidth" extends keyof SceneRendererProps ? true : false
> = true;
const mountBoundaryIsIncluded: AssertTrue<
  "sceneBoundaryVersion" extends keyof SceneRendererMountProps ? true : false
> = true;

const makeProjection = () => {
  const scenePackage = buildScenePackage(createScenePackageInput());
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
  const policy = resolveSceneReadabilityPolicy({
    width: 1080,
    height: 1920,
  });
  assert.equal(resolveSceneRenderer(registry, entry.rendererId), Renderer);
  assert.throws(() => resolveSceneRenderer(registry, "unknown"));
  const element = SceneSlot({
    entry,
    registry,
    rendererProps: {
      durationInFrames: 120,
      sceneBoundaryVersion: "scene-composition-boundary-v2",
      readabilityPolicy: policy,
    } as SceneRendererMountProps,
  });
  assert.ok(isValidElement<ElementProps>(element));
  assert.equal(element.type, Sequence);
  assert.equal(element.props.from, 20);
  assert.equal(element.props.durationInFrames, 120);
});

test("current SceneSlot keeps boundary policy internal to the mount", () => {
  const { projection } = makeProjection();
  const entry = projection.entries[0];
  assert.equal(entry.status, "ready");
  const Renderer = () => <div />;
  const policy = resolveSceneReadabilityPolicy({
    width: 1080,
    height: 1920,
  });
  const element = SceneSlot({
    entry,
    registry: { [entry.rendererId]: Renderer },
    rendererProps: {
      durationInFrames: 120,
      sceneBoundaryVersion: "scene-composition-boundary-v2",
      readabilityPolicy: policy,
    } as SceneRendererMountProps,
  });
  assert.ok(isValidElement<ElementProps>(element));
  assert.equal(Children.count(element.props.children), 1);
});

test("template playback changes the source clock while keeping the 75-frame Beat and viewport", () => {
  const preset = buildSilentScenePreset({
    presetId: "short-outro",
    durationInFrames: 75,
    visualIntent: "Keep the brand ending.",
    soundIntent: "Play the matching excerpt.",
    resourceIds: [],
    implementation: {
      kind: "template-copy",
      templateId: "brand-ending",
      templateFingerprint: `sha256:${"a".repeat(64)}`,
      instanceFingerprint: `sha256:${"b".repeat(64)}`,
      rendererSourceFingerprint: `sha256:${"c".repeat(64)}`,
      soundCues: [],
      playbackWindow: {
        sourceDurationInFrames: 240,
        startFrame: 165,
        endFrame: 240,
      },
    },
  });
  const policy = resolveSceneReadabilityPolicy({ width: 1080, height: 1920 });
  const Renderer = () => <div />;
  const rendererProps = {
    durationInFrames: 75,
    sceneBoundaryVersion: "scene-composition-boundary-v2",
    readabilityPolicy: policy,
    storyBeat: {
      kind: "silent-scene",
      meaningId: "outro",
      narrativePurpose: "Brand ending.",
      preset,
    },
  } as SceneRendererMountProps;
  for (const localFrame of [0, 37, 74]) {
    const mounted = renderSceneRendererMount(
      Renderer,
      rendererProps,
      localFrame,
    );
    assert.ok(isValidElement<{ children: ReactNode }>(mounted));
    assert.ok(isValidElement<SceneRendererProps>(mounted.props.children));
    assert.equal(mounted.props.children.props.sceneFrame, 165 + localFrame);
    assert.equal(mounted.props.children.props.durationInFrames, 75);
    assert.equal(mounted.props.children.props.viewportWidth, 900);
  }
});

test("Scene renderer and mount props enforce the current ownership boundary", () => {
  assert.equal(rendererBoundaryIsExcluded, false);
  assert.equal(rendererPolicyIsExcluded, false);
  assert.equal(rendererCompositionWidthIsExcluded, false);
  assert.equal(rendererViewportIsIncluded, true);
  assert.equal(mountBoundaryIsIncluded, true);
  const Renderer = () => <div />;
  const policy = resolveSceneReadabilityPolicy({
    width: 1080,
    height: 1920,
  });
  const current = renderSceneRendererMount(
    Renderer,
    {
      durationInFrames: 120,
      sceneBoundaryVersion: "scene-composition-boundary-v2",
      readabilityPolicy: policy,
      continuity: {
        incoming: null,
        outgoing: { kind: "motivated-cut", reason: "New causal question." },
      },
    } as SceneRendererMountProps,
    6,
  );
  assert.ok(
    isValidElement<{
      readonly policy: typeof policy;
      readonly children: ReactNode;
    }>(current),
  );
  assert.equal(current.type, SceneViewport);
  assert.equal(current.props.policy, policy);
  assert.ok(isValidElement<SceneRendererProps>(current.props.children));
  assert.equal(current.props.children.type, Renderer);
  assert.equal(current.props.children.props.sceneFrame, 6);
  assert.equal(current.props.children.props.viewportWidth, 900);
  assert.equal(current.props.children.props.viewportHeight, 1470);
  assert.deepEqual(current.props.children.props.continuity, {
    incoming: null,
    outgoing: { kind: "motivated-cut", reason: "New causal question." },
  });
  assert.equal(
    (current.props.children.props as Readonly<Record<string, unknown>>)
      .readabilityPolicy,
    undefined,
  );
  assert.equal(
    (current.props.children.props as Readonly<Record<string, unknown>>)
      .sceneBoundaryVersion,
    undefined,
  );

  assert.throws(
    () =>
      renderSceneRendererMount(
        Renderer,
        {
          durationInFrames: 120,
          sceneBoundaryVersion: "stale-boundary",
          readabilityPolicy: policy,
        } as unknown as SceneRendererMountProps,
        7,
      ),
    /current Scene boundary/u,
  );
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
      "meaning-one": {
        durationInFrames: 120,
        sceneBoundaryVersion: "scene-composition-boundary-v2",
        readabilityPolicy: resolveSceneReadabilityPolicy({
          width: 1080,
          height: 1920,
        }),
      } as SceneRendererMountProps,
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
    sceneSoundFingerprint: Sha256DigestSchema.parse(`sha256:${"d".repeat(64)}`),
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
    "../../packages/studio/src/remotion/runtime/story-visual/SceneSlot.tsx",
    "../../packages/studio/src/remotion/runtime/story-visual/StoryVisualTrack.tsx",
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
